import { Command } from "commander";
import { formSubmissionListCommand } from "./form-submission-list.js";
import { formSubmissionDeleteCommand } from "./form-submission-delete.js";

export const formSubmissionCommand = new Command("submission")
  .description("Manage form submissions")
  .addCommand(formSubmissionListCommand)
  .addCommand(formSubmissionDeleteCommand);
