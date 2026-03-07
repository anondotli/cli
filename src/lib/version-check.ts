import semver from "semver";
import { loadConfig, saveConfig } from "./config.js";
import { updateNotice } from "./ui.js";

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function checkForUpdates(currentVersion: string): Promise<void> {
  // Skip version check in CI/CD or when explicitly disabled (F8)
  if (process.env.ANONLI_NO_UPDATE_CHECK) return;

  const config = loadConfig();

  // Check if we have a cached result that's still fresh
  if (
    config.lastVersionCheck &&
    config.latestVersion &&
    Date.now() - config.lastVersionCheck < CACHE_DURATION_MS
  ) {
    printUpdateNotice(currentVersion, config.latestVersion);
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch("https://registry.npmjs.org/anonli/latest", {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return;

    const data = (await res.json()) as { version: string };
    const latestVersion = data.version;

    // Cache the result
    config.lastVersionCheck = Date.now();
    config.latestVersion = latestVersion;
    saveConfig(config);

    printUpdateNotice(currentVersion, latestVersion);
  } catch {
    // Silently fail — not critical
  }
}

function printUpdateNotice(current: string, latest: string): void {
  if (semver.gt(latest, current)) {
    updateNotice(current, latest);
  }
}
