import { Command } from "commander";
import { requireAuth, apiGetList, apiGet, apiPost, apiDelete, apiPatch } from "../lib/api.js";
import { fetchPlanInfo, assertCountLimit } from "../lib/limits.js";
import * as ui from "../lib/ui.js";
import type { RecipientItem } from "../types/api.js";

export const recipientCommand = new Command("recipient")
  .alias("recipients")
  .description("Manage email recipients");

// List recipients
recipientCommand
  .command("list")
  .alias("ls")
  .description("List all recipients")
  // U1: JSON output
  .option("--json", "Output raw JSON")
  .action(async (options: { json?: boolean }) => {
    requireAuth();
    const spin = ui.spinner("Fetching recipients...");

    try {
      const result = await apiGetList<RecipientItem>("/api/v1/recipient");
      spin.stop();

      // U1: JSON output
      if (options.json) {
        ui.outputJson(result.data);
        return;
      }

      if (result.data.length === 0) {
        ui.box(
          `${ui.c.secondary("No recipients yet.")}\n${ui.c.muted("Add one with")} ${ui.c.accent("anonli recipient add <email>")}`,
          { title: ui.c.info("Recipients") }
        );
        return;
      }

      ui.table(
        ["Email", "Status", "Default", "PGP", "Aliases", "Created"],
        result.data.map((r) => [
          r.email,
          r.verified ? ui.statusBadge("verified", "active") : ui.statusBadge("pending", "inactive"),
          r.is_default ? ui.c.accent("✓") : "",
          r.pgp_fingerprint ? ui.c.accent("✓") : "",
          String(r.alias_count || 0),
          ui.formatDate(r.created_at),
        ])
      );

      console.log(ui.dim(`  ${result.total} recipient(s) total`));
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to list recipients.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });

// Add recipient
recipientCommand
  .command("add <email>")
  .description("Add a new recipient")
  .action(async (email: string) => {
    requireAuth();

    // Check plan limits before adding
    const limitSpin = ui.spinner("Checking plan limits...");
    const plan = await fetchPlanInfo();
    limitSpin.stop();
    assertCountLimit("recipient", plan.recipients.used, plan.recipients.limit);

    const spin = ui.spinner("Adding recipient...");

    try {
      const result = await apiPost<RecipientItem>("/api/v1/recipient", { email });
      spin.succeed(`Added: ${ui.c.accent(result.data.email)}`);
      ui.info("Verification email sent. Check your inbox.");
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to add recipient.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });

// Delete recipient
recipientCommand
  .command("delete <id>")
  .alias("rm")
  .description("Delete a recipient")
  .option("-f, --force", "Skip confirmation")
  .action(async (id: string, options) => {
    requireAuth();

    if (!options.force) {
      const confirmed = await ui.confirm(`Delete recipient ${id}?`);
      if (!confirmed) {
        ui.info("Cancelled.");
        return;
      }
    }

    const spin = ui.spinner("Deleting recipient...");

    try {
      const result = await apiDelete(`/api/v1/recipient/${encodeURIComponent(id)}`);
      spin.succeed("Recipient deleted.");
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to delete recipient.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });

// Set default recipient
recipientCommand
  .command("default <id>")
  .description("Set a recipient as default")
  .action(async (id: string) => {
    requireAuth();
    const spin = ui.spinner("Setting default...");

    try {
      const result = await apiPatch<RecipientItem>(
        `/api/v1/recipient/${encodeURIComponent(id)}`,
        { is_default: true }
      );
      spin.succeed(`${ui.c.accent(result.data.email)} is now your default recipient.`);
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to set default.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });

// Resend verification
recipientCommand
  .command("verify <id>")
  .description("Resend verification email")
  .action(async (id: string) => {
    requireAuth();
    const spin = ui.spinner("Sending verification email...");

    try {
      const result = await apiPost(`/api/v1/recipient/${encodeURIComponent(id)}/verify`);
      spin.succeed("Verification email sent.");
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to send verification.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });

// PGP subcommands
const pgpCommand = recipientCommand
  .command("pgp")
  .description("Manage PGP keys for recipients");

pgpCommand
  .command("set <id>")
  .description("Set PGP public key for a recipient")
  .option("-k, --key <file>", "Path to PGP public key file")
  .option("-n, --name <name>", "Name/label for the key")
  .option("-f, --force", "Skip confirmation when replacing existing key")
  .action(async (id: string, options) => {
    requireAuth();

    if (!options.key) {
      ui.error("--key <file> is required");
      process.exit(1);
    }

    const fs = await import("node:fs");
    const path = await import("node:path");

    const keyPath = path.resolve(options.key);
    if (!fs.existsSync(keyPath)) {
      ui.error(`File not found: ${keyPath}`);
      process.exit(1);
    }

    // B7: Reject oversized files (max 20 KB)
    const keyFileStat = fs.statSync(keyPath);
    if (keyFileStat.size > 20 * 1024) {
      ui.error(`PGP key file is too large (${ui.formatBytes(keyFileStat.size)}). Maximum allowed size is 20 KB.`);
      process.exit(1);
    }

    const publicKey = fs.readFileSync(keyPath, "utf-8");

    // U7: Confirm before replacing existing PGP key (check recipient first)
    if (!options.force) {
      try {
        const existing = await apiGet<{ pgp_fingerprint: string | null }>(`/api/v1/recipient/${encodeURIComponent(id)}`);
        if (existing.data.pgp_fingerprint) {
          const confirmed = await ui.confirm(
            `Recipient already has a PGP key (${existing.data.pgp_fingerprint.slice(0, 16)}...). Replace it?`
          );
          if (!confirmed) {
            ui.info("Cancelled.");
            return;
          }
        }
      } catch {
        // If we can't fetch, proceed anyway
      }
    }

    const spin = ui.spinner("Setting PGP key...");

    try {
      const { apiFetch, extractRateLimit } = await import("../lib/api.js");
      const res = await apiFetch(`/api/v1/recipient/${encodeURIComponent(id)}/pgp`, {
        method: "PUT",
        body: JSON.stringify({
          public_key: publicKey,
          name: options.name,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: { message?: string } })?.error?.message || "Failed to set PGP key");
      }

      const rateLimit = extractRateLimit(res);
      const data = (await res.json()) as { data?: { pgp_fingerprint?: string } };
      spin.succeed("PGP key set successfully.");
      if (data.data?.pgp_fingerprint) {
        ui.info(`Fingerprint: ${data.data.pgp_fingerprint}`);
      }
      ui.showRateLimit(rateLimit);
    } catch (err) {
      spin.fail("Failed to set PGP key.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });

pgpCommand
  .command("remove <id>")
  .alias("rm")
  .description("Remove PGP key from a recipient")
  .action(async (id: string) => {
    requireAuth();
    const spin = ui.spinner("Removing PGP key...");

    try {
      const result = await apiDelete(`/api/v1/recipient/${encodeURIComponent(id)}/pgp`);
      spin.succeed("PGP key removed.");
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to remove PGP key.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
