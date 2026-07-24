import type { Env } from "./types";
import { ApiException } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function compress(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([asArrayBuffer(bytes)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompress(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([asArrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 32) {
    throw new ApiException(500, "SESSION_SECRET_INVALID", "SESSION_SECRET must be at least 32 characters.");
  }
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function stageImport(env: Env, value: unknown, ttlSeconds: number): Promise<string> {
  if (env.CACHE) {
    const id = crypto.randomUUID();
    await env.CACHE.put(`import:${id}`, JSON.stringify(value), { expirationTtl: ttlSeconds });
    return `kv.${id}`;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = await compress(encoder.encode(JSON.stringify({ expiresAt: Date.now() + ttlSeconds * 1000, value })));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(env.SESSION_SECRET), asArrayBuffer(payload));
  return `v2.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`;
}

export async function readStagedImport<T>(env: Env, token: string): Promise<T | null> {
  if (token.startsWith("kv.")) {
    return env.CACHE ? env.CACHE.get<T>(`import:${token.slice(3)}`, "json") : null;
  }
  const [version, ivValue, encryptedValue] = token.split(".");
  if ((version !== "v1" && version !== "v2") || !ivValue || !encryptedValue) return null;
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: asArrayBuffer(fromBase64Url(ivValue)) },
      await encryptionKey(env.SESSION_SECRET),
      asArrayBuffer(fromBase64Url(encryptedValue))
    );
    const bytes = version === "v2" ? await decompress(new Uint8Array(decrypted)) : new Uint8Array(decrypted);
    const parsed = JSON.parse(decoder.decode(bytes)) as { expiresAt: number; value: T };
    return parsed.expiresAt >= Date.now() ? parsed.value : null;
  } catch {
    return null;
  }
}

export async function deleteStagedImport(env: Env, token: string): Promise<void> {
  if (env.CACHE && token.startsWith("kv.")) await env.CACHE.delete(`import:${token.slice(3)}`);
}
