import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { requireAuth, apiPost } from "../lib/api.js";
import { fetchPlanInfo, assertFeature } from "../lib/limits.js";
import { unlockVault, wrapVaultPayload } from "../lib/vault.js";
import { generateFormKeypair, base64UrlToArrayBuffer } from "../lib/crypto.js";
import { getBaseUrl } from "../lib/config.js";
import * as ui from "../lib/ui.js";
import type { CreateFormResponse } from "../types/api.js";

interface FormSchemaShape {
  fields?: unknown;
}

export const formNewCommand = new Command("new")
  .alias("create")
  .description("Create a new encrypted form")
  .argument("<title>", "Form title")
  .requiredOption(
    "--schema-file <path>",
    "Path to a JSON file containing the form schema (FormSchemaDoc shape)"
  )
  .option("-d, --description <text>", "Form description")
  .option("--max-submissions <n>", "Cap total submissions", parseInt)
  .option("--closes-at <iso>", "Close the form at this ISO 8601 timestamp")
  .option("--hide-branding", "Hide anon.li branding (Pro)")
  .option("--no-notify", "Do not email on new submission")
  .action(async (title: string, options: {
    schemaFile: string;
    description?: string;
    maxSubmissions?: number;
    closesAt?: string;
    hideBranding?: boolean;
    notify?: boolean;
  }) => {
    requireAuth();

    const schemaPath = path.resolve(options.schemaFile);
    if (!fs.existsSync(schemaPath)) {
      ui.error(`Schema file not found: ${schemaPath}`);
      process.exit(1);
    }

    let schema: FormSchemaShape;
    try {
      schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as FormSchemaShape;
    } catch (err) {
      ui.error(`Failed to parse schema JSON: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
      return;
    }
    if (!schema || typeof schema !== "object" || !Array.isArray((schema as FormSchemaShape).fields)) {
      ui.error("Schema must be a JSON object with a `fields` array.");
      process.exit(1);
    }

    if (options.closesAt && Number.isNaN(Date.parse(options.closesAt))) {
      ui.error(`--closes-at is not a valid ISO 8601 timestamp: ${options.closesAt}`);
      process.exit(1);
    }

    const limitSpin = ui.spinner("Checking plan limits...");
    const plan = await fetchPlanInfo();
    limitSpin.stop();

    if (options.hideBranding) {
      assertFeature(plan.features, "noBranding", "--hide-branding");
    }

    ui.info("Unlock your vault to wrap the form's private key.");
    const vault = await unlockVault();

    const cryptoSpin = ui.spinner("Generating form keypair...");
    const keypair = await generateFormKeypair();
    const privateKeyBytes = new Uint8Array(base64UrlToArrayBuffer(keypair.privateKey));
    const wrappedPrivateKey = await wrapVaultPayload(privateKeyBytes, vault);
    cryptoSpin.stop();

    const createSpin = ui.spinner("Creating form...");
    try {
      const result = await apiPost<CreateFormResponse>("/api/v1/form", {
        title,
        ...(options.description && { description: options.description }),
        schema,
        publicKey: keypair.publicKey,
        wrappedPrivateKey,
        vaultId: vault.vaultId,
        vaultGeneration: vault.vaultGeneration,
        ...(options.maxSubmissions && { maxSubmissions: options.maxSubmissions }),
        ...(options.closesAt && { closesAt: new Date(options.closesAt).toISOString() }),
        ...(options.hideBranding && { hideBranding: true }),
        notifyOnSubmission: options.notify !== false,
      });
      createSpin.succeed(`Form created: ${result.data.id}`);

      const baseUrl = getBaseUrl();
      const publicUrl = `${baseUrl}/f/${result.data.id}`;

      ui.successBox(
        "Form Created",
        [
          `${ui.c.secondary("ID:")}    ${ui.c.primary(result.data.id)}`,
          `${ui.c.secondary("Title:")} ${ui.c.primary(result.data.title)}`,
          `${ui.c.secondary("URL:")}   ${ui.link(publicUrl)}`,
        ].join("\n")
      );
      ui.spacer();
      ui.warn(
        "The form's private key is wrapped in your vault. Without your vault password, submissions cannot be decrypted."
      );
      ui.info(
        "Note: decrypting submissions in the CLI is not yet supported (no API endpoint exposes the wrapped key with API-key auth). Use the dashboard to read submissions."
      );
      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      createSpin.fail("Failed to create form.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
