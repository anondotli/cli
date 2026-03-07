import { Command } from "commander";
import * as ui from "../lib/ui.js";
import { getBaseUrl } from "../lib/config.js";

export const dropShareCommand = new Command("share")
  .description("Reconstruct the share URL for a drop (requires the original key)")
  .argument("<id>", "Drop ID")
  .option("-k, --key <key>", "Decryption key (the part after # in the original URL)")
  .action((id: string, options: { key?: string }) => {
    const baseUrl = getBaseUrl();

    if (!options.key) {
      ui.errorBox(
        "Key Required",
        "The decryption key is required to reconstruct the share URL.",
        "Use: anonli drop share <id> --key <key>"
      );
      process.exit(1);
    }

    const shareUrl = `${baseUrl}/d/${id}#${options.key}`;

    ui.successBox(
      "Share URL",
      `${ui.c.secondary("URL:")} ${ui.link(shareUrl)}`
    );
    // Also print plain URL to stdout for easy piping
    console.log(shareUrl);
  });
