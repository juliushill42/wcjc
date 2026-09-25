import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
  SimplePool,
  type Event,
  type Filter
} from "nostr-tools";
import { encryptSecret, decryptSecret, type EncryptedSecret } from "./crypto";

export const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net"
];

export type IdentityProfile = {
  name: string;
  headline: string;
  about: string;
  website: string;
  location: string;
  type: "person" | "company";
};

export type StoredIdentity = {
  pubkey: string;
  npub: string;
  encrypted: EncryptedSecret;
  profile: IdentityProfile;
};

const STORAGE_KEY = "wcjc.identity.v1";

function hex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function unhex(value: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error("Invalid secret key");
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < value.length; i += 2) bytes[i / 2] = parseInt(value.slice(i, i + 2), 16);
  return bytes;
}

export function loadIdentity(): StoredIdentity | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredIdentity;
  } catch {
    return null;
  }
}

export function clearIdentity() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function createIdentity(profile: IdentityProfile, password: string): Promise<StoredIdentity> {
  if (password.length < 10) throw new Error("Use at least 10 characters for the local identity password.");
  const secret = generateSecretKey();
  const pubkey = getPublicKey(secret);
  const stored: StoredIdentity = {
    pubkey,
    npub: nip19.npubEncode(pubkey),
    encrypted: await encryptSecret(hex(secret), password),
    profile
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  await publishProfile(stored, password);
  return stored;
}

export async function unlockSecret(identity: StoredIdentity, password: string): Promise<Uint8Array> {
  const secretHex = await decryptSecret(identity.encrypted, password);
  return unhex(secretHex);
}

async function publish(event: Event) {
  const pool = new SimplePool();
  try {
    await Promise.any(pool.publish(RELAYS, event));
  } finally {
    pool.close(RELAYS);
  }
}

export async function publishProfile(identity: StoredIdentity, password: string) {
  const secret = await unlockSecret(identity, password);
  const content = JSON.stringify({
    name: identity.profile.name,
    display_name: identity.profile.name,
    about: identity.profile.about,
    website: identity.profile.website,
    location: identity.profile.location,
    headline: identity.profile.headline,
    wcjc_type: identity.profile.type,
    picture: ""
  });
  const event = finalizeEvent({ kind: 0, created_at: Math.floor(Date.now() / 1000), tags: [["t", "wcjc"], ["client", "wcjc-web"]], content }, secret);
  await publish(event);
}

export async function publishPost(identity: StoredIdentity, password: string, content: string) {
  const body = content.trim();
  if (!body) throw new Error("Post cannot be empty.");
  if (body.length > 4000) throw new Error("Post is too long.");
  const secret = await unlockSecret(identity, password);
  const event = finalizeEvent({
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["t", "wcjc"], ["client", "wcjc-web"]],
    content: body
  }, secret);
  await publish(event);
  return event;
}

export async function publishConnections(identity: StoredIdentity, password: string, pubkeys: string[]) {
  const secret = await unlockSecret(identity, password);
  const unique = Array.from(new Set(pubkeys.filter((p) => /^[0-9a-f]{64}$/i.test(p))));
  const event = finalizeEvent({
    kind: 3,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["t", "wcjc"], ["client", "wcjc-web"], ...unique.map((p) => ["p", p])],
    content: ""
  }, secret);
  await publish(event);
}

export async function queryEvents(filter: Filter, timeoutMs = 4500): Promise<Event[]> {
  const pool = new SimplePool();
  const timeout = new Promise<Event[]>((resolve) => setTimeout(() => resolve([]), timeoutMs));
  try {
    const result = await Promise.race([pool.querySync(RELAYS, filter), timeout]);
    return result;
  } finally {
    pool.close(RELAYS);
  }
}

export async function fetchFeed(limit = 60): Promise<Event[]> {
  const events = await queryEvents({ kinds: [1], "#t": ["wcjc"], limit });
  return events.sort((a, b) => b.created_at - a.created_at);
}

export async function fetchProfiles(pubkeys: string[]): Promise<Record<string, IdentityProfile>> {
  const keys = Array.from(new Set(pubkeys)).slice(0, 120);
  if (!keys.length) return {};
  const events = await queryEvents({ kinds: [0], authors: keys, limit: keys.length * 2 });
  const latest = new Map<string, Event>();
  for (const event of events) {
    const prev = latest.get(event.pubkey);
    if (!prev || event.created_at > prev.created_at) latest.set(event.pubkey, event);
  }
  const out: Record<string, IdentityProfile> = {};
  for (const [pubkey, event] of latest) {
    try {
      const value = JSON.parse(event.content);
      out[pubkey] = {
        name: value.display_name || value.name || `${pubkey.slice(0, 8)}…`,
        headline: value.headline || "Builder on wecanjuschill",
        about: value.about || "",
        website: value.website || "",
        location: value.location || "",
        type: value.wcjc_type === "company" ? "company" : "person"
      };
    } catch {
      out[pubkey] = {
        name: `${pubkey.slice(0, 8)}…`,
        headline: "Builder on wecanjuschill",
        about: "",
        website: "",
        location: "",
        type: "person"
      };
    }
  }
  return out;
}

export function shortNpub(pubkey: string): string {
  const npub = nip19.npubEncode(pubkey);
  return `${npub.slice(0, 12)}…${npub.slice(-8)}`;
}
