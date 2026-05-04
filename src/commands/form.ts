import { Command } from "commander";
import { formListCommand } from "./form-list.js";
import { formNewCommand } from "./form-new.js";
import { formInfoCommand } from "./form-info.js";
import { formToggleCommand } from "./form-toggle.js";
import { formDeleteCommand } from "./form-delete.js";
import { formSubmissionCommand } from "./form-submission.js";

export const formCommand = new Command("form")
  .description("Encrypted forms with vault-protected submissions")
  .addCommand(formListCommand)
  .addCommand(formNewCommand)
  .addCommand(formInfoCommand)
  .addCommand(formToggleCommand)
  .addCommand(formDeleteCommand)
  .addCommand(formSubmissionCommand);
