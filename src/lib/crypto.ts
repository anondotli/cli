/**
 * Exact port of lib/crypto.client.ts for Node.js.
 * Uses crypto.subtle (Web Crypto API available in Node 18+).
 * Cross-compatible: CLI-encrypted files decrypt in the web client and vice versa.
 */

import { webcrypto } from "node:crypto";
import {
  MAX_CHUNKS_PER_FILE,
  MIN_CHUNK_SIZE,
  ARGON2_MEMORY,
  ARGON2_TIME,
  ARGON2_PARALLELISM,
  ARGON2_HASH_LENGTH,
  AUTH_TAG_SIZE,
  IV_LENGTH,
  SALT_LENGTH,
  FILE_SIZE_THRESHOLD_1GB,
} from "./constants.js";
import { argon2id } from "hash-wasm";

type WebCryptoKey = webcrypto.CryptoKey;

const subtle = webcrypto.subtle;
const getRandomValues = webcrypto.getRandomValues.bind(webcrypto);

const ALGORITHM = { name: "AES-GCM", length: 256 };

export interface EncryptionContext {
  key: WebCryptoKey;
  keyString: string;
  baseIv: Uint8Array;
  ivString: string;
}

// ── Key management ──────────────────────────────────────────────────

export async function generateKey(): Promise<string> {
  const key = await subtle.generateKey(ALGORITHM, true, [
    "encrypt",
    "decrypt",
  ]);
  const exported = await subtle.exportKey("raw", key);
  return arrayBufferToBase64Url(exported);
}

export async function importKey(keyString: string): Promise<WebCryptoKey> {
  const keyData = extractStoredKeyMaterial(keyString);
  return subtle.importKey("raw", keyData, ALGORITHM, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function createEncryptionContext(): Promise<EncryptionContext> {
  const keyString = await generateKey();
  const key = await importKey(keyString);
  const ivString = generateBaseIv();
  const baseIv = new Uint8Array(base64UrlToArrayBuffer(ivString));
  return { key, keyString, baseIv, ivString };
}

export async function restoreEncryptionContext(
  keyString: string,
  ivString: string
): Promise<EncryptionContext> {
  const key = await importKey(keyString);
  const baseIv = new Uint8Array(base64UrlToArrayBuffer(ivString));
  return { key, keyString, baseIv, ivString };
}

// ── Chunk encryption / decryption ───────────────────────────────────

export async function encryptChunk(
  chunk: ArrayBuffer,
  key: WebCryptoKey,
  baseIv: Uint8Array,
  chunkIndex: number
): Promise<ArrayBuffer> {
  const iv = generateChunkIv(baseIv, chunkIndex);
  return subtle.encrypt({ name: "AES-GCM", iv: getView(iv) }, key, chunk);
}

export async function decryptChunk(
  encryptedChunk: ArrayBuffer,
  key: WebCryptoKey,
  baseIv: Uint8Array,
  chunkIndex: number
): Promise<ArrayBuffer> {
  const iv = generateChunkIv(baseIv, chunkIndex);
  return subtle.decrypt(
    { name: "AES-GCM", iv: getView(iv) },
    key,
    encryptedChunk
  );
}

// ── Filename encryption ─────────────────────────────────────────────

export async function encryptFilename(
  filename: string,
  key: WebCryptoKey,
  iv: Uint8Array
): Promise<string> {
  const encoder = new TextEncoder();
  const filenameBuffer = encoder.encode(filename);
  const filenameIv = generateChunkIv(iv, 0xffffffff);
  const encrypted = await subtle.encrypt(
    { name: "AES-GCM", iv: getView(filenameIv) },
    key,
    filenameBuffer
  );
  return arrayBufferToBase64Url(encrypted);
}

export async function decryptFilename(
  encryptedFilename: string,
  key: WebCryptoKey,
  iv: Uint8Array
): Promise<string> {
  const encrypted = base64UrlToArrayBuffer(encryptedFilename);
  const filenameIv = generateChunkIv(iv, 0xffffffff);
  const decrypted = await subtle.decrypt(
    { name: "AES-GCM", iv: getView(filenameIv) },
    key,
    encrypted
  );
  return new TextDecoder().decode(decrypted);
}

// ── Password-based key wrapping ─────────────────────────────────────

export async function encryptKeyWithPassword(
  keyString: string,
  password: string
): Promise<{ encryptedKey: string; iv: string; salt: string }> {
  const salt = generateSalt();
  const wrappingKey = await deriveKeyFromPassword(password, salt);
  const iv = generateBaseIv();
  const ivBuffer = new Uint8Array(base64UrlToArrayBuffer(iv));

  const encoder = new TextEncoder();
  const keyData = encoder.encode(keyString);

  const encrypted = await subtle.encrypt(
    { name: "AES-GCM", iv: ivBuffer },
    wrappingKey,
    keyData
  );

  return {
    encryptedKey: arrayBufferToBase64Url(encrypted),
    iv,
    salt,
  };
}

export async function decryptKeyWithPassword(
  encryptedKey: string,
  password: string,
  salt: string,
  iv: string
): Promise<string> {
  const wrappingKey = await deriveKeyFromPassword(password, salt);
  const ivBuffer = new Uint8Array(base64UrlToArrayBuffer(iv));
  const encryptedData = base64UrlToArrayBuffer(encryptedKey);

  const decrypted = await subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer },
    wrappingKey,
    encryptedData
  );

  return new TextDecoder().decode(decrypted);
}

// ── Chunk sizing ────────────────────────────────────────────────────

export function getChunkParams(fileSize: number): {
  chunkSize: number;
  chunkCount: number;
} {
  if (fileSize <= MIN_CHUNK_SIZE) {
    return { chunkSize: fileSize || 1, chunkCount: 1 };
  }

  const chunksNeeded = Math.ceil(fileSize / MIN_CHUNK_SIZE);

  if (chunksNeeded <= MAX_CHUNKS_PER_FILE) {
    return {
      chunkSize: Math.ceil(fileSize / chunksNeeded),
      chunkCount: chunksNeeded,
    };
  } else {
    return {
      chunkSize: Math.ceil(fileSize / MAX_CHUNKS_PER_FILE),
      chunkCount: MAX_CHUNKS_PER_FILE,
    };
  }
}

export function calculateEncryptedSize(
  originalSize: number,
  chunkSize: number
): number {
  const chunkCount = Math.ceil(originalSize / chunkSize);
  return originalSize + chunkCount * AUTH_TAG_SIZE;
}

export function getConcurrency(fileSize: number): number {
  return fileSize < FILE_SIZE_THRESHOLD_1GB ? 3 : 5;
}

// ── Internal helpers ────────────────────────────────────────────────

function generateChunkIv(baseIv: Uint8Array, chunkIndex: number): Uint8Array {
  const iv = new Uint8Array(IV_LENGTH);
  iv.set(baseIv.slice(0, 8));
  const view = new DataView(iv.buffer);
  view.setUint32(8, chunkIndex, false); // Big-endian
  return iv;
}

function generateBaseIv(): string {
  const iv = getRandomValues(new Uint8Array(IV_LENGTH));
  return arrayBufferToBase64Url(iv);
}

export function generateFileIv(): string {
  return generateBaseIv();
}

function generateSalt(): string {
  const salt = getRandomValues(new Uint8Array(SALT_LENGTH));
  return arrayBufferToBase64Url(salt);
}

async function deriveKeyFromPassword(
  password: string,
  salt: string
): Promise<WebCryptoKey> {
  const saltBytes = new Uint8Array(base64UrlToArrayBuffer(salt));

  const hash = await argon2id({
    password,
    salt: saltBytes,
    memorySize: ARGON2_MEMORY,
    iterations: ARGON2_TIME,
    parallelism: ARGON2_PARALLELISM,
    hashLength: ARGON2_HASH_LENGTH,
    outputType: "binary",
  });

  return subtle.importKey(
    "raw",
    hash,
    ALGORITHM,
    true,
    ["encrypt", "decrypt"]
  );
}

function getView(arr: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (arr instanceof ArrayBuffer) return arr;
  return arr.buffer.slice(
    arr.byteOffset,
    arr.byteOffset + arr.byteLength
  ) as ArrayBuffer;
}

// ── Base64url encoding ──────────────────────────────────────────────

export function arrayBufferToBase64Url(
  buffer: ArrayBuffer | Uint8Array
): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const buf = Buffer.from(base64, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export function extractStoredKeyMaterial(keyString: string): ArrayBuffer {
  const encoded = keyString.startsWith("derived:")
    ? keyString.split(":")[2] ?? ""
    : keyString;

  if (!encoded) {
    throw new Error("Invalid encryption key");
  }

  return base64UrlToArrayBuffer(encoded);
}
