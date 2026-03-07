import { Command } from "commander";
import { requireAuth, apiGetList, apiPost, apiDelete } from "../lib/api.js";
import * as ui from "../lib/ui.js";
import type { ApiKeyItem, ApiKeyCreateResponse } from "../types/api.js";

export const apikeyCommand = new Command("apikey")
  .alias("api-key")
  .description("Manage API keys");

// List API keys
apikeyCommand
  .command("list")
  .alias("ls")
  .description("List all API keys")
  // U1: JSON output
  .option("--json", "Output raw JSON")
  .action(async (options: { json?: boolean }) => {
    requireAuth();
    const spin = ui.spinner("Fetching API keys...");

    try {
      const result = await apiGetList<ApiKeyItem>("/api/v1/api-key");
      spin.stop();

      // U1: JSON output
      if (options.json) {
        ui.outputJson(result.data);
        return;
      }

      if (result.data.length === 0) {
        ui.box(
          `${ui.c.secondary("No API keys yet.")}\n${ui.c.muted("Create one with")} ${ui.c.accent("anonli apikey create")}`,
          { title: ui.c.info("API Keys") }
        );
        return;
      }

      ui.table(
        ["Prefix", "Label", "Created"],
        result.data.map((k) => [
          ui.c.accent(k.key_prefix + "..."),
          k.label || ui.dim("(none)"),
          ui.formatDate(k.created_at),
        ])
      );

      console.log(ui.dim(`  ${result.total} API key(s) total`));
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to list API keys.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });

// Create API key
apikeyCommand
  .command("create")
  .alias("new")
  .description("Create a new API key")
  .option("-l, --label <label>", "Label for the key")
  .action(async (options) => {
    requireAuth();
    const spin = ui.spinner("Creating API key...");

    try {
      const result = await apiPost<ApiKeyCreateResponse>("/api/v1/api-key", {
        label: options.label,
      });
      spin.stop();

      ui.successBox(
        "API Key Created",
        `${ui.c.warning("Save this key now - it won't be shown again!")}\n\n${ui.c.accent(result.data.key)}`
      );

      if (result.data.label) {
        ui.info(`Label: ${result.data.label}`);
      }

      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to create API key.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });

// Delete API key
apikeyCommand
  .command("delete <id>")
  .alias("rm")
  .description("Delete an API key")
  .option("-f, --force", "Skip confirmation")
  .action(async (id: string, options) => {
    requireAuth();

    if (!options.force) {
      const confirmed = await ui.confirm(`Delete API key ${id}?`);
      if (!confirmed) {
        ui.info("Cancelled.");
        return;
      }
    }

    const spin = ui.spinner("Deleting API key...");

    try {
      const result = await apiDelete(`/api/v1/api-key/${encodeURIComponent(id)}`);
      spin.succeed("API key deleted.");
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to delete API key.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
