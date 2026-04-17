import { webcrypto } from "node:crypto";
import { argon2id } from "hash-wasm";
import { apiGet, apiPost } from "./api.js";
import {
  ARGON2_HASH_LENGTH,
  ARGON2_MEMORY,
  ARGON2_PARALLELISM,
  ARGON2_TIME,
} from "./constants.js";
import {
  arrayBufferToBase64Url,
  base64UrlToArrayBuffer,
  extractStoredKeyMaterial,
} from "./crypto.js";
import * as ui from "./ui.js";
import type {
  MeResponse,
  VaultBootstrapResponse,
  VaultUnlockResponse,
} from "../types/api.js";

type WebCryptoKey = webcrypto.CryptoKey;
type BinaryLike = ArrayBuffer | ArrayBufferView;
type VaultTextField = "label" | "note";

const subtle = webcrypto.subtle;
const AES_GCM_ALGORITHM = { name: "AES-GCM", length: 256 } as const;
const AES_KW_ALGORITHM = { name: "AES-KW", length: 256 } as const;
const TEXT_IV_BYTES = 12;
const SUPPORTED_KDF_VERSION = 1;

export interface UnlockedVault {
  vaultId: string;
  vaultGeneration: number;
  vaultKey: WebCryptoKey;
}

interface VaultEncryptedTextEnvelope {
  v: 1;
  alg: "AES-256-GCM";
  iv: string;
  ct: string;
}

let cachedVault: UnlockedVault | null = null;

function toUint8Array(value: BinaryLike): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return new Uint8Array(value);
}

function toArrayBuffer(value: BinaryLike): ArrayBuffer {
  const bytes = toUint8Array(value);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

function toBufferSource(value: BinaryLike): ArrayBuffer {
  return toArrayBuffer(value);
}

async function deriveBytes(
  password: string,
  salt: string
): Promise<Uint8Array> {
  const saltBytes = new Uint8Array(base64UrlToArrayBuffer(salt));
  const output = await argon2id({
    password,
    salt: saltBytes,
    memorySize: ARGON2_MEMORY,
    iterations: ARGON2_TIME,
    parallelism: ARGON2_PARALLELISM,
    hashLength: ARGON2_HASH_LENGTH,
    outputType: "binary",
  });

  return new Uint8Array(output);
}

async function deriveAuthSecret(
  password: string,
  authSalt: string
): Promise<Uint8Array> {
  return deriveBytes(password, authSalt);
}

async function derivePasswordKEK(
  password: string,
  vaultSalt: string
): Promise<WebCryptoKey> {
  const raw = await deriveBytes(password, vaultSalt);
  return subtle.importKey(
    "raw",
    toBufferSource(raw),
    AES_KW_ALGORITHM,
    false,
    ["wrapKey", "unwrapKey"]
  );
}

async function unwrapVaultKey(
  wrappedKey: string,
  unwrappingKey: WebCryptoKey
): Promise<WebCryptoKey> {
  return subtle.unwrapKey(
    "raw",
    toBufferSource(base64UrlToArrayBuffer(wrappedKey)),
    unwrappingKey,
    "AES-KW",
    AES_GCM_ALGORITHM,
    true,
    ["encrypt", "decrypt"]
  );
}

async function getVaultWrappingKey(vaultKey: WebCryptoKey): Promise<WebCryptoKey> {
  const rawVaultKey = await subtle.exportKey("raw", vaultKey);
  return subtle.importKey(
    "raw",
    toBufferSource(rawVaultKey),
    AES_KW_ALGORITHM,
    false,
    ["wrapKey", "unwrapKey"]
  );
}

export async function wrapDropKeyWithVault(
  keyString: string,
  vault: UnlockedVault
): Promise<string> {
  const rawKey = extractStoredKeyMaterial(keyString);
  const wrappingKey = await getVaultWrappingKey(vault.vaultKey);
  const keyToWrap = await subtle.importKey(
    "raw",
    toBufferSource(rawKey),
    AES_GCM_ALGORITHM,
    true,
    ["encrypt", "decrypt"]
  );
  const wrapped = await subtle.wrapKey("raw", keyToWrap, wrappingKey, "AES-KW");
  return arrayBufferToBase64Url(wrapped);
}

function aliasMetadataAad(aliasId: string, field: VaultTextField): Uint8Array {
  return new TextEncoder().encode(`anon.li:alias-metadata:v1:${aliasId}:${field}`);
}

export async function encryptAliasMetadata(
  plaintext: string,
  vault: UnlockedVault,
  context: { aliasId: string; field: VaultTextField }
): Promise<string> {
  const iv = webcrypto.getRandomValues(new Uint8Array(TEXT_IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toBufferSource(iv),
      additionalData: toBufferSource(aliasMetadataAad(context.aliasId, context.field)),
    },
    vault.vaultKey,
    toBufferSource(encoded)
  );

  const envelope: VaultEncryptedTextEnvelope = {
    v: 1,
    alg: "AES-256-GCM",
    iv: arrayBufferToBase64Url(iv),
    ct: arrayBufferToBase64Url(toArrayBuffer(ciphertext)),
  };

  return JSON.stringify(envelope);
}

async function getCurrentEmail(): Promise<string> {
  const result = await apiGet<MeResponse>("/api/v1/me");
  if (!result.data.email) {
    throw new Error("Could not determine account email for vault unlock.");
  }
  return result.data.email;
}

export async function unlockVault(): Promise<UnlockedVault> {
  if (cachedVault) return cachedVault;

  if (!process.stdin.isTTY) {
    throw new Error("Vault unlock requires an interactive terminal.");
  }

  const email = await getCurrentEmail();
  const bootstrap = await apiPost<VaultBootstrapResponse>("/api/vault/bootstrap", {
    email,
  });

  if (bootstrap.data.kdfVersion !== SUPPORTED_KDF_VERSION) {
    throw new Error(`Unsupported vault KDF version: ${bootstrap.data.kdfVersion}`);
  }

  let password = await ui.prompt("Vault password:", { mask: true });
  if (!password) {
    throw new Error("Vault password is required.");
  }

  try {
    const authSecret = arrayBufferToBase64Url(
      await deriveAuthSecret(password, bootstrap.data.authSalt)
    );
    const unlock = await apiPost<VaultUnlockResponse>("/api/v1/vault/unlock", {
      auth_secret: authSecret,
    });

    if (unlock.data.kdf_version !== SUPPORTED_KDF_VERSION) {
      throw new Error(`Unsupported vault KDF version: ${unlock.data.kdf_version}`);
    }

    const passwordKey = await derivePasswordKEK(password, unlock.data.vault_salt);
    const vaultKey = await unwrapVaultKey(
      unlock.data.password_wrapped_vault_key,
      passwordKey
    );

    cachedVault = {
      vaultId: unlock.data.vault_id,
      vaultGeneration: unlock.data.vault_generation,
      vaultKey,
    };
    return cachedVault;
  } finally {
    password = "";
  }
}
