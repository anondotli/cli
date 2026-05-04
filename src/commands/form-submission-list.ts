import { Command } from "commander";
import { requireAuth, apiGetList } from "../lib/api.js";
import * as ui from "../lib/ui.js";
import type { FormSubmissionSummary } from "../types/api.js";

export const formSubmissionListCommand = new Command("list")
  .alias("ls")
  .description("List submissions for a form")
  .argument("<form-id>", "Form ID")
  .option("--limit <n>", "Number of submissions to fetch", parseInt)
  .option("--offset <n>", "Offset for pagination", parseInt)
  .option("--unread-only", "Only show unread submissions")
  .option("--json", "Output raw JSON")
  .action(async (formId: string, options: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    json?: boolean;
  }) => {
    requireAuth();

    const limit = options.limit ?? 25;
    const offset = options.offset ?? 0;
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (options.unreadOnly) params.set("unreadOnly", "true");

    const spin = ui.spinner("Fetching submissions...");
    try {
      const result = await apiGetList<FormSubmissionSummary>(
        `/api/v1/form/${encodeURIComponent(formId)}/submission?${params.toString()}`
      );
      spin.stop();

      if (options.json) {
        ui.outputJson(result.data);
        return;
      }

      if (result.data.length === 0) {
        ui.box(
          ui.c.secondary(options.unreadOnly ? "No unread submissions." : "No submissions yet."),
          { title: ui.c.info("Submissions") }
        );
        return;
      }

      ui.table(
        ["ID", "Received", "Status", "Attachment"],
        result.data.map((s) => [
          s.id,
          ui.formatDate(s.created_at),
          s.read_at ? ui.c.muted("read") : ui.c.warning("unread"),
          s.has_attached_drop ? ui.c.success("yes") : ui.c.muted("no"),
        ])
      );
      console.log(ui.dim(`  ${result.total} submission(s) total`));
      ui.spacer();
      ui.info(
        "To read a submission, use the dashboard. CLI decryption requires an API endpoint that exposes the wrapped form key, which is not yet available."
      );
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to list submissions.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
