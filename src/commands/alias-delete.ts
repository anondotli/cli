import { Command } from "commander";
import { requireAuth, apiDelete } from "../lib/api.js";
import * as ui from "../lib/ui.js";

export const aliasDeleteCommand = new Command("delete")
  .alias("rm")
  .description("Delete an alias")
  .argument("<alias>", "Alias email address")
  .option("-f, --force", "Skip confirmation")
  .action(async (alias: string, options: { force?: boolean }) => {
    requireAuth();

    if (!options.force) {
      const confirmed = await ui.confirm(
        `Delete alias ${ui.bold(alias)}?`
      );
      if (!confirmed) {
        ui.info("Cancelled.");
        return;
      }
    }

    const spin = ui.spinner("Deleting alias...");

    try {
      const result = await apiDelete(`/api/v1/alias/${encodeURIComponent(alias)}`);
      spin.succeed(`Deleted alias ${alias}`);
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to delete alias.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
