import { Command } from "commander";
import { execFile } from "node:child_process";
import { requireAuth, apiPost } from "../lib/api.js";
import * as ui from "../lib/ui.js";

const PRICING = {
  bundle: {
    name: "Bundle",
    description: "Alias + Drop combined",
    plus: { monthly: "$6/mo", yearly: "$60/yr" },
    pro: { monthly: "$12/mo", yearly: "$120/yr" },
  },
  alias: {
    name: "Alias",
    description: "Anonymous email forwarding",
    plus: { monthly: "$3/mo", yearly: "$30/yr" },
    pro: { monthly: "$6/mo", yearly: "$60/yr" },
  },
  drop: {
    name: "Drop",
    description: "Encrypted file sharing",
    plus: { monthly: "$3/mo", yearly: "$30/yr" },
    pro: { monthly: "$6/mo", yearly: "$60/yr" },
  },
} as const;

function openUrl(url: string): void {
  const platform = process.platform;
  let cmd: string;
  let args: string[];

  if (platform === "darwin") {
    cmd = "open"; args = [url];
  } else if (platform === "win32") {
    cmd = "cmd"; args = ["/c", "start", "", url];
  } else {
    cmd = "xdg-open"; args = [url];
  }

  // B3: Handle browser open failure gracefully
  execFile(cmd, args, (err) => {
    if (err) {
      ui.warn(`Could not open browser automatically. Visit this URL manually:\n  ${url}`);
    }
  });
}

function showPricingTable(): void {
  ui.header("Plans & Pricing");
  ui.spacer();

  const headers = ["Product", "Tier", "Monthly", "Yearly"];
  const rows: string[][] = [];

  for (const [key, product] of Object.entries(PRICING)) {
    rows.push([
      `${ui.c.accent(product.name)} ${ui.c.muted(`(${key})`)}`,
      ui.c.accent("Plus"),
      product.plus.monthly,
      `${product.plus.yearly} ${ui.c.success("(save up to 25%)")}`,
    ]);
    rows.push([
      "",
      ui.c.gold("Pro"),
      product.pro.monthly,
      `${product.pro.yearly} ${ui.c.success("(save up to 25%)")}`,
    ]);
  }

  ui.table(headers, rows);

  ui.spacer();
  ui.info("Subscribe with:");
  console.log(ui.c.muted("  anonli subscribe --product bundle --tier plus --frequency monthly"));
  console.log(ui.c.muted("  anonli subscribe --product alias --tier pro --frequency yearly"));
  console.log(ui.c.muted("  anonli subscribe --product drop --tier plus --frequency yearly --promo CODE"));
}

interface SubscribeOptions {
  product?: string;
  tier?: string;
  frequency?: string;
  promo?: string;
  open?: boolean;
}

export const subscribeCommand = new Command("subscribe")
  .description("Subscribe to a paid plan")
  .option("--product <product>", "Product: bundle, alias, or drop")
  .option("--tier <tier>", "Tier: plus or pro")
  .option("--frequency <frequency>", "Billing: monthly or yearly")
  .option("--promo <code>", "Promotion code")
  .option("--no-open", "Don't open checkout URL in browser")
  .action(async (options: SubscribeOptions) => {
    // If no options provided, show pricing table
    if (!options.product && !options.tier && !options.frequency) {
      showPricingTable();
      return;
    }

    // Validate all required options are present
    if (!options.product || !options.tier || !options.frequency) {
      ui.errorBox(
        "Missing Options",
        "All three options are required: --product, --tier, --frequency",
        "Run 'anonli subscribe' without options to see available plans."
      );
      process.exit(1);
    }

    const validProducts = ["bundle", "alias", "drop"];
    const validTiers = ["plus", "pro"];
    const validFrequencies = ["monthly", "yearly"];

    if (!validProducts.includes(options.product)) {
      ui.error(`Invalid product: ${options.product}. Must be one of: ${validProducts.join(", ")}`);
      process.exit(1);
    }
    if (!validTiers.includes(options.tier)) {
      ui.error(`Invalid tier: ${options.tier}. Must be one of: ${validTiers.join(", ")}`);
      process.exit(1);
    }
    if (!validFrequencies.includes(options.frequency)) {
      ui.error(`Invalid frequency: ${options.frequency}. Must be one of: ${validFrequencies.join(", ")}`);
      process.exit(1);
    }

    requireAuth();

    const spin = ui.spinner("Creating checkout session...");

    try {
      const body: Record<string, string> = {
        product: options.product,
        tier: options.tier,
        frequency: options.frequency,
      };

      if (options.promo) {
        body.promoCode = options.promo;
      }

      const result = await apiPost<{ url: string }>("/api/v1/checkout", body);
      spin.stop();

      const url = result.data.url;

      ui.successBox(
        "Checkout Ready",
        `${ui.c.secondary("Complete your subscription in the browser:")}\n${ui.link(url)}`
      );

      if (options.open !== false) {
        openUrl(url);
        ui.info("Opening checkout in your default browser...");
      }

      ui.showRateLimit(result.rateLimit);
    } catch (err) {
      spin.fail("Failed to create checkout session.");
      ui.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
