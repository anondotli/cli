import { Command } from "commander";
import { requireAuth, apiGet, apiPatch } from "../lib/api.js";
import * as ui from "../lib/ui.js";

interface AliasData {
  id: string;
  email: string;
  active: boolean;
}

export const aliasToggleCommand = new Command("toggle")
  .description("Toggle alias active/inactive")
  .argument("<id>", "Alias ID or email")
  .action(async (id: string) => {
    requireAuth();

    const spin = ui.spinner("Toggling alias...");

    try {
      // Fetch current state first — the API requires an explicit {active} value
      const current = await apiGet<AliasData>(
        `/api/v1/alias/${encodeURIComponent(id)}`
      );

      const result = await apiPatch<AliasData>(
        `/api/v1/alias/${encodeURIComponent(id)}`,
        { active: !current.data.active }
      );
      const badge = result.data.active
        ? ui.statusBadge("Active", "active")
        : ui.statusBadge("Inactive", "inactive");
      spin.succeed(`Alias ${id} is now ${badge}`);
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to toggle alias.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
