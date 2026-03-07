import { Command } from "commander";
import { aliasNewCommand } from "./alias-new.js";
import { aliasListCommand } from "./alias-list.js";
import { aliasDeleteCommand } from "./alias-delete.js";
import { aliasToggleCommand } from "./alias-toggle.js";
import { aliasUpdateCommand } from "./alias-update.js";
import { aliasStatsCommand } from "./alias-stats.js";

export const aliasCommand = new Command("alias")
  .description("Manage email aliases")
  .addCommand(aliasNewCommand)
  .addCommand(aliasListCommand)
  .addCommand(aliasDeleteCommand)
  .addCommand(aliasToggleCommand)
  .addCommand(aliasUpdateCommand)
  .addCommand(aliasStatsCommand);
