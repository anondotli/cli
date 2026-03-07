import { Command } from "commander";
import { requireAuth, apiPatch } from "../lib/api.js";
import * as ui from "../lib/ui.js";
import type { AliasItem } from "../types/api.js";

export const aliasUpdateCommand = new Command("update")
  .alias("edit")
  .description("Update an alias")
  .argument("<id>", "Alias ID or email")
  .option("--enable", "Enable the alias")
  .option("--disable", "Disable the alias")
  .option("-l, --label <text>", "Update description/label")
  .action(async (aliasId: string, options: { enable?: boolean; disable?: boolean; label?: string }) => {
    requireAuth();

    if (!options.enable && !options.disable && !options.label) {
      ui.error("Provide at least one option: --enable, --disable, or --label");
      process.exit(1);
    }

    if (options.enable && options.disable) {
      ui.error("Cannot use both --enable and --disable");
      process.exit(1);
    }

    const spin = ui.spinner("Updating alias...");

    try {
      const body: Record<string, unknown> = {};

      if (options.enable) {
        body.active = true;
      } else if (options.disable) {
        body.active = false;
      }

      if (options.label !== undefined) {
        body.description = options.label;
      }

      const result = await apiPatch<AliasItem>(
        `/api/v1/alias/${encodeURIComponent(aliasId)}`,
        body
      );
      spin.stop();

      const status = result.data.active
        ? ui.statusBadge("Active", "active")
        : ui.statusBadge("Inactive", "inactive");

      ui.successBox(
        "Alias Updated",
        `${ui.c.accent(result.data.email)} is now ${status}`
      );

      if (result.data.description) {
        ui.info(`Label: ${result.data.description}`);
      }

      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to update alias.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
