import { Command } from "commander";
import * as ui from "../lib/ui.js";
import { getBaseUrl, getApiKey } from "../lib/config.js";
import { apiGet } from "../lib/api.js";
import { unlockVault, unwrapDropKeyFromVault } from "../lib/vault.js";
import type { VaultDropKeyEntry } from "../types/api.js";

export const dropShareCommand = new Command("share")
  .description("Reconstruct the share URL for a drop")
  .argument("<id>", "Drop ID")
  .option(
    "-k, --key <key>",
    "Decryption key (the part after # in the original URL). If omitted and you're authenticated, the key is recovered from your vault."
  )
  .action(async (id: string, options: { key?: string }) => {
    const baseUrl = getBaseUrl();

    let key = options.key;

    if (!key) {
      if (!getApiKey()) {
        ui.errorBox(
          "Key Required",
          "Provide --key, or run `anonli login` so the key can be recovered from your vault.",
          "Use: anonli drop share <id> --key <key>"
        );
        process.exit(1);
      }

      const recoverSpin = ui.spinner("Recovering drop key from your vault...");
      try {
        const vault = await unlockVault();
        const result = await apiGet<VaultDropKeyEntry>(
          `/api/v1/vault/drop-keys?drop_id=${encodeURIComponent(id)}`
        );
        key = await unwrapDropKeyFromVault(result.data.wrapped_key, vault);
        recoverSpin.succeed("Key recovered from vault");
      } catch (err) {
        recoverSpin.stop();
        const message = err instanceof Error ? err.message : "Unknown error";
        if (/not found/i.test(message)) {
          ui.errorBox(
            "Key Not in Vault",
            "This drop wasn't uploaded with vault storage, or the wrapped key is missing.",
            "Pass the key explicitly: anonli drop share <id> --key <key>"
          );
        } else {
          ui.errorBox("Vault Recovery Failed", message);
        }
        process.exit(1);
      }
    }

    const shareUrl = `${baseUrl}/d/${id}#${key}`;

    ui.successBox(
      "Share URL",
      `${ui.c.secondary("URL:")} ${ui.link(shareUrl)}`
    );
    // Also print plain URL to stdout for easy piping
    console.log(shareUrl);
  });
