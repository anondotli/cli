import { Command } from "commander";
import { requireAuth, apiPatch, apiPost } from "../lib/api.js";
import { fetchPlanInfo, assertCountLimit } from "../lib/limits.js";
import { encryptAliasMetadata, unlockVault, type UnlockedVault } from "../lib/vault.js";
import * as ui from "../lib/ui.js";
import type { AliasItem } from "../types/api.js";

// B5: Validate custom alias local part
const ALIAS_LOCAL_PART_RE = /^[a-z0-9][a-z0-9._+\-]{0,61}[a-z0-9]$|^[a-z0-9]$/i;
const MAX_ALIAS_LABEL_LENGTH = 50;
const MAX_ALIAS_NOTE_LENGTH = 500;

function validateLocalPart(localPart: string): void {
  if (!ALIAS_LOCAL_PART_RE.test(localPart)) {
    ui.error(
      `Invalid alias local part: "${localPart}". ` +
      "Must start and end with a letter or digit, and contain only letters, digits, dots, underscores, plus, or hyphens (max 63 chars)."
    );
    process.exit(1);
  }
}

function validateMetadata(label?: string, note?: string): void {
  if (label !== undefined && label.length > MAX_ALIAS_LABEL_LENGTH) {
    ui.error(`Alias label must be ${MAX_ALIAS_LABEL_LENGTH} characters or fewer.`);
    process.exit(1);
  }
  if (note !== undefined && note.length > MAX_ALIAS_NOTE_LENGTH) {
    ui.error(`Alias note must be ${MAX_ALIAS_NOTE_LENGTH} characters or fewer.`);
    process.exit(1);
  }
}

async function saveEncryptedMetadata(
  aliasId: string,
  options: { label?: string; note?: string },
  vault: UnlockedVault
): Promise<AliasItem> {
  const body: Record<string, string> = {};

  if (options.label !== undefined) {
    body.encrypted_label = await encryptAliasMetadata(options.label, vault, {
      aliasId,
      field: "label",
    });
  }
  if (options.note !== undefined) {
    body.encrypted_note = await encryptAliasMetadata(options.note, vault, {
      aliasId,
      field: "note",
    });
  }

  const result = await apiPatch<AliasItem>(
    `/api/v1/alias/${encodeURIComponent(aliasId)}`,
    body
  );
  return result.data;
}

export const aliasNewCommand = new Command("new")
  .alias("create")
  .description("Create a new alias (default: random)")
  .option("-r, --random", "Generate random alias (default)")
  .option("-c, --custom <name>", "Custom local part")
  .option("-d, --domain <domain>", "Domain (default: anon.li)")
  .option("-l, --label <text>", "Vault-encrypted label for the alias")
  .option("--note <text>", "Encrypted private note for the alias")
  .option("--recipient <email>", "Recipient email to forward to")
  .action(async (options) => {
    requireAuth();

    const domain = (options.domain as string) || "anon.li";
    const isCustom = !!options.custom;

    // B5: Validate custom alias format before API call
    if (isCustom) {
      validateLocalPart(options.custom as string);
    }
    validateMetadata(options.label as string | undefined, options.note as string | undefined);

    // Check plan limits before creating
    const limitSpin = ui.spinner("Checking plan limits...");
    const plan = await fetchPlanInfo();
    limitSpin.stop();

    if (isCustom) {
      assertCountLimit("custom alias", plan.aliases.custom.used, plan.aliases.custom.limit);
    } else {
      assertCountLimit("random alias", plan.aliases.random.used, plan.aliases.random.limit);
    }

    const needsMetadata = options.label !== undefined || options.note !== undefined;
    let vault: UnlockedVault | null = null;
    if (needsMetadata) {
      try {
        vault = await unlockVault();
      } catch (err) {
        ui.errorBox(
          "Vault Unlock Failed",
          err instanceof Error ? err.message : "Could not unlock your vault."
        );
        process.exit(1);
      }
    }

    const spin = ui.spinner("Creating alias...");

    try {
      const body: Record<string, unknown> = {
        domain,
        ...(options.recipient && { recipient_email: options.recipient }),
      };

      const result = isCustom
        ? await apiPost<AliasItem>("/api/v1/alias", {
          ...body,
          format: "custom",
          local_part: options.custom,
        })
        : await apiPost<AliasItem>("/api/v1/alias?generate=true", body);
      let alias = result.data;

      spin.succeed(`Created: ${ui.c.accent(alias.email)}`);

      if (needsMetadata && vault) {
        const metadataSpin = ui.spinner("Saving encrypted metadata...");
        try {
          alias = await saveEncryptedMetadata(
            alias.id,
            {
              label: options.label as string | undefined,
              note: options.note as string | undefined,
            },
            vault
          );
          metadataSpin.succeed("Encrypted metadata saved");
        } catch (err) {
          metadataSpin.fail("Failed to save encrypted metadata.");
          ui.error(err instanceof Error ? err.message : "Unknown error");
          ui.info(`Alias was created: ${ui.c.accent(alias.email)}`);
          process.exit(1);
        }
      }

      // U9: Show forwarding path in success output
      if (options.recipient) {
        ui.info(`Forwards to: ${ui.c.primary(options.recipient as string)}`);
      }
      if (options.label !== undefined) {
        ui.info("Encrypted label saved.");
      }
      if (options.note !== undefined) {
        ui.info("Encrypted note saved.");
      }
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to create alias.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
