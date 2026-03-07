import { Command } from "commander";
import { requireAuth, apiDelete } from "../lib/api.js";
import * as ui from "../lib/ui.js";
import { parseDropIdentifier } from "../lib/drop-url.js";

export const dropDeleteCommand = new Command("delete")
  .alias("rm")
  .description("Delete a drop")
  .argument("<target>", "Drop URL or drop ID")
  .option("-f, --force", "Skip confirmation")
  .action(async (target: string, options: { force?: boolean }) => {
    const { dropId } = parseDropIdentifier(target);
    requireAuth();

    if (!options.force) {
      const confirmed = await ui.confirm(
        `Delete drop ${ui.bold(dropId)}? This cannot be undone.`
      );
      if (!confirmed) {
        ui.info("Cancelled.");
        return;
      }
    }

    const spin = ui.spinner("Deleting drop...");

    try {
      const result = await apiDelete(`/api/v1/drop/${dropId}`);
      spin.succeed(`Deleted drop ${dropId}`);
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to delete drop.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
