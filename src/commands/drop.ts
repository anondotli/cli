import { Command } from "commander";
import { dropUploadCommand } from "./drop-upload.js";
import { dropListCommand } from "./drop-list.js";
import { dropDeleteCommand } from "./drop-delete.js";
import { dropDownloadCommand } from "./drop-download.js";
import { dropToggleCommand } from "./drop-toggle.js";
import { dropInfoCommand } from "./drop-info.js";
import { dropShareCommand } from "./drop-share.js";

export const dropCommand = new Command("drop")
  .description("Encrypted file drops")
  .addCommand(dropUploadCommand)
  .addCommand(dropListCommand)
  .addCommand(dropDeleteCommand)
  .addCommand(dropDownloadCommand)
  .addCommand(dropToggleCommand)
  .addCommand(dropInfoCommand)
  .addCommand(dropShareCommand);
