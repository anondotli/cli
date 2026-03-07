import { Command } from "commander";
import { runAuthFlow } from "../lib/auth.js";
import { getApiKey } from "../lib/config.js";
import * as ui from "../lib/ui.js";

export const loginCommand = new Command("login")
  .description("Authenticate with your API key")
  .option("--token <key>", "API key (or enter interactively)")
  .action(async (options) => {
    if (getApiKey()) {
      ui.errorBox(
        "Already Logged In",
        "You are already authenticated.",
        "Run `anonli logout` first, then try again."
      );
      process.exit(1);
    }

    const success = await runAuthFlow(options.token as string | undefined);
    if (!success) {
      process.exit(1);
    }
  });
