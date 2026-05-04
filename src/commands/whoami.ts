import { Command } from "commander";
import { requireAuth, apiGet } from "../lib/api.js";
import { setUserInfo } from "../lib/config.js";
import * as ui from "../lib/ui.js";
import type { MeResponse } from "../types/api.js";

export const whoamiCommand = new Command("whoami")
  .description("Show current user info")
  // U1: JSON output
  .option("--json", "Output raw JSON")
  .action(async (options: { json?: boolean }) => {
    requireAuth();

    const spin = ui.spinner("Fetching account info...");

    try {
      const result = await apiGet<MeResponse>("/api/v1/me");
      spin.stop();

      const d = result.data;

      // Cache user info for home screen greeting
      setUserInfo(d.email, d.name);

      // U1: JSON output
      if (options.json) {
        ui.outputJson(d);
        return;
      }

      // Header with email
      ui.header(d.email);
      const badge = ui.tierBadge(d.tier, d.product);
      console.log(
        `  ${badge} ${ui.c.muted("·")} ${ui.c.secondary("Joined")} ${ui.c.primary(ui.formatDate(d.created_at))}`
      );
      ui.spacer();

      // Alias usage
      ui.sectionTitle("Alias");
      ui.usageRow("Random", d.aliases.random.used, d.aliases.random.limit);
      ui.usageRow("Custom", d.aliases.custom.used, d.aliases.custom.limit);
      ui.usageRow("Recipients", d.recipients.used, d.recipients.limit);
      ui.usageRow("Domains", d.domains.used, d.domains.limit);
      ui.spacer();

      // Drop usage
      ui.sectionTitle("Drop");
      ui.usageRow("Active", d.drops.count);
      ui.storageRow("Storage", parseInt(d.storage.used), parseInt(d.storage.limit));
      ui.alignedKeyValue("Max File", ui.formatBytes(d.limits.max_file_size), 14);
      ui.alignedKeyValue("Expiry", ui.formatDays(d.limits.max_expiry_days), 14);
      ui.spacer();

      // Vault status
      ui.sectionTitle("Vault");
      const vaultLabel = d.vault_configured
        ? ui.c.success("configured")
        : ui.c.muted("not configured");
      ui.alignedKeyValue("Status", vaultLabel, 14);
      ui.spacer();

      // API
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to fetch account info.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
