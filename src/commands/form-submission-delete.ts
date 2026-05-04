import { Command } from "commander";
import { requireAuth, apiDelete } from "../lib/api.js";
import * as ui from "../lib/ui.js";

export const formSubmissionDeleteCommand = new Command("delete")
  .alias("rm")
  .description("Delete a form submission (also removes its attached drop)")
  .argument("<submission-id>", "Submission ID")
  .option("-f, --force", "Skip confirmation")
  .action(async (submissionId: string, options: { force?: boolean }) => {
    requireAuth();

    if (!options.force) {
      const confirmed = await ui.confirm(
        `Delete submission ${ui.bold(submissionId)}? This cannot be undone.`
      );
      if (!confirmed) {
        ui.info("Cancelled.");
        return;
      }
    }

    const spin = ui.spinner("Deleting submission...");
    try {
      const result = await apiDelete(
        `/api/v1/form/submission/${encodeURIComponent(submissionId)}`
      );
      spin.succeed(`Deleted submission ${submissionId}`);
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to delete submission.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
