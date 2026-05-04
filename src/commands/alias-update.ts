import { Command } from "commander";
import { requireAuth, apiGet, apiPatch } from "../lib/api.js";
import { encryptAliasMetadata, unlockVault } from "../lib/vault.js";
import * as ui from "../lib/ui.js";
import type { AliasItem } from "../types/api.js";

const MAX_ALIAS_LABEL_LENGTH = 50;
const MAX_ALIAS_NOTE_LENGTH = 500;

function validateMetadataOptions(options: {
  label?: string;
  note?: string;
  clearLabel?: boolean;
  clearNote?: boolean;
}): void {
  if (options.label !== undefined && options.clearLabel) {
    ui.error("Cannot use both --label and --clear-label");
    process.exit(1);
  }
  if (options.note !== undefined && options.clearNote) {
    ui.error("Cannot use both --note and --clear-note");
    process.exit(1);
  }
  if (options.label !== undefined && options.label.length > MAX_ALIAS_LABEL_LENGTH) {
    ui.error(`Alias label must be ${MAX_ALIAS_LABEL_LENGTH} characters or fewer.`);
    process.exit(1);
  }
  if (options.note !== undefined && options.note.length > MAX_ALIAS_NOTE_LENGTH) {
    ui.error(`Alias note must be ${MAX_ALIAS_NOTE_LENGTH} characters or fewer.`);
    process.exit(1);
  }
}

export const aliasUpdateCommand = new Command("update")
  .alias("edit")
  .description("Update an alias")
  .argument("<alias>", "Alias email address")
  .option("--enable", "Enable the alias")
  .option("--disable", "Disable the alias")
  .option("-l, --label <text>", "Update encrypted label")
  .option("--note <text>", "Update encrypted private note")
  .option("--clear-label", "Clear encrypted label")
  .option("--clear-note", "Clear encrypted private note")
  .option("--recipient <email>", "Forward to this recipient email")
  .option(
    "--recipient-id <id>",
    "Forward to this recipient ID (repeat for multiple, max 10)",
    (val: string, prev: string[] = []) => prev.concat(val),
    [] as string[]
  )
  .option("--clear-recipients", "Remove all recipients (use the default)")
  .action(async (alias: string, options: {
    enable?: boolean;
    disable?: boolean;
    label?: string;
    note?: string;
    clearLabel?: boolean;
    clearNote?: boolean;
    recipient?: string;
    recipientId?: string[];
    clearRecipients?: boolean;
  }) => {
    requireAuth();

    const recipientIds = options.recipientId ?? [];
    const hasRecipientChange =
      options.recipient !== undefined ||
      recipientIds.length > 0 ||
      !!options.clearRecipients;

    if (
      !options.enable &&
      !options.disable &&
      options.label === undefined &&
      options.note === undefined &&
      !options.clearLabel &&
      !options.clearNote &&
      !hasRecipientChange
    ) {
      ui.error("Provide at least one option: --enable, --disable, --label, --note, --clear-label, --clear-note, --recipient, --recipient-id, or --clear-recipients");
      process.exit(1);
    }

    if (options.enable && options.disable) {
      ui.error("Cannot use both --enable and --disable");
      process.exit(1);
    }
    if (recipientIds.length > 10) {
      ui.error("--recipient-id may be specified at most 10 times.");
      process.exit(1);
    }
    const recipientFlagCount =
      (options.recipient !== undefined ? 1 : 0) +
      (recipientIds.length > 0 ? 1 : 0) +
      (options.clearRecipients ? 1 : 0);
    if (recipientFlagCount > 1) {
      ui.error("Use at most one of --recipient, --recipient-id, --clear-recipients.");
      process.exit(1);
    }
    validateMetadataOptions(options);

    let spin: ReturnType<typeof ui.spinner> | null = null;

    try {
      const body: Record<string, unknown> = {};
      let resolvedAlias = alias;

      if (options.enable) {
        body.active = true;
      } else if (options.disable) {
        body.active = false;
      }

      const needsEncryption = options.label !== undefined || options.note !== undefined;
      if (needsEncryption) {
        const current = await apiGet<AliasItem>(
          `/api/v1/alias/${encodeURIComponent(alias)}`
        );
        resolvedAlias = current.data.id;
        const vault = await unlockVault();

        if (options.label !== undefined) {
          body.encrypted_label = await encryptAliasMetadata(options.label, vault, {
            aliasId: current.data.id,
            field: "label",
          });
        }
        if (options.note !== undefined) {
          body.encrypted_note = await encryptAliasMetadata(options.note, vault, {
            aliasId: current.data.id,
            field: "note",
          });
        }
      }

      if (options.clearLabel) {
        body.encrypted_label = null;
      }
      if (options.clearNote) {
        body.encrypted_note = null;
      }
      if (options.recipient !== undefined) {
        body.recipient_email = options.recipient;
      }
      if (recipientIds.length > 0) {
        body.recipient_ids = recipientIds;
      }
      if (options.clearRecipients) {
        body.recipient_ids = [];
      }

      spin = ui.spinner("Updating alias...");
      const result = await apiPatch<AliasItem>(
        `/api/v1/alias/${encodeURIComponent(resolvedAlias)}`,
        body
      );
      spin.stop();

      const status = result.data.active
        ? ui.statusBadge("Active", "active")
        : ui.statusBadge("Inactive", "inactive");

      ui.successBox(
        "Alias Updated",
        `${ui.c.accent(result.data.email)} is now ${status}`
      );

      if (options.label !== undefined) {
        ui.info("Encrypted label saved.");
      }
      if (options.note !== undefined) {
        ui.info("Encrypted note saved.");
      }
      if (options.clearLabel) {
        ui.info("Encrypted label cleared.");
      }
      if (options.clearNote) {
        ui.info("Encrypted note cleared.");
      }
      if (options.recipient !== undefined) {
        ui.info(`Forwarding to: ${ui.c.primary(options.recipient)}`);
      }
      if (recipientIds.length > 0) {
        ui.info(`Forwarding to ${ui.c.primary(String(recipientIds.length))} recipient(s).`);
      }
      if (options.clearRecipients) {
        ui.info("Recipients cleared (using default).");
      }

      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      if (spin) {
        spin.fail("Failed to update alias.");
      } else {
        ui.error("Failed to update alias.");
      }
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
