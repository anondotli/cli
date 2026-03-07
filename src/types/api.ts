export interface ApiSuccessResponse<T> {
  data: T;
  meta: {
    request_id: string;
    [key: string]: unknown;
  };
}

export interface ApiListResponse<T> {
  data: T[];
  meta: {
    request_id: string;
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
    [key: string]: unknown;
  };
}

export interface ApiErrorResponse {
  error: {
    message: string;
    code: string;
    details?: { field: string; message: string }[];
  };
  meta: {
    request_id: string;
  };
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string | null;
  tier: "free" | "plus" | "pro";
  product: "bundle" | "alias" | "drop" | null;
  created_at: string;
  aliases: {
    random: { used: number; limit: number };
    custom: { used: number; limit: number };
  };
  domains: { used: number; limit: number };
  recipients: { used: number; limit: number };
  drops: { count: number };
  storage: { used: string; limit: string };
  limits: {
    max_file_size: number;
    max_expiry_days: number;
    api_requests: number;
  };
  features: {
    customKey: boolean;
    downloadLimits: boolean;
    noBranding: boolean;
    downloadNotifications: boolean;
    filePreview: boolean;
  };
}

export interface CreateDropResponse {
  drop_id: string;
  session_token: string | null;
  expires_at: string | null;
}

export interface AddFileResponse {
  fileId: string;
  s3UploadId: string;
  uploadUrls: Record<string, string>;
}

export interface DropMetadata {
  id: string;
  encryptedTitle: string | null;
  encryptedMessage: string | null;
  iv: string;
  customKey: boolean;
  salt: string | null;
  customKeyData: string | null;
  customKeyIv: string | null;
  downloads: number;
  maxDownloads: number | null;
  expiresAt: string | null;
  hideBranding: boolean;
  createdAt: string;
  files: DropFileMetadata[];
}

export interface DropFileMetadata {
  id: string;
  encryptedName: string;
  size: string;
  mimeType: string;
  iv: string;
  chunkSize: number | null;
  chunkCount: number | null;
}

export interface DropListItem {
  id: string;
  encryptedTitle: string | null;
  downloads: number;
  maxDownloads: number | null;
  expires_at: string | null;
  created_at: string;
  disabled: boolean;
  takenDown?: boolean;
  uploadComplete: boolean;
  fileCount: number;
  totalSize: string;
}

export interface AliasItem {
  id: string;
  email: string;
  active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecipientItem {
  id: string;
  email: string;
  verified: boolean;
  is_default: boolean;
  pgp_fingerprint: string | null;
  pgp_key_name: string | null;
  alias_count: number;
  created_at: string;
}

export interface DomainItem {
  id: string;
  domain: string;
  verified: boolean;
  ownership_verified: boolean;
  mx_verified: boolean;
  spf_verified: boolean;
  dkim_verified: boolean;
  verification_token: string;
  dkim_public_key: string | null;
  dkim_selector: string | null;
  created_at: string;
}

export interface ApiKeyItem {
  id: string;
  key_prefix: string;
  label: string | null;
  created_at: string;
}

export interface ApiKeyCreateResponse {
  id: string;
  key: string;
  key_prefix: string;
  label: string | null;
  created_at: string;
}
