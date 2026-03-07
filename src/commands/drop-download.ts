import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import * as crypto from "../lib/crypto.js";
import * as ui from "../lib/ui.js";
import { AUTH_TAG_SIZE, MIN_CHUNK_SIZE } from "../lib/constants.js";
import { EXIT_NOT_FOUND } from "../lib/errors.js";
import type { DropMetadata } from "../types/api.js";
import { getBaseUrl } from "../lib/config.js";
import { parseDropIdentifier } from "../lib/drop-url.js";

function sanitizeFilename(name: string): string {
  return name
    .replace(/\.\.[/\\]/g, "")
    .replace(/\0/g, "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .slice(0, 200) || "unnamed_file";
}

// B2: resolve output path handling file collisions
function resolveOutputPath(
  dir: string,
  safeName: string,
  overwrite: boolean,
  skip: boolean
): string | null {
  const outPath = path.join(dir, safeName);
  if (!fs.existsSync(outPath)) return outPath;
  if (overwrite) return outPath;
  if (skip) {
    ui.info(`Skipping ${safeName} (already exists)`);
    return null;
  }
  // Auto-suffix: file.txt → file.1.txt, file.2.txt, …
  const ext = path.extname(safeName);
  const base = path.basename(safeName, ext);
  for (let n = 1; n <= 1000; n++) {
    const candidate = path.join(dir, `${base}.${n}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Cannot find available filename for ${safeName}`);
}

export const dropDownloadCommand = new Command("download")
  .alias("dl")
  .description("Download and decrypt a drop")
  .argument("<target>", "Drop URL or drop ID")
  .option("-o, --output <dir>", "Output directory", ".")
  .option("-k, --key <key>", "Decryption key (required when using a drop ID)")
  .option("-p, --password <password>", "Password for protected drops")
  .option("--overwrite", "Overwrite existing files without prompting")
  .option("--skip", "Skip files that already exist")
  .action(async (target: string, options: {
    output: string;
    key?: string;
    password?: string;
    overwrite?: boolean;
    skip?: boolean;
  }) => {
    const { dropId, key: urlKey } = parseDropIdentifier(target);
    let keyString = options.key || urlKey;

    // Fetch drop metadata
    const spin = ui.spinner("Fetching drop metadata...");

    try {
      const baseUrl = getBaseUrl();
      const metaRes = await fetch(`${baseUrl}/api/v1/drop/${dropId}`);
      if (!metaRes.ok) {
        spin.fail("Drop not found or unavailable.");
        process.exit(metaRes.status === 404 ? EXIT_NOT_FOUND : 1);
      }

      const drop = (await metaRes.json()) as DropMetadata;
      spin.succeed(
        `Drop found: ${drop.files.length} file(s)`
      );

      // Handle custom key (password-protected)
      if (drop.customKey && !keyString) {
        if (
          !drop.customKeyData ||
          !drop.customKeyIv ||
          !drop.salt
        ) {
          ui.error("Drop requires a password but key data is missing.");
          process.exit(1);
        }

        const password = options.password || await ui.prompt("Password:", { mask: true });
        try {
          keyString = await crypto.decryptKeyWithPassword(
            drop.customKeyData,
            password,
            drop.salt,
            drop.customKeyIv
          );
        } catch {
          ui.errorBox("Decryption Failed", "Incorrect password.");
          process.exit(1);
        }
      }

      if (!keyString) {
        ui.errorBox(
          "Missing Key",
          "No decryption key provided. Use a URL with #<key> or pass --key <key>."
        );
        process.exit(1);
        return;
      }

      // Import key and IV
      const key = await crypto.importKey(keyString);
      const iv = new Uint8Array(
        crypto.base64UrlToArrayBuffer(drop.iv)
      );

      // Create output directory
      const outDir = path.resolve(options.output as string);
      fs.mkdirSync(outDir, { recursive: true });

      // Download and decrypt each file
      let downloadedCount = 0;
      for (const file of drop.files) {
        // B1: Warn on filename decryption failure
        let filename: string;
        try {
          filename = await crypto.decryptFilename(
            file.encryptedName,
            key,
            iv
          );
        } catch {
          ui.warn(`Could not decrypt filename for file ${file.id.slice(0, 8)} — using fallback name`);
          filename = `file_${file.id}`;
        }

        const encryptedSize = parseInt(file.size);
        const chunkSize = file.chunkSize || MIN_CHUNK_SIZE;
        const chunkCount = file.chunkCount || Math.ceil(encryptedSize / (chunkSize + AUTH_TAG_SIZE));
        const encryptedChunkSize = chunkSize + AUTH_TAG_SIZE;

        // S3: expected decrypted size
        const expectedDecryptedSize = encryptedSize - chunkCount * AUTH_TAG_SIZE;

        // B2: Resolve collision-safe output path
        const safeName = sanitizeFilename(filename);
        fs.mkdirSync(path.dirname(path.join(outDir, safeName)), { recursive: true });

        const outPath = resolveOutputPath(outDir, safeName, options.overwrite ?? false, options.skip ?? false);
        if (outPath === null) continue; // skip

        // F2: Check for existing partial download to resume
        const partPath = `${outPath}.anonli-dl`;
        let resumeFromChunk = 0;
        let resumeFromByte = 0;

        if (!options.overwrite && fs.existsSync(partPath)) {
          const partSize = fs.statSync(partPath).size;
          resumeFromChunk = Math.floor(partSize / chunkSize);
          resumeFromByte = resumeFromChunk * encryptedChunkSize;
          if (resumeFromChunk > 0) {
            ui.info(`Resuming ${filename} from chunk ${resumeFromChunk}/${chunkCount}`);
          }
        }

        ui.info(`Downloading ${ui.c.accent(filename)} (${ui.formatBytes(expectedDecryptedSize)})`);

        const downloadUrl = `${baseUrl}/api/v1/drop/${dropId}/file/${file.id}`;
        const fetchHeaders: Record<string, string> = {};
        if (resumeFromByte > 0) {
          fetchHeaders["Range"] = `bytes=${resumeFromByte}-`;
        }

        const response = await fetch(downloadUrl, { headers: fetchHeaders });

        if (!response.ok && response.status !== 206) {
          ui.error(`Failed to download ${filename}: ${response.statusText}`);
          continue;
        }

        // If server returned 200 instead of 206, Range was ignored → restart
        if (resumeFromChunk > 0 && response.status === 200) {
          ui.warn("Server doesn't support resume — restarting from beginning.");
          resumeFromChunk = 0;
          resumeFromByte = 0;
        }

        if (!response.body) {
          ui.error(`No response body for ${filename}`);
          continue;
        }

        // S4: Track bytes received vs Content-Length
        const contentLength = parseInt(response.headers.get("Content-Length") || "0");
        let totalBytesReceived = 0;

        // Open part file (append if resuming, overwrite if starting fresh)
        const writeStream = fs.createWriteStream(partPath, {
          flags: resumeFromChunk > 0 ? "a" : "w",
        });

        const reader = response.body.getReader();
        let buffer = new Uint8Array(0);
        let chunkIndex = resumeFromChunk;
        let totalDecryptedBytes = resumeFromChunk * chunkSize; // already written
        const bar = ui.progressBar(chunkCount, filename);
        if (resumeFromChunk > 0) bar.update(resumeFromChunk);

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (value) {
              // Append to buffer
              const newBuffer = new Uint8Array(buffer.length + value.length);
              newBuffer.set(buffer);
              newBuffer.set(value, buffer.length);
              buffer = newBuffer;
              totalBytesReceived += value.length;
            }

            // Process complete encrypted chunks
            while (buffer.length >= encryptedChunkSize) {
              const encryptedChunk = buffer.slice(0, encryptedChunkSize);
              buffer = buffer.slice(encryptedChunkSize);

              const decrypted = await crypto.decryptChunk(
                encryptedChunk.buffer.slice(
                  encryptedChunk.byteOffset,
                  encryptedChunk.byteOffset + encryptedChunk.byteLength
                ),
                key,
                iv,
                chunkIndex
              );

              writeStream.write(Buffer.from(decrypted));
              totalDecryptedBytes += decrypted.byteLength;
              chunkIndex++;

              if (chunkCount > 0) {
                bar.update(Math.min(chunkIndex, chunkCount));
              }
            }

            if (done) {
              // Process remaining data (last partial chunk)
              if (buffer.length > 0) {
                const decrypted = await crypto.decryptChunk(
                  buffer.buffer.slice(
                    buffer.byteOffset,
                    buffer.byteOffset + buffer.byteLength
                  ),
                  key,
                  iv,
                  chunkIndex
                );
                writeStream.write(Buffer.from(decrypted));
                totalDecryptedBytes += decrypted.byteLength;
              }
              break;
            }
          }

          await new Promise<void>((resolve, reject) => {
            writeStream.end((err: Error | null) => {
              if (err) reject(err);
              else resolve();
            });
          });

          bar.update(chunkCount);
          bar.stop();

          // S4: Warn if received bytes differ from Content-Length
          if (contentLength > 0 && totalBytesReceived !== contentLength) {
            ui.warn(
              `Content-Length mismatch for ${filename}: expected ${contentLength} bytes, received ${totalBytesReceived} bytes`
            );
          }

          // S3: Verify decrypted size against expected
          if (expectedDecryptedSize > 0 && totalDecryptedBytes !== expectedDecryptedSize) {
            ui.warn(
              `Size mismatch for ${filename}: expected ${ui.formatBytes(expectedDecryptedSize)}, got ${ui.formatBytes(totalDecryptedBytes)}`
            );
          }

          // Rename part file to final path
          fs.renameSync(partPath, outPath);
          downloadedCount++;
        } catch (err) {
          bar.stop();
          writeStream.destroy();
          // Leave part file for potential resume next time
          ui.error(`Failed to decrypt ${filename}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }

      ui.successBox(
        "Download Complete",
        `${ui.c.primary(String(downloadedCount))} ${ui.c.secondary("file(s) decrypted to")} ${ui.c.accent(path.resolve(outDir))}`
      );
    } catch (err) {
      ui.error(
        err instanceof Error ? err.message : "Download failed"
      );
      process.exit(1);
    }
  });
