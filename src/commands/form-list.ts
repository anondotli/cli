import { Command } from "commander";
import { requireAuth, apiGetList } from "../lib/api.js";
import * as ui from "../lib/ui.js";
import type { FormSummary } from "../types/api.js";

interface FormListMeta {
  plan?: {
    forms_limit: number;
    submissions_per_month: number;
    retention_days: number;
  };
}

export const formListCommand = new Command("list")
  .alias("ls")
  .description("List your forms")
  .option("--limit <n>", "Number of forms to fetch", parseInt)
  .option("--offset <n>", "Offset for pagination", parseInt)
  .option("--include-deleted", "Include soft-deleted forms")
  .option("--json", "Output raw JSON")
  .action(async (options: {
    limit?: number;
    offset?: number;
    includeDeleted?: boolean;
    json?: boolean;
  }) => {
    requireAuth();

    const limit = options.limit ?? 25;
    const offset = options.offset ?? 0;
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (options.includeDeleted) params.set("includeDeleted", "true");

    const spin = ui.spinner("Fetching forms...");
    try {
      const result = await apiGetList<FormSummary>(`/api/v1/form?${params.toString()}`);
      spin.stop();

      if (options.json) {
        ui.outputJson(result.data);
        return;
      }

      const meta = (result.meta ?? {}) as FormListMeta;
      const plan = meta.plan;

      if (result.data.length === 0) {
        ui.box(
          `${ui.c.secondary("No forms found.")}\n${ui.c.muted("Create one with")} ${ui.c.accent("anonli form new <title> --schema-file <path>")}`,
          { title: ui.c.info("Forms") }
        );
        if (plan) {
          console.log(
            ui.dim(
              `  Plan: ${plan.forms_limit === -1 ? "unlimited" : plan.forms_limit} forms, ${plan.submissions_per_month === -1 ? "unlimited" : plan.submissions_per_month} submissions/mo, ${plan.retention_days}-day retention`
            )
          );
        }
        return;
      }

      ui.table(
        ["ID", "Title", "Status", "Submissions", "Created"],
        result.data.map((f) => {
          const isActive = f.active && !f.disabled_by_user && !f.taken_down;
          const statusLabel = f.taken_down
            ? ui.statusBadge("Taken down", "inactive")
            : isActive
              ? ui.statusBadge("Active", "active")
              : ui.statusBadge("Disabled", "inactive");
          const subs = f.max_submissions
            ? `${f.submissions_count}/${f.max_submissions}`
            : String(f.submissions_count);
          return [
            f.id,
            f.title,
            statusLabel,
            subs,
            ui.formatDate(f.created_at),
          ];
        })
      );

      if (plan) {
        console.log(
          ui.dim(
            `\n  Plan: ${plan.forms_limit === -1 ? "unlimited" : plan.forms_limit} forms, ${plan.submissions_per_month === -1 ? "unlimited" : plan.submissions_per_month} submissions/mo, ${plan.retention_days}-day retention`
          )
        );
      }
      console.log(ui.dim(`  ${result.total} form(s) total`));
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to list forms.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
