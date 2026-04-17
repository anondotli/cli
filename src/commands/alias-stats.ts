import { Command } from "commander";
import { requireAuth, apiGet, apiGetList } from "../lib/api.js";
import * as ui from "../lib/ui.js";
import type { AliasItem } from "../types/api.js";

interface AliasWithStats extends AliasItem {
  forwarded?: number;
  blocked?: number;
  last_seen?: string | null;
}

export const aliasStatsCommand = new Command("stats")
  .description("Show forwarding statistics for an alias")
  .argument("[alias]", "Alias email address (omit to show summary across all aliases)")
  .option("--all", "Show summary across all aliases")
  // U1: JSON output
  .option("--json", "Output raw JSON")
  .action(async (alias: string | undefined, options: { all?: boolean; json?: boolean }) => {
    requireAuth();

    if (alias && !options.all) {
      // Single alias stats
      const spin = ui.spinner("Fetching alias stats...");

      try {
        const result = await apiGet<AliasWithStats>(
          `/api/v1/alias/${encodeURIComponent(alias)}`
        );
        spin.stop();

        const a = result.data;

        if (options.json) {
          ui.outputJson(a);
          return;
        }

        ui.header(`Alias: ${a.email}`);
        ui.spacer();
        ui.keyValue("Status", a.active ? "Active" : "Inactive");
        ui.keyValue("Forwarded", String(a.forwarded ?? 0));
        ui.keyValue("Blocked", String(a.blocked ?? 0));
        ui.keyValue("Last Seen", a.last_seen ? ui.formatDate(a.last_seen) : "Never");
        ui.keyValue("Created", ui.formatDate(a.created_at));
        ui.showRateLimit(result.rateLimit);
      } catch (err) {
        spin.fail("Failed to fetch alias stats.");
        ui.error(err instanceof Error ? err.message : "Unknown error");
        process.exit(1);
      }
    } else {
      // Summary across all aliases
      const spin = ui.spinner("Fetching all aliases...");

      try {
        const result = await apiGetList<AliasWithStats>("/api/v1/alias?limit=100");
        spin.stop();

        const data = result.data;

        if (options.json) {
          const summary = {
            total: data.length,
            active: data.filter((a) => a.active).length,
            totalForwarded: data.reduce((s, a) => s + (a.forwarded ?? 0), 0),
            totalBlocked: data.reduce((s, a) => s + (a.blocked ?? 0), 0),
            aliases: data.map((a) => ({
              id: a.id,
              email: a.email,
              forwarded: a.forwarded ?? 0,
              blocked: a.blocked ?? 0,
              last_seen: a.last_seen ?? null,
            })),
          };
          ui.outputJson(summary);
          return;
        }

        const totalForwarded = data.reduce((s, a) => s + (a.forwarded ?? 0), 0);
        const totalBlocked = data.reduce((s, a) => s + (a.blocked ?? 0), 0);

        ui.header("Alias Statistics Summary");
        ui.spacer();
        ui.keyValue("Total Aliases", String(data.length));
        ui.keyValue("Active", String(data.filter((a) => a.active).length));
        ui.keyValue("Total Forwarded", String(totalForwarded));
        ui.keyValue("Total Blocked", String(totalBlocked));
        ui.spacer();

        if (data.length > 0) {
          ui.sectionTitle("Per-Alias Breakdown");
          ui.table(
            ["Email", "Forwarded", "Blocked", "Last Seen"],
            data.map((a) => [
              a.email,
              String(a.forwarded ?? 0),
              String(a.blocked ?? 0),
              a.last_seen ? ui.formatDate(a.last_seen) : ui.dim("never"),
            ])
          );
        }

        ui.showRateLimit(result.rateLimit);
      } catch (err) {
        spin.fail("Failed to fetch alias stats.");
        ui.error(err instanceof Error ? err.message : "Unknown error");
        process.exit(1);
      }
    }
  });
