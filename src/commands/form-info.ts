import { Command } from "commander";
import * as ui from "../lib/ui.js";
import { getBaseUrl } from "../lib/config.js";
import { EXIT_NOT_FOUND } from "../lib/errors.js";
import type { FormPublicView } from "../types/api.js";

export const formInfoCommand = new Command("info")
  .description("Show public form metadata")
  .argument("<id>", "Form ID")
  .option("--json", "Output raw JSON")
  .action(async (id: string, options: { json?: boolean }) => {
    const baseUrl = getBaseUrl();
    const spin = ui.spinner("Fetching form...");

    try {
      const res = await fetch(`${baseUrl}/api/v1/form/${encodeURIComponent(id)}`);
      if (!res.ok) {
        spin.fail(res.status === 410 ? "Form has been taken down." : "Form not found.");
        process.exit(res.status === 404 ? EXIT_NOT_FOUND : 1);
      }
      const data = (await res.json()) as FormPublicView;
      spin.stop();

      if (options.json) {
        ui.outputJson(data);
        return;
      }

      const publicUrl = `${baseUrl}/f/${data.id}`;
      const lines = [
        `${ui.c.secondary("ID:")}      ${ui.c.primary(data.id)}`,
        `${ui.c.secondary("Title:")}   ${ui.c.primary(data.title)}`,
      ];
      if (data.description) {
        lines.push(`${ui.c.secondary("Desc:")}    ${ui.c.primary(data.description)}`);
      }
      lines.push(
        `${ui.c.secondary("URL:")}     ${ui.link(publicUrl)}`,
        `${ui.c.secondary("Status:")}  ${data.active ? ui.c.success("active") : ui.c.muted("disabled")}`,
        `${ui.c.secondary("Files:")}   ${data.allow_file_uploads ? ui.c.success("allowed") : ui.c.muted("not allowed")}`
      );
      if (data.closes_at) {
        lines.push(`${ui.c.secondary("Closes:")}  ${ui.formatDate(data.closes_at)}`);
      }
      if (data.custom_key) {
        lines.push(`${ui.c.secondary("Locked:")}  ${ui.c.warning("password required")}`);
      }

      ui.successBox("Form", lines.join("\n"));
    } catch (err) {
      spin.fail("Failed to fetch form.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
