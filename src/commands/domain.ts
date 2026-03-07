import { Command } from "commander";
import { requireAuth, apiGetList, apiGet, apiPost, apiDelete } from "../lib/api.js";
import { fetchPlanInfo, assertCountLimit } from "../lib/limits.js";
import * as ui from "../lib/ui.js";
import type { DomainItem } from "../types/api.js";

export const domainCommand = new Command("domain")
  .alias("domains")
  .description("Manage custom domains");

// List domains
domainCommand
  .command("list")
  .alias("ls")
  .description("List all domains")
  // U1: JSON output
  .option("--json", "Output raw JSON")
  .action(async (options: { json?: boolean }) => {
    requireAuth();
    const spin = ui.spinner("Fetching domains...");

    try {
      const result = await apiGetList<DomainItem>("/api/v1/domain");
      spin.stop();

      // U1: JSON output
      if (options.json) {
        ui.outputJson(result.data);
        return;
      }

      if (result.data.length === 0) {
        ui.box(
          `${ui.c.secondary("No custom domains yet.")}\n${ui.c.muted("Add one with")} ${ui.c.accent("anonli domain add <domain>")}`,
          { title: ui.c.info("Domains") }
        );
        return;
      }

      ui.table(
        ["Domain", "Status", "MX", "SPF", "DKIM", "Created"],
        result.data.map((d) => [
          d.domain,
          d.verified ? ui.statusBadge("verified", "active") : ui.statusBadge("pending", "inactive"),
          d.mx_verified ? ui.c.accent("✓") : ui.c.error("✗"),
          d.spf_verified ? ui.c.accent("✓") : ui.c.error("✗"),
          d.dkim_verified ? ui.c.accent("✓") : ui.c.error("✗"),
          ui.formatDate(d.created_at),
        ])
      );

      console.log(ui.dim(`  ${result.total} domain(s) total`));
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to list domains.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });

// B6: FQDN validation regex
const FQDN_RE = /^(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

// Add domain
domainCommand
  .command("add <domain>")
  .description("Add a custom domain")
  .action(async (domain: string) => {
    requireAuth();

    // B6: Validate domain format before API call
    if (!FQDN_RE.test(domain)) {
      ui.error(`Invalid domain: "${domain}". Please enter a valid fully-qualified domain name (e.g. mail.example.com).`);
      process.exit(1);
    }

    // Check plan limits before adding
    const limitSpin = ui.spinner("Checking plan limits...");
    const plan = await fetchPlanInfo();
    limitSpin.stop();
    assertCountLimit("domain", plan.domains.used, plan.domains.limit);

    const spin = ui.spinner("Adding domain...");

    try {
      const result = await apiPost<DomainItem>("/api/v1/domain", {
        domain: domain.toLowerCase(),
      });
      spin.succeed(`Added: ${ui.c.accent(result.data.domain)}`);

      ui.spacer();
      ui.sectionTitle("DNS Records to Configure");
      ui.spacer();

      // Show DNS records
      console.log(ui.c.secondary("1. Ownership TXT record:"));
      console.log(`   Host: ${ui.c.accent(result.data.domain)}`);
      console.log(`   Value: ${ui.c.primary(`anon.li=${result.data.verification_token}`)}`);
      ui.spacer();

      console.log(ui.c.secondary("2. MX record:"));
      console.log(`   Host: ${ui.c.accent(result.data.domain)}`);
      console.log(`   Value: ${ui.c.primary("mx.anon.li")} (priority 10)`);
      ui.spacer();

      console.log(ui.c.secondary("3. SPF TXT record:"));
      console.log(`   Host: ${ui.c.accent(result.data.domain)}`);
      console.log(`   Value: ${ui.c.primary("v=spf1 include:anon.li ~all")}`);
      ui.spacer();

      if (result.data.dkim_selector && result.data.dkim_public_key) {
        const cleanKey = result.data.dkim_public_key
          .replace(/-----BEGIN PUBLIC KEY-----/g, "")
          .replace(/-----END PUBLIC KEY-----/g, "")
          .replace(/[\n\r\s]/g, "");

        console.log(ui.c.secondary("4. DKIM TXT record:"));
        console.log(`   Host: ${ui.c.accent(`${result.data.dkim_selector}._domainkey.${result.data.domain}`)}`);
        console.log(`   Value: ${ui.c.primary(`v=DKIM1; k=rsa; p=${cleanKey}`)}`);
        ui.spacer();
      }

      ui.info(`Run ${ui.c.accent(`anonli domain verify ${result.data.id}`)} after configuring DNS.`);
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to add domain.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });

// Verify domain
domainCommand
  .command("verify <id>")
  .description("Verify domain DNS records")
  .action(async (id: string) => {
    requireAuth();
    const spin = ui.spinner("Checking DNS records...");

    try {
      const result = await apiPost<{
        verified: boolean;
        ownership_verified: boolean;
        mx_verified: boolean;
        spf_verified: boolean;
        dkim_verified: boolean;
      }>(`/api/v1/domain/${encodeURIComponent(id)}/verify`);

      spin.stop();

      const d = result.data;
      const statusIcon = (ok: boolean) => ok ? ui.c.accent("✓") : ui.c.error("✗");

      ui.header("DNS Verification Results");
      ui.spacer();
      console.log(`  Ownership: ${statusIcon(d.ownership_verified)}`);
      console.log(`  MX:        ${statusIcon(d.mx_verified)}`);
      console.log(`  SPF:       ${statusIcon(d.spf_verified)}`);
      console.log(`  DKIM:      ${statusIcon(d.dkim_verified)}`);
      ui.spacer();

      if (d.verified) {
        ui.successBox("Domain Verified", "All DNS records are correctly configured.");
      } else {
        ui.warn("Some DNS records are missing or incorrect. Check your DNS configuration.");
      }

      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to verify domain.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });

// Show domain info
domainCommand
  .command("info <id>")
  .alias("get")
  .description("Show domain details and DNS records")
  .action(async (id: string) => {
    requireAuth();
    const spin = ui.spinner("Fetching domain...");

    try {
      const result = await apiGet<DomainItem & { dns_records: Record<string, unknown> }>(
        `/api/v1/domain/${encodeURIComponent(id)}`
      );
      spin.stop();

      const d = result.data;
      ui.header(`Domain: ${d.domain}`);
      ui.spacer();

      ui.keyValue("ID", d.id);
      ui.keyValue("Status", d.verified ? "Verified" : "Pending");
      ui.keyValue("Ownership", d.ownership_verified ? "✓" : "✗");
      ui.keyValue("MX", d.mx_verified ? "✓" : "✗");
      ui.keyValue("SPF", d.spf_verified ? "✓" : "✗");
      ui.keyValue("DKIM", d.dkim_verified ? "✓" : "✗");
      ui.keyValue("Created", ui.formatDate(d.created_at));

      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to fetch domain.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });

// Delete domain
domainCommand
  .command("delete <id>")
  .alias("rm")
  .description("Delete a domain")
  .option("-f, --force", "Skip confirmation")
  .action(async (id: string, options) => {
    requireAuth();

    if (!options.force) {
      const confirmed = await ui.confirm(
        `Delete domain ${id}? This will also delete all aliases on this domain.`
      );
      if (!confirmed) {
        ui.info("Cancelled.");
        return;
      }
    }

    const spin = ui.spinner("Deleting domain...");

    try {
      const result = await apiDelete(`/api/v1/domain/${encodeURIComponent(id)}`);
      spin.succeed("Domain deleted.");
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to delete domain.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });

// Regenerate DKIM
domainCommand
  .command("dkim <id>")
  .description("Regenerate DKIM keys")
  .action(async (id: string) => {
    requireAuth();
    const spin = ui.spinner("Regenerating DKIM keys...");

    try {
      const result = await apiPost<{
        id: string;
        domain: string;
        dkim_selector: string;
        dkim_record: { type: string; host: string; value: string };
      }>(`/api/v1/domain/${encodeURIComponent(id)}/dkim`);

      spin.succeed("DKIM keys regenerated.");
      ui.spacer();

      const rec = result.data.dkim_record;
      console.log(ui.c.secondary("Update your DKIM TXT record:"));
      console.log(`  Host:  ${ui.c.accent(rec.host)}`);
      console.log(`  Value: ${ui.c.primary(rec.value)}`);

      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to regenerate DKIM keys.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
