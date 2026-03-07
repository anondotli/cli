import { Command } from "commander";
import { removeApiKey, getApiKey } from "../lib/config.js";
import * as ui from "../lib/ui.js";

export const logoutCommand = new Command("logout")
  .description("Remove stored API key")
  .action(() => {
    if (!getApiKey()) {
      ui.info("Not currently authenticated.");
      return;
    }
    removeApiKey();
    ui.success("Logged out. API key removed.");
  });
