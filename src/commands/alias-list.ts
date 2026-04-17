import { Command } from "commander";
import { requireAuth, apiGetList } from "../lib/api.js";
import * as ui from "../lib/ui.js";
import type { AliasItem } from "../types/api.js";

export const aliasListCommand = new Command("list")
  .alias("ls")
  .description("List all aliases")
  .option("--limit <n>", "Number of aliases to fetch", parseInt)
  .option("--offset <n>", "Offset for pagination", parseInt)
  // F6: Filters
  .option("--active", "Show only active aliases")
  .option("--inactive", "Show only inactive aliases")
  .option("--search <term>", "Filter by email address")
  // U1: JSON output
  .option("--json", "Output raw JSON")
  .action(async (options: {
    limit?: number;
    offset?: number;
    active?: boolean;
    inactive?: boolean;
    search?: string;
    json?: boolean;
  }) => {
    requireAuth();

    const spin = ui.spinner("Fetching aliases...");

    try {
      const limit = options.limit ?? 50; // B8: standardized to 50
      const offset = options.offset ?? 0;
      const result = await apiGetList<AliasItem>(`/api/v1/alias?limit=${limit}&offset=${offset}`);
      spin.stop();

      // U1: JSON output
      if (options.json) {
        ui.outputJson(result.data);
        return;
      }

      // F6: Client-side filtering
      let data = result.data;

      if (options.active) {
        data = data.filter((a) => a.active);
      }
      if (options.inactive) {
        data = data.filter((a) => !a.active);
      }
      if (options.search) {
        const term = options.search.toLowerCase();
        data = data.filter((a) => a.email.toLowerCase().includes(term));
      }

      if (data.length === 0) {
        ui.box(
          `${ui.c.secondary("No aliases found.")}\n${ui.c.muted('Create one with')} ${ui.c.accent("anonli alias new")}`,
          { title: ui.c.info("Aliases") }
        );
        return;
      }

      ui.table(
        ["Alias", "Status", "Created"],
        data.map((a) => [
          a.email,
          a.active
            ? ui.statusBadge("Active", "active")
            : ui.statusBadge("Inactive", "inactive"),
          ui.formatDate(a.created_at),
        ])
      );

      console.log(ui.dim(
        `\n  ${result.total} alias(es) total${data.length < result.data.length ? `, ${data.length} shown after filter` : ""}`
      ));
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to list aliases.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
