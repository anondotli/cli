import { Command } from "commander";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { requireAuth, apiFetch, apiRawFetch } from "../lib/api.js";
import { fetchPlanInfo, assertFeature, assertStorageLimit, warnExpiryCap } from "../lib/limits.js";
import { getBaseUrl } from "../lib/config.js";
import * as crypto from "../lib/crypto.js";
import { unlockVault, wrapDropKeyWithVault, type UnlockedVault } from "../lib/vault.js";
import * as ui from "../lib/ui.js";
import { lookup } from "mime-types";
import type {
  CreateDropResponse,
  AddFileResponse,
} from "../types/api.js";

interface FileEntry {
  absolutePath: string;
  relativeName: string;
  size: number;
  tmpFile?: boolean; // true if this is a temp file to clean up
}

function collectFiles(inputPath: string): FileEntry[] {
  const stat = fs.statSync(inputPath);

  if (stat.isFile()) {
    return [
      {
        absolutePath: inputPath,
        relativeName: path.basename(inputPath),
        size: stat.size,
      },
    ];
  }

  if (stat.isDirectory()) {
    const entries: FileEntry[] = [];
    const walk = (dir: string, prefix: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isFile()) {
          entries.push({
            absolutePath: fullPath,
            relativeName: relPath,
            size: fs.statSync(fullPath).size,
          });
        } else if (entry.isDirectory()) {
          walk(fullPath, relPath);
        }
      }
    };
    walk(inputPath, "");
    return entries;
  }

  throw new Error(`${inputPath} is not a file or directory`);
}

// S2: Simple password entropy estimate
function checkPasswordStrength(password: string): void {
  if (password.length < 12) {
    ui.warn(`Password is short (${password.length} chars). At least 12 characters recommended.`);
    return;
  }
  const uniqueChars = new Set(password).size;
  const entropy = password.length * Math.log2(Math.max(uniqueChars, 2));
  if (entropy < 40) {
    ui.warn("Password may be weak (low entropy). Consider a longer, more varied passphrase.");
  }
}

async function uploadEncryptedChunk(
  presignedUrl: string,
  encrypted: ArrayBuffer
): Promise<Response> {
  let url = presignedUrl;
  const headers: Record<string, string> = {};

  if (url.includes("/relay/") && url.includes("?")) {
    const splitIndex = url.indexOf("?");
    headers["X-Relay-Query"] = url.slice(splitIndex + 1);
    url = url.slice(0, splitIndex);
  }

  return apiRawFetch(url, {
    method: "PUT",
    headers,
    body: new Uint8Array(encrypted),
  });
}

export const dropUploadCommand = new Command("upload")
  .argument("[path]", "File or folder to upload (omit to read from stdin)")
  .description("Create an encrypted drop")
  .option("-t, --title <title>", "Drop title")
  .option("-m, --message <message>", "Drop message")
  .option("-e, --expiry <days>", "Expiry in days", parseInt)
  .option("-n, --max-downloads <n>", "Max download count", parseInt)
  .option("-p, --password <password>", "Password-protect the drop")
  .option("--name <filename>", "Filename when reading from stdin")
  .option("--hide-branding", "Hide anon.li branding on download page")
  .option("--notify", "Send email notification when files are downloaded")
  .option("--no-vault", "Do not store the drop key in your vault")
  .action(async (inputPath: string | undefined, options: {
    title?: string;
    message?: string;
    expiry?: number;
    maxDownloads?: number;
    password?: string;
    name?: string;
    hideBranding?: boolean;
    notify?: boolean;
    vault?: boolean;
  }) => {
    requireAuth();

    let files: FileEntry[];
    let stdinTmpFile: string | undefined;

    // F4: Stdin upload support
    if (!inputPath) {
      if (process.stdin.isTTY) {
        ui.error("No path provided. Provide a file/folder path, or pipe data via stdin.");
        process.exit(1);
      }
      if (!options.name) {
        ui.error("--name <filename> is required when uploading from stdin.");
        process.exit(1);
      }

      const spin = ui.spinner("Reading from stdin...");
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
      }
      const data = Buffer.concat(chunks);
      spin.stop();

      stdinTmpFile = path.join(os.tmpdir(), `anonli-stdin-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      fs.writeFileSync(stdinTmpFile, data, { mode: 0o600 });
      files = [{
        absolutePath: stdinTmpFile,
        relativeName: options.name,
        size: data.length,
        tmpFile: true,
      }];
    } else {
      const resolved = path.resolve(inputPath);
      if (!fs.existsSync(resolved)) {
        ui.error(`Path not found: ${resolved}`);
        process.exit(1);
      }
      files = collectFiles(resolved);
    }

    if (files.length === 0) {
      ui.error("No files found.");
      process.exit(1);
    }

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    ui.info(
      `${files.length} file(s), ${ui.formatBytes(totalSize)} total`
    );

    // S2: Warn about weak password before expensive operations
    if (options.password) {
      checkPasswordStrength(options.password);
    }

    // Check plan limits before starting expensive encryption
    const limitSpin = ui.spinner("Checking plan limits...");
    const plan = await fetchPlanInfo();
    limitSpin.stop();

    if (options.hideBranding) {
      assertFeature(plan.features, "noBranding", "--hide-branding");
    }
    if (options.notify) {
      assertFeature(plan.features, "downloadNotifications", "--notify");
    }
    if (options.password) {
      assertFeature(plan.features, "customKey", "--password");
    }
    assertStorageLimit(totalSize, plan.storage.used, plan.storage.limit);
    if (options.expiry) {
      options.expiry = warnExpiryCap(options.expiry, plan.limits.max_expiry_days);
    }

    const useVault = options.vault !== false;
    try {
      let vault: UnlockedVault | null = null;
      if (useVault) {
        ui.info("Unlock your vault to store the drop recovery key.");
        vault = await unlockVault();
      }

      // 1. Generate encryption context
      const ctx = await crypto.createEncryptionContext();
      const { key, keyString, baseIv, ivString } = ctx;
      const wrappedOwnerKey = vault
        ? await wrapDropKeyWithVault(keyString, vault)
        : undefined;

      // 2. Handle password protection
      let customKey = false;
      let salt: string | undefined;
      let customKeyData: string | undefined;
      let customKeyIv: string | undefined;

      if (options.password) {
        const protection = await crypto.encryptKeyWithPassword(
          keyString,
          options.password
        );
        customKey = true;
        salt = protection.salt;
        customKeyData = protection.encryptedKey;
        customKeyIv = protection.iv;
      }

      // 3. Encrypt title/message
      let encryptedTitle: string | undefined;
      let encryptedMessage: string | undefined;

      if (options.title) {
        encryptedTitle = await crypto.encryptFilename(
          options.title,
          key,
          baseIv
        );
      }
      if (options.message) {
        encryptedMessage = await crypto.encryptFilename(
          options.message,
          key,
          baseIv
        );
      }

      // 4. Create drop
      const createSpin = ui.spinner("Creating drop...");
      const createRes = await apiFetch("/api/v1/drop", {
        method: "POST",
        body: JSON.stringify({
          iv: ivString,
          fileCount: files.length,
          ...(encryptedTitle && { encryptedTitle }),
          ...(encryptedMessage && { encryptedMessage }),
          ...(options.expiry && { expiry: options.expiry }),
          ...(options.maxDownloads && { maxDownloads: options.maxDownloads }),
          ...(options.hideBranding && { hideBranding: true }),
          ...(options.notify && { notifyOnDownload: true }),
          ...(vault && wrappedOwnerKey && {
            ownerKey: {
              wrappedKey: wrappedOwnerKey,
              vaultId: vault.vaultId,
              vaultGeneration: vault.vaultGeneration,
            },
          }),
          ...(customKey && {
            customKey: true,
            salt,
            customKeyData,
            customKeyIv,
          }),
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        createSpin.fail("Failed to create drop");
        ui.error(
          (err as { error?: { message?: string } })?.error?.message ||
            (err as { error?: string })?.error ||
            "Unknown error"
        );
        process.exit(1);
      }

      const createData = (await createRes.json()) as {
        data: CreateDropResponse;
      };
      const { drop_id: dropId, owner_key_stored: ownerKeyStored } = createData.data;
      createSpin.succeed(`Drop created: ${dropId}`);

      // 5. Upload each file
      const fileChunkRecords: {
        fileId: string;
        chunks: { chunkIndex: number; etag: string }[];
      }[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const { chunkSize, chunkCount } = crypto.getChunkParams(file.size);
        const encryptedSize = crypto.calculateEncryptedSize(
          file.size,
          chunkSize
        );

        const fileIvString = crypto.generateFileIv();
        const fileIv = new Uint8Array(crypto.base64UrlToArrayBuffer(fileIvString));

        // Encrypt filename
        const encryptedName = await crypto.encryptFilename(
          file.relativeName,
          key,
          fileIv
        );

        // Add file to drop
        const addRes = await apiFetch(`/api/v1/drop/${dropId}/file`, {
          method: "POST",
          body: JSON.stringify({
            size: encryptedSize,
            encryptedName,
            iv: fileIvString,
            mimeType: lookup(file.absolutePath) || "application/octet-stream",
            chunkCount,
            chunkSize,
          }),
        });

        if (!addRes.ok) {
          const err = await addRes.json().catch(() => ({}));
          ui.error(
            `Failed to add file ${file.relativeName}: ${
              (err as { error?: string })?.error || "Unknown error"
            }`
          );
          process.exit(1);
        }

        const addData = (await addRes.json()) as AddFileResponse;
        const { fileId, uploadUrls } = addData;

        // U5: Progress bar label shows file name and chunk progress
        const bar = ui.progressBar(
          chunkCount,
          `${files.length > 1 ? `[${i + 1}/${files.length}] ` : ""}${file.relativeName}`
        );
        const chunks: { chunkIndex: number; etag: string }[] = [];

        const concurrency = crypto.getConcurrency(file.size);
        const fd = fs.openSync(file.absolutePath, "r");

        try {
          let nextChunk = 0;

          async function processChunk(
            chunkIndex: number
          ): Promise<void> {
            const start = chunkIndex * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const length = end - start;

            const buffer = Buffer.alloc(length);
            fs.readSync(fd, buffer, 0, length, start);

            const encrypted = await crypto.encryptChunk(
              buffer.buffer.slice(
                buffer.byteOffset,
                buffer.byteOffset + buffer.byteLength
              ),
              key,
              fileIv,
              chunkIndex
            );

            const presignedUrl = uploadUrls[String(chunkIndex + 1)];

            const uploadRes = await uploadEncryptedChunk(presignedUrl, encrypted);

            if (!uploadRes.ok) {
              throw new Error(
                `Failed to upload chunk ${chunkIndex} of ${file.relativeName}`
              );
            }

            const etag = uploadRes.headers.get("ETag") || "";
            chunks.push({ chunkIndex, etag });
            bar.increment();
          }

          let firstError: Error | null = null;
          const running: Promise<void>[] = [];
          while (nextChunk < chunkCount && !firstError) {
            while (running.length < concurrency && nextChunk < chunkCount && !firstError) {
              const idx = nextChunk++;
              const p = processChunk(idx)
                .then(() => {
                  running.splice(running.indexOf(p), 1);
                })
                .catch((err) => {
                  firstError = err instanceof Error ? err : new Error(String(err));
                  running.splice(running.indexOf(p), 1);
                });
              running.push(p);
            }
            if (running.length > 0) {
              await Promise.race(running);
            }
          }
          if (running.length > 0) {
            await Promise.allSettled(running);
          }
          if (firstError) {
            throw firstError;
          }
        } finally {
          fs.closeSync(fd);
        }
        bar.stop();

        chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
        fileChunkRecords.push({ fileId, chunks });
      }

      // 6. Finalize drop
      const finishSpin = ui.spinner("Finalizing drop...");
      const finishRes = await apiFetch(
        `/api/v1/drop/${dropId}?action=finish`,
        {
          method: "PATCH",
          body: JSON.stringify({
            files: fileChunkRecords,
          }),
        }
      );

      if (!finishRes.ok) {
        const err = await finishRes.json().catch(() => ({}));
        finishSpin.fail("Failed to finalize drop");
        ui.error(
          (err as { error?: string })?.error || "Unknown error"
        );
        process.exit(1);
      }

      finishSpin.stop();

      // 7. Build share URL (U6: clickable terminal link)
      const baseUrl = getBaseUrl();
      const shareUrl = customKey
        ? `${baseUrl}/d/${dropId}`
        : `${baseUrl}/d/${dropId}#${keyString}`;

      const boxLines = [
        `${ui.c.secondary("URL:")}   ${ui.link(shareUrl)}`,
        `${ui.c.secondary("Files:")} ${ui.c.primary(String(files.length))}`,
        `${ui.c.secondary("Size:")}  ${ui.c.primary(ui.formatBytes(totalSize))}`,
      ];
      if (options.expiry) {
        boxLines.push(`${ui.c.secondary("Expiry:")} ${ui.c.primary(String(options.expiry))} days`);
      }
      if (options.maxDownloads) {
        boxLines.push(`${ui.c.secondary("Max downloads:")} ${ui.c.primary(String(options.maxDownloads))}`);
      }
      if (options.hideBranding) {
        boxLines.push(`${ui.c.secondary("Branding:")} ${ui.c.muted("hidden")}`);
      }
      if (options.notify) {
        boxLines.push(`${ui.c.secondary("Notifications:")} ${ui.c.accent("enabled")}`);
      }
      boxLines.push(`${ui.c.secondary("Vault:")} ${ownerKeyStored ? ui.c.success("owner key stored") : ui.c.muted("not stored")}`);

      ui.successBox("Drop Created", boxLines.join("\n"));
      ui.spacer();
      if (!customKey) {
        ui.warn(
          "Save this URL — the key after # is required to decrypt."
        );
      } else {
        ui.info("Password-protected. Share the URL and password separately.");
      }
      if (!useVault) {
        ui.warn("Vault storage disabled. The dashboard cannot recover this drop key.");
      } else if (!ownerKeyStored) {
        ui.warn("The API did not confirm vault owner-key storage for this drop.");
      }
    } catch (err) {
      ui.error(err instanceof Error ? err.message : "Upload failed");
      process.exit(1);
    } finally {
      // F4: Clean up stdin temp file
      if (stdinTmpFile) {
        try { fs.unlinkSync(stdinTmpFile); } catch { /* ignore */ }
      }
    }
  });
