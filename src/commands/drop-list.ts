import { Command } from "commander";
import { requireAuth, apiGetList } from "../lib/api.js";
import * as ui from "../lib/ui.js";
import type { DropListItem } from "../types/api.js";

export const dropListCommand = new Command("list")
  .alias("ls")
  .description("List your drops")
  .option("--limit <n>", "Number of drops to fetch", parseInt)
  .option("--offset <n>", "Offset for pagination", parseInt)
  // F6: Filters
  .option("--expired", "Show only expired drops")
  .option("--disabled", "Show only disabled drops")
  .option("--enabled", "Show only enabled drops")
  .option("--sort <field>", "Sort by: created, expiry, size, downloads", "created")
  .option("--order <dir>", "Sort direction: asc, desc", "desc")
  // U1: JSON output
  .option("--json", "Output raw JSON")
  .action(async (options: {
    limit?: number;
    offset?: number;
    expired?: boolean;
    disabled?: boolean;
    enabled?: boolean;
    sort?: string;
    order?: string;
    json?: boolean;
  }) => {
    requireAuth();

    const spin = ui.spinner("Fetching drops...");

    try {
      const limit = options.limit ?? 50; // B8: standardized to 50
      const offset = options.offset ?? 0;
      const result = await apiGetList<DropListItem>(
        `/api/v1/drop?limit=${limit}&offset=${offset}`
      );
      spin.stop();

      // U1: JSON output
      if (options.json) {
        ui.outputJson(result.data);
        return;
      }

      // F6: Client-side filtering
      let data = result.data;
      const now = new Date();

      if (options.expired) {
        data = data.filter((d) => d.expires_at && new Date(d.expires_at) < now);
      }
      if (options.disabled) {
        data = data.filter((d) => d.disabled);
      }
      if (options.enabled) {
        data = data.filter((d) => !d.disabled);
      }

      // F6: Client-side sorting
      if (options.sort) {
        data = [...data].sort((a, b) => {
          let cmp = 0;
          switch (options.sort) {
            case "expiry":
              cmp = (a.expires_at ?? "").localeCompare(b.expires_at ?? "");
              break;
            case "size":
              cmp = parseInt(a.totalSize || "0") - parseInt(b.totalSize || "0");
              break;
            case "downloads":
              cmp = a.downloads - b.downloads;
              break;
            default: // "created"
              cmp = a.created_at.localeCompare(b.created_at);
          }
          return options.order === "asc" ? cmp : -cmp;
        });
      }

      if (data.length === 0) {
        ui.box(
          `${ui.c.secondary("No drops found.")}\n${ui.c.muted('Create one with')} ${ui.c.accent("anonli drop upload <file>")}`,
          { title: ui.c.info("Drops") }
        );
        return;
      }

      ui.table(
        ["ID", "Status", "Files", "Size", "Downloads", "Expires", "Created"],
        data.map((d) => [
          d.id,
          d.disabled
            ? ui.statusBadge("Disabled", "inactive")
            : ui.statusBadge("Active", "active"),
          String(d.fileCount),
          ui.formatBytes(parseInt(d.totalSize || "0")),
          d.maxDownloads
            ? `${d.downloads}/${d.maxDownloads}`
            : String(d.downloads),
          d.expires_at
            ? ui.formatDate(d.expires_at)
            : ui.dim("never"),
          ui.formatDate(d.created_at),
        ])
      );

      const storage = result.meta?.storage as
        | { used: string; limit: string }
        | undefined;
      if (storage) {
        console.log(
          ui.dim(
            `\n  Storage: ${ui.formatBytes(parseInt(storage.used))}/${ui.formatBytes(parseInt(storage.limit))}`
          )
        );
      }

      console.log(ui.dim(`  ${result.total} drop(s) total${data.length < result.data.length ? `, ${data.length} shown after filter` : ""}`));
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to list drops.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
