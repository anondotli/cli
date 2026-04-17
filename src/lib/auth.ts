import { setApiKey, removeApiKey, setUserInfo } from "./config.js";
import { apiGet } from "./api.js";
import * as ui from "./ui.js";
import type { MeResponse } from "../types/api.js";

/**
 * Run the interactive auth flow. Prompts for an API key (masked) if none
 * is provided and stdin is a TTY, validates it against /api/v1/me, and
 * persists it on success.
 *
 * @returns `true` on successful authentication, `false` on failure.
 */
export async function runAuthFlow(token?: string): Promise<boolean> {
  let apiKey = token;

  if (!apiKey) {
    ui.info(
      `Get your API key from ${ui.link("https://anon.li/dashboard/api-keys")}`
    );
    ui.spacer();
    apiKey = await ui.prompt("API key:", { mask: true });
  }

  if (!apiKey) {
    ui.error("No API key provided.");
    return false;
  }

  if (!apiKey.startsWith("ak_")) {
    ui.errorBox(
      "Invalid Key",
      'API keys start with "ak_".',
      "Get your key at https://anon.li/dashboard/api-keys"
    );
    return false;
  }

  const spin = ui.spinner("Validating API key...");

  try {
    setApiKey(apiKey);
    const result = await apiGet<MeResponse>("/api/v1/me");
    spin.stop();

    // Cache user info for home screen greeting
    setUserInfo(result.data.email, result.data.name);

    const badge = ui.tierBadge(result.data.tier, result.data.product);
    ui.successBox(
      "Authenticated",
      `Logged in as ${ui.c.accent(result.data.email)} ${badge}`
    );
    ui.showRateLimit(result.rateLimit);
    return true;
  } catch (err) {
    removeApiKey();
    spin.stop();
    ui.errorBox(
      "Authentication Failed",
      err instanceof Error ? err.message : "Invalid API key.",
      "Get your key at https://anon.li/dashboard/api-keys"
    );
    return false;
  }
}
