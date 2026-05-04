import { Command } from "commander";
import { requireAuth, apiPatch } from "../lib/api.js";
import * as ui from "../lib/ui.js";

export const formToggleCommand = new Command("toggle")
  .description("Enable or disable a form")
  .argument("<id>", "Form ID")
  .action(async (id: string) => {
    requireAuth();

    const spin = ui.spinner("Toggling form...");
    try {
      const result = await apiPatch<{ disabled: boolean }>(
        `/api/v1/form/${encodeURIComponent(id)}?action=toggle`
      );

      if (result.data.disabled) {
        spin.succeed(`Form ${id} is now ${ui.statusBadge("disabled", "inactive")}`);
      } else {
        spin.succeed(`Form ${id} is now ${ui.statusBadge("enabled", "active")}`);
      }
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to toggle form.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
