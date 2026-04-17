import { getApiKey, getBaseUrl } from "./config.js";
import { ApiError, AuthError, RateLimitError } from "./errors.js";
import { MAX_RETRIES, RETRY_BASE_DELAY, CLI_VERSION } from "./constants.js";
import type {
  ApiSuccessResponse,
  ApiListResponse,
  ApiErrorResponse,
  RateLimitInfo,
} from "../types/api.js";

// Actionable messages for known API error codes (U4)
const CODE_MESSAGES: Record<string, string> = {
  QUOTA_EXCEEDED: "Storage limit reached — upgrade at anon.li/dashboard",
  FORBIDDEN: "This feature requires a paid plan — see `anonli subscribe`",
  UNAUTHORIZED: "Invalid or expired API key — run `anonli login` to re-authenticate",
};

function getHeaders(): Record<string, string> {
  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": `anonli-cli/${CLI_VERSION}`,
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  return headers;
}

export function extractRateLimit(res: Response): RateLimitInfo | undefined {
  const limit = res.headers.get("X-RateLimit-Limit");
  const remaining = res.headers.get("X-RateLimit-Remaining");
  const reset = res.headers.get("X-RateLimit-Reset");

  if (limit && remaining && reset) {
    return {
      limit: parseInt(limit, 10),
      remaining: parseInt(remaining, 10),
      reset: parseInt(reset, 10),
    };
  }
  return undefined;
}

async function handleError(res: Response): Promise<never> {
  let body: ApiErrorResponse | { error: string } | undefined;
  try {
    body = (await res.json()) as ApiErrorResponse | { error: string };
  } catch {
    // No JSON body
  }

  if (res.status === 401) {
    const rawMsg =
      (body && "error" in body && typeof body.error === "string"
        ? body.error
        : (body as ApiErrorResponse)?.error?.message) || "Unauthorized";
    const message = rawMsg === "Unauthorized"
      ? (CODE_MESSAGES["UNAUTHORIZED"] ?? rawMsg)
      : rawMsg;
    throw new AuthError(message);
  }

  if (res.status === 429) {
    const resetHeader = res.headers.get("X-RateLimit-Reset");
    const resetDate = resetHeader
      ? new Date(parseInt(resetHeader, 10))
      : new Date(Date.now() + 60_000);
    throw new RateLimitError(
      (body as ApiErrorResponse)?.error?.message || "Rate limit exceeded",
      resetDate
    );
  }

  const apiCode = (body as ApiErrorResponse)?.error?.code;
  const rawMessage =
    (body && "error" in body && typeof body.error === "object"
      ? (body as ApiErrorResponse).error.message
      : (body as { error: string })?.error) ||
    `Request failed with status ${res.status}`;

  // Use friendly message if available for this code
  const message = (apiCode && CODE_MESSAGES[apiCode]) || rawMessage;

  throw new ApiError(
    message,
    res.status,
    apiCode,
    (body as ApiErrorResponse)?.meta?.request_id
  );
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);

      // Don't retry client errors
      if (res.status >= 400 && res.status < 500) {
        return res;
      }

      // Retry server errors
      if (res.status >= 500 && attempt < retries) {
        await delay(RETRY_BASE_DELAY * Math.pow(2, attempt));
        continue;
      }

      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (lastError.name === "AbortError") {
        throw lastError;
      }

      if (attempt < retries) {
        await delay(RETRY_BASE_DELAY * Math.pow(2, attempt));
        continue;
      }
    }
  }

  throw lastError || new Error("Request failed after retries");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ApiResult<T> {
  data: T;
  rateLimit?: RateLimitInfo;
}

export interface ApiListResult<T> {
  data: T[];
  total: number;
  rateLimit?: RateLimitInfo;
  meta?: Record<string, unknown>;
}

export async function apiGet<T>(
  path: string,
  retry = true
): Promise<ApiResult<T>> {
  const url = `${getBaseUrl()}${path}`;
  const res = retry
    ? await fetchWithRetry(url, { method: "GET", headers: getHeaders() })
    : await fetch(url, { method: "GET", headers: getHeaders() });

  if (!res.ok) await handleError(res);

  const rateLimit = extractRateLimit(res);
  const json = (await res.json()) as ApiSuccessResponse<T>;
  return { data: json.data, rateLimit };
}

export async function apiGetList<T>(
  path: string
): Promise<ApiListResult<T>> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetchWithRetry(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!res.ok) await handleError(res);

  const rateLimit = extractRateLimit(res);
  const json = (await res.json()) as ApiListResponse<T>;
  return {
    data: json.data,
    total: json.meta.total,
    rateLimit,
    meta: json.meta as unknown as Record<string, unknown>,
  };
}

export async function apiPost<T>(
  path: string,
  body?: unknown
): Promise<ApiResult<T>> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) await handleError(res);

  const rateLimit = extractRateLimit(res);
  const json = (await res.json()) as ApiSuccessResponse<T>;
  return { data: json.data, rateLimit };
}

export async function apiPatch<T>(
  path: string,
  body?: unknown
): Promise<ApiResult<T>> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: getHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) await handleError(res);

  const rateLimit = extractRateLimit(res);
  const json = (await res.json()) as ApiSuccessResponse<T>;
  return { data: json.data, rateLimit };
}

export async function apiDelete(path: string): Promise<{ rateLimit?: RateLimitInfo }> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: getHeaders(),
  });

  if (!res.ok) await handleError(res);

  return { rateLimit: extractRateLimit(res) };
}

export async function apiRawFetch(
  url: string,
  options: RequestInit
): Promise<Response> {
  return fetch(url, options);
}

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${getBaseUrl()}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers as Record<string, string>),
    },
  });
}

export function requireAuth(): void {
  if (!getApiKey()) {
    throw new AuthError();
  }
}
