import { apiGet } from "./api.js";
import { PlanLimitError } from "./errors.js";
import * as ui from "./ui.js";
import type { MeResponse } from "../types/api.js";

const FEATURE_MAP: Record<string, { label: string; tier: string }> = {
  noBranding: { label: "Hide branding", tier: "Pro" },
  downloadNotifications: { label: "Download notifications", tier: "Pro" },
  customKey: { label: "Password protection", tier: "Plus" },
};

export async function fetchPlanInfo(): Promise<MeResponse> {
  const { data } = await apiGet<MeResponse>("/api/v1/me");
  return data;
}

export function assertFeature(
  features: MeResponse["features"],
  featureKey: keyof MeResponse["features"],
  flagName: string
): void {
  if (features[featureKey]) return;

  const info = FEATURE_MAP[featureKey];
  const label = info?.label ?? featureKey;
  const tier = info?.tier ?? "a paid";

  throw new PlanLimitError(
    `${label} (${flagName}) requires a ${tier} plan.`,
    `Upgrade with: anonli subscribe`
  );
}

export function assertCountLimit(
  resourceName: string,
  used: number,
  limit: number
): void {
  if (limit === 0) {
    throw new PlanLimitError(
      `${capitalize(resourceName)} is not available on your plan.`,
      `Upgrade with: anonli subscribe`
    );
  }
  if (used >= limit) {
    throw new PlanLimitError(
      `${capitalize(resourceName)} limit reached (${used}/${limit}).`,
      `Upgrade with: anonli subscribe`
    );
  }
}

export function assertStorageLimit(
  totalUploadSize: number,
  storageUsed: string,
  storageLimit: string
): void {
  const used = BigInt(storageUsed);
  const limit = BigInt(storageLimit);
  const upload = BigInt(totalUploadSize);

  if (used + upload > limit) {
    const available = limit > used ? Number(limit - used) : 0;
    throw new PlanLimitError(
      `Upload size (${ui.formatBytes(totalUploadSize)}) exceeds available storage (${ui.formatBytes(available)} of ${ui.formatBytes(Number(limit))} remaining).`,
      `Upgrade with: anonli subscribe`
    );
  }
}

export function warnExpiryCap(
  requestedDays: number,
  maxDays: number
): number {
  if (requestedDays > maxDays) {
    ui.warn(
      `Expiry capped to ${maxDays} days on your plan (requested ${requestedDays}).`
    );
    return maxDays;
  }
  return requestedDays;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
