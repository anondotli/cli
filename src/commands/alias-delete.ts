import { Command } from "commander";
import { requireAuth, apiDelete } from "../lib/api.js";
import * as ui from "../lib/ui.js";

export const aliasDeleteCommand = new Command("delete")
  .alias("rm")
  .description("Delete an alias")
  .argument("<id>", "Alias ID or email")
  .option("-f, --force", "Skip confirmation")
  .action(async (id: string, options: { force?: boolean }) => {
    requireAuth();

    if (!options.force) {
      const confirmed = await ui.confirm(
        `Delete alias ${ui.bold(id)}?`
      );
      if (!confirmed) {
        ui.info("Cancelled.");
        return;
      }
    }

    const spin = ui.spinner("Deleting alias...");

    try {
      const result = await apiDelete(`/api/v1/alias/${encodeURIComponent(id)}`);
      spin.succeed(`Deleted alias ${id}`);
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to delete alias.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
