import { Command } from "commander";
import { requireAuth, apiPatch } from "../lib/api.js";
import * as ui from "../lib/ui.js";
import { parseDropIdentifier } from "../lib/drop-url.js";

export const dropToggleCommand = new Command("toggle")
  .description("Toggle a drop's enabled/disabled state")
  .argument("<target>", "Drop URL or drop ID")
  .action(async (target: string) => {
    const { dropId } = parseDropIdentifier(target);
    requireAuth();

    const spin = ui.spinner("Toggling drop...");

    try {
      const result = await apiPatch<{ disabled: boolean }>(
        `/api/v1/drop/${dropId}?action=toggle`
      );

      // U8: Show new state explicitly
      if (result.data.disabled) {
        spin.succeed(`Drop ${dropId} is now ${ui.statusBadge("disabled", "inactive")}`);
      } else {
        spin.succeed(`Drop ${dropId} is now ${ui.statusBadge("enabled", "active")}`);
      }

      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to toggle drop.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
