import { Command } from "commander";
import { loadConfig, saveConfig, maskApiKey, getApiKey, getBaseUrl } from "../lib/config.js";
import * as ui from "../lib/ui.js";
import figures from "figures";

export const configCommand = new Command("config")
  .description("View or update CLI configuration")
  .argument("[action]", "get, set, or validate")
  .argument("[key]", "Config key (e.g. baseUrl)")
  .argument("[value]", "Value to set")
  .action(async (action?: string, key?: string, value?: string) => {
    const config = loadConfig();

    if (!action || action === "get") {
      // Show config
      ui.sectionTitle("Configuration");
      ui.keyValue(
        "apiKey",
        config.apiKey ? maskApiKey(config.apiKey) : ui.dim("(not set)")
      );
      ui.keyValue("baseUrl", config.baseUrl);
      return;
    }

    // F5: Config validate subcommand
    if (action === "validate") {
      ui.header("Config Validation");
      ui.spacer();

      const apiKey = getApiKey();
      const baseUrl = getBaseUrl();

      // Check API key format
      const keyOk = !!apiKey && apiKey.startsWith("ak_") && apiKey.length > 10;
      console.log(
        `  ${keyOk ? ui.c.success(figures.tick) : ui.c.error(figures.cross)} API key: ${
          apiKey ? maskApiKey(apiKey) : ui.c.error("not set")
        }`
      );

      // Check base URL format
      let urlOk = false;
      try {
        new URL(baseUrl);
        urlOk = true;
      } catch {
        // invalid
      }
      console.log(
        `  ${urlOk ? ui.c.success(figures.tick) : ui.c.error(figures.cross)} Base URL: ${baseUrl}`
      );

      // Check connectivity + auth
      if (keyOk && urlOk) {
        const spin = ui.spinner("Checking API connectivity...");
        try {
          const res = await fetch(`${baseUrl}/api/v1/me`, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          });

          if (res.ok) {
            const data = (await res.json()) as { data?: { email?: string } };
            spin.succeed(`Authenticated as ${ui.c.accent(data.data?.email ?? "unknown")}`);
          } else if (res.status === 401) {
            spin.fail("API key is invalid or expired — run `anonli login` to re-authenticate");
            process.exit(1);
          } else {
            spin.fail(`API returned unexpected status: ${res.status}`);
            process.exit(1);
          }
        } catch (err) {
          spin.fail(`Cannot reach ${baseUrl}: ${err instanceof Error ? err.message : "network error"}`);
          process.exit(1);
        }
      } else {
        const issues: string[] = [];
        if (!keyOk) issues.push("API key missing or invalid format");
        if (!urlOk) issues.push("Base URL is not a valid URL");
        ui.spacer();
        ui.errorBox("Config Invalid", issues.join("\n"), "Run `anonli login` to set up authentication.");
        process.exit(1);
      }
      return;
    }

    if (action === "set") {
      if (!key || !value) {
        ui.error("Usage: anonli config set <key> <value>");
        process.exit(1);
      }

      if (key === "baseUrl") {
        try {
          new URL(value);
        } catch {
          ui.error("Invalid URL format.");
          process.exit(1);
        }
        config.baseUrl = value;
        saveConfig(config);
        ui.success(`Set baseUrl to ${value}`);
      } else if (key === "apiKey") {
        ui.error(
          'Use "anonli login" to set your API key.'
        );
        process.exit(1);
      } else {
        ui.error(`Unknown config key: ${key}`);
        process.exit(1);
      }
      return;
    }

    ui.error(`Unknown action: ${action}. Use "get", "set", or "validate".`);
    process.exit(1);
  });
