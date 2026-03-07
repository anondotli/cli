import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AnonliConfig } from "../types/config.js";
import { DEFAULT_CONFIG } from "../types/config.js";

function getConfigPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg || path.join(os.homedir(), ".config");
  return path.join(base, "anonli.json");
}

export function loadConfig(): AnonliConfig {
  const configPath = getConfigPath();
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    const config = { ...DEFAULT_CONFIG, ...parsed };
    if (!config.baseUrl) {
      config.baseUrl = DEFAULT_CONFIG.baseUrl;
    }
    return config;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: AnonliConfig): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
}

export function getApiKey(): string | undefined {
  return process.env.ANONLI_API_KEY || loadConfig().apiKey;
}

export function getBaseUrl(): string {
  return process.env.ANONLI_BASE_URL || loadConfig().baseUrl;
}

export function setApiKey(key: string): void {
  const config = loadConfig();
  config.apiKey = key;
  saveConfig(config);
}

export function removeApiKey(): void {
  const config = loadConfig();
  delete config.apiKey;
  delete config.userEmail;
  delete config.userName;
  saveConfig(config);
}

export function setUserInfo(email: string, name: string | null): void {
  const config = loadConfig();
  config.userEmail = email;
  config.userName = name;
  saveConfig(config);
}

export function getUserInfo(): { email: string; name: string | null } | null {
  const config = loadConfig();
  if (!config.userEmail) return null;
  return { email: config.userEmail, name: config.userName ?? null };
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 6) + "..." + key.slice(-4);
}
