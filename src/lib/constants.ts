/** 1 Megabyte in bytes */
const MB = 1024 * 1024;

/** 1 Gigabyte in bytes */
const GB = 1024 * MB;

/** Maximum chunks per file */
export const MAX_CHUNKS_PER_FILE = 100;

/** Minimum chunk size (50 MB) */
export const MIN_CHUNK_SIZE = 50 * MB;

/** File size threshold: 1 GB */
export const FILE_SIZE_THRESHOLD_1GB = 1 * GB;

/** Argon2id parameters for password key derivation (OWASP recommended) */
export const ARGON2_MEMORY = 65536;    // 64 MiB
export const ARGON2_TIME = 3;          // iterations
export const ARGON2_PARALLELISM = 1;
export const ARGON2_HASH_LENGTH = 32;  // bytes (AES-256 key)

/** AES-GCM authentication tag size in bytes */
export const AUTH_TAG_SIZE = 16;

/** IV length in bytes */
export const IV_LENGTH = 12;

/** Salt length in bytes */
export const SALT_LENGTH = 32;

/** CLI version — read from package.json (single source of truth) */
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const CLI_VERSION: string = require("../../package.json").version;

/** Max retry attempts */
export const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms) */
export const RETRY_BASE_DELAY = 1000;

/** AAD for vault-wrapped form private keys. */
export const FORM_KEY_AAD = "anon.li:form-owner-key:v1";
