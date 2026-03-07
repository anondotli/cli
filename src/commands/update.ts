import { Command } from "commander";
import { execSync } from "node:child_process";
import * as ui from "../lib/ui.js";

export const updateCommand = new Command("update")
  .description("Update anonli to the latest version")
  .action(() => {
    const spin = ui.spinner("Updating anonli...");

    try {
      // Detect package manager
      let cmd: string;
      try {
        execSync("bun --version", { stdio: "ignore" });
        cmd = "bun install -g anonli@latest";
      } catch {
        cmd = "npm install -g anonli@latest";
      }

      execSync(cmd, { stdio: "inherit" });
      spin.stop();

      // B4: Verify the new version was actually installed
      try {
        const newVersion = execSync("anonli --version", { encoding: "utf8" }).trim();
        ui.successBox("Updated", `anonli is now up to date.\nInstalled version: ${newVersion}`);
      } catch {
        ui.successBox("Updated", "anonli was updated. Run `anonli --version` to confirm.");
      }
    } catch (err) {
      spin.stop();
      ui.errorBox(
        "Update Failed",
        err instanceof Error ? err.message : "Failed to update.",
        "Try: npm install -g anonli@latest"
      );
      process.exit(1);
    }
  });
