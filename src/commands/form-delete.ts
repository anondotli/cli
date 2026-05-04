import { Command } from "commander";
import { requireAuth, apiDelete } from "../lib/api.js";
import * as ui from "../lib/ui.js";

export const formDeleteCommand = new Command("delete")
  .alias("rm")
  .description("Delete a form (also removes its submissions and attached drops)")
  .argument("<id>", "Form ID")
  .option("-f, --force", "Skip confirmation")
  .action(async (id: string, options: { force?: boolean }) => {
    requireAuth();

    if (!options.force) {
      const confirmed = await ui.confirm(
        `Delete form ${ui.bold(id)}? This removes all its submissions. This cannot be undone.`
      );
      if (!confirmed) {
        ui.info("Cancelled.");
        return;
      }
    }

    const spin = ui.spinner("Deleting form...");
    try {
      const result = await apiDelete(`/api/v1/form/${encodeURIComponent(id)}`);
      spin.succeed(`Deleted form ${id}`);
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to delete form.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
