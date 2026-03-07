import { Command } from "commander";
import { requireAuth, apiPost } from "../lib/api.js";
import { fetchPlanInfo, assertCountLimit } from "../lib/limits.js";
import * as ui from "../lib/ui.js";
import type { AliasItem } from "../types/api.js";

// B5: Validate custom alias local part
const ALIAS_LOCAL_PART_RE = /^[a-z0-9][a-z0-9._+\-]{0,61}[a-z0-9]$|^[a-z0-9]$/i;

function validateLocalPart(localPart: string): void {
  if (!ALIAS_LOCAL_PART_RE.test(localPart)) {
    ui.error(
      `Invalid alias local part: "${localPart}". ` +
      "Must start and end with a letter or digit, and contain only letters, digits, dots, underscores, plus, or hyphens (max 63 chars)."
    );
    process.exit(1);
  }
}

export const aliasNewCommand = new Command("new")
  .alias("create")
  .description("Create a new alias (default: random)")
  .option("-r, --random", "Generate random alias (default)")
  .option("-c, --custom <name>", "Custom local part")
  .option("-d, --domain <domain>", "Domain (default: anon.li)")
  .option("-l, --label <text>", "Description/label for the alias")
  .option("--recipient <email>", "Recipient email to forward to")
  .action(async (options) => {
    requireAuth();

    const domain = (options.domain as string) || "anon.li";
    const isCustom = !!options.custom;

    // B5: Validate custom alias format before API call
    if (isCustom) {
      validateLocalPart(options.custom as string);
    }

    // Check plan limits before creating
    const limitSpin = ui.spinner("Checking plan limits...");
    const plan = await fetchPlanInfo();
    limitSpin.stop();

    if (isCustom) {
      assertCountLimit("custom alias", plan.aliases.custom.used, plan.aliases.custom.limit);
    } else {
      assertCountLimit("random alias", plan.aliases.random.used, plan.aliases.random.limit);
    }

    const spin = ui.spinner("Creating alias...");

    try {
      let result;

      const body: Record<string, unknown> = {
        domain,
        ...(options.label && { description: options.label }),
        ...(options.recipient && { recipient_email: options.recipient }),
      };

      if (isCustom) {
        result = await apiPost<AliasItem>("/api/v1/alias", {
          ...body,
          format: "custom",
          local_part: options.custom,
        });
      } else {
        result = await apiPost<AliasItem>("/api/v1/alias?generate=true", body);
      }

      spin.succeed(`Created: ${ui.c.accent(result.data.email)}`);

      // U9: Show forwarding path in success output
      if (options.recipient) {
        ui.info(`Forwards to: ${ui.c.primary(options.recipient as string)}`);
      }
      if (result.data.description) {
        ui.info(`Label: ${result.data.description}`);
      }
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to create alias.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
