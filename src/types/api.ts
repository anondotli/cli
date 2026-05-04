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
  product: "bundle" | "alias" | "drop" | "form" | null;
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
  vault_configured: boolean;
}

export interface CreateDropResponse {
  drop_id: string;
  expires_at: string | null;
  owner_key_stored?: boolean;
  session_token?: string | null;
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

interface DropFileMetadata {
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
  label?: string | null;
  note?: string | null;
  encrypted_label?: string | null;
  encrypted_note?: string | null;
  metadata_version?: number;
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

export interface BatchDownloadResponse {
  success: boolean;
  downloadUrls: Record<string, string>;
}

export interface VaultBootstrapResponse {
  authSalt: string;
  kdfVersion: number;
}

export interface VaultUnlockResponse {
  vault_id: string;
  vault_generation: number;
  vault_salt: string;
  password_wrapped_vault_key: string;
  kdf_version: number;
}

export interface VaultDropKeyEntry {
  drop_id: string;
  wrapped_key: string;
  vault_generation: number;
}

export interface FormSummary {
  id: string;
  title: string;
  description: string | null;
  active: boolean;
  disabled_by_user: boolean;
  taken_down: boolean;
  allow_file_uploads: boolean;
  submissions_count: number;
  max_submissions: number | null;
  closes_at: string | null;
  hide_branding: boolean;
  notify_on_submission: boolean;
  created_at: string;
  updated_at: string;
}

export interface FormPublicView {
  id: string;
  title: string;
  description: string | null;
  schema: unknown;
  public_key: string;
  custom_key: boolean;
  salt: string | null;
  custom_key_data: string | null;
  custom_key_iv: string | null;
  active: boolean;
  hide_branding: boolean;
  closes_at: string | null;
  allow_file_uploads: boolean;
  max_file_size_override: number | null;
}

export interface CreateFormResponse {
  id: string;
  title: string;
  public_key: string;
  created_at: string;
}

export interface FormSubmissionSummary {
  id: string;
  created_at: string;
  read_at: string | null;
  has_attached_drop: boolean;
}
