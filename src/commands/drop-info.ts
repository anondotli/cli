import { Command } from "commander";
import * as crypto from "../lib/crypto.js";
import * as ui from "../lib/ui.js";
import { EXIT_NOT_FOUND } from "../lib/errors.js";
import type { DropMetadata } from "../types/api.js";
import { getBaseUrl } from "../lib/config.js";
import { parseDropIdentifier } from "../lib/drop-url.js";

export const dropInfoCommand = new Command("info")
  .alias("get")
  .description("View drop details")
  .argument("<target>", "Drop URL or drop ID")
  .option("-k, --key <key>", "Decryption key (to reveal filenames)")
  .option("-p, --password <password>", "Password for protected drops")
  // U1: JSON output
  .option("--json", "Output raw JSON")
  .action(async (target: string, options: { key?: string; password?: string; json?: boolean }) => {
    const { dropId, key: urlKey } = parseDropIdentifier(target);
    let keyString = options.key || urlKey;
    const spin = ui.spinner("Fetching drop info...");

    try {
      const baseUrl = getBaseUrl();
      const res = await fetch(`${baseUrl}/api/v1/drop/${dropId}`);

      if (!res.ok) {
        spin.fail("Drop not found or unavailable.");
        process.exit(res.status === 404 ? EXIT_NOT_FOUND : 1);
      }

      const drop = (await res.json()) as DropMetadata;
      spin.stop();

      // U1: JSON output (before password prompt to keep it scriptable)
      if (options.json) {
        ui.outputJson(drop);
        return;
      }

      // Handle password-protected drops
      if (drop.customKey && !keyString) {
        if (drop.customKeyData && drop.customKeyIv && drop.salt) {
          const password = options.password || await ui.prompt("Password:", { mask: true });
          try {
            keyString = await crypto.decryptKeyWithPassword(
              drop.customKeyData,
              password,
              drop.salt,
              drop.customKeyIv
            );
          } catch {
            ui.warn("Incorrect password — showing file IDs instead of names.");
          }
        }
      }

      // Try to import the decryption key
      let cryptoKey: Awaited<ReturnType<typeof crypto.importKey>> | null = null;
      let iv: Uint8Array | null = null;
      if (keyString) {
        try {
          cryptoKey = await crypto.importKey(keyString);
          iv = new Uint8Array(crypto.base64UrlToArrayBuffer(drop.iv));
        } catch {
          ui.warn("Invalid decryption key — showing file IDs instead of names.");
        }
      }

      ui.header("Drop Info");
      ui.spacer();

      ui.keyValue("ID", drop.id);
      ui.keyValue("Files", String(drop.files.length));
      ui.keyValue("Downloads", String(drop.downloads));
      if (drop.maxDownloads) {
        ui.keyValue("Max Downloads", String(drop.maxDownloads));
      }
      if (drop.expiresAt) {
        ui.keyValue("Expires", ui.formatDate(drop.expiresAt));
      }
      ui.keyValue("Created", ui.formatDate(drop.createdAt));
      ui.keyValue("Password Protected", drop.customKey ? "Yes" : "No");
      ui.keyValue("Hide Branding", drop.hideBranding ? "Yes" : "No");

      if (drop.files.length > 0) {
        ui.spacer();
        ui.sectionTitle("Files");

        const canDecrypt = cryptoKey !== null && iv !== null;
        const headers = ["#", canDecrypt ? "Name" : "ID", "Size", "Type"];
        const rows: string[][] = [];

        for (let i = 0; i < drop.files.length; i++) {
          const file = drop.files[i];
          let nameOrId: string;

          if (cryptoKey && iv) {
            try {
              nameOrId = await crypto.decryptFilename(file.encryptedName, cryptoKey, iv);
            } catch {
              nameOrId = file.id.slice(0, 8) + "...";
            }
          } else {
            nameOrId = file.id.slice(0, 8) + "...";
          }

          rows.push([
            String(i + 1),
            nameOrId,
            ui.formatBytes(parseInt(file.size)),
            file.mimeType || "unknown",
          ]);
        }

        ui.table(headers, rows);
      }

      ui.spacer();
      ui.info(`View: ${ui.link(`${baseUrl}/d/${dropId}`)}`);
    } catch (err) {
      spin.fail("Failed to fetch drop info.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
