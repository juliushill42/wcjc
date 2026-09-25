const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function b64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: asBufferSource(salt), iterations: 310_000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export type EncryptedSecret = {
  v: 1;
  salt: string;
  iv: string;
  data: string;
};

export async function encryptSecret(secretHex: string, password: string): Promise<EncryptedSecret> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asBufferSource(iv) }, key, encoder.encode(secretHex));
  return {
    v: 1,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    data: bytesToB64(new Uint8Array(encrypted))
  };
}

export async function decryptSecret(payload: EncryptedSecret, password: string): Promise<string> {
  const salt = b64ToBytes(payload.salt);
  const iv = b64ToBytes(payload.iv);
  const key = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: asBufferSource(iv) }, key, asBufferSource(b64ToBytes(payload.data)));
  return decoder.decode(decrypted);
}
