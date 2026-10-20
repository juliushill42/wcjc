"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { finalizeEvent, generateSecretKey, getPublicKey, nip04, SimplePool, type Event } from "nostr-tools";

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("Invalid stored key");
  return Uint8Array.from(hex.match(/../g)!, pair => parseInt(pair, 16));
}
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

const RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];
const SECRET_KEY = "wbts.messenger.secret.v1";
const CONTACTS_KEY = "wbts.messenger.contacts.v1";

type Contact = { pubkey: string; label: string };
type Message = { id: string; pubkey: string; created_at: number; content: string; mine: boolean };

function validPubkey(value: string) {
  const cleaned = value.trim().toLowerCase().replace(/^npub1/, "");
  return /^[0-9a-f]{64}$/.test(cleaned) ? cleaned : "";
}

function shortKey(value: string) {
  return value.slice(0, 8) + "…" + value.slice(-6);
}

async function queryMessages(filter: { kinds: number[]; "#p"?: string[]; authors?: string[]; limit?: number }) {
  const pool = new SimplePool();
  try {
    return await Promise.race([
      pool.querySync(RELAYS, filter),
      new Promise<Event[]>((resolve) => setTimeout(() => resolve([]), 6500))
    ]);
  } finally {
    pool.close(RELAYS);
  }
}

async function publishMessage(event: Event) {
  const pool = new SimplePool();
  try {
    await Promise.any(pool.publish(RELAYS, event));
  } finally {
    pool.close(RELAYS);
  }
}

export default function Messenger() {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<Uint8Array | null>(null);
  const [pubkey, setPubkey] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [active, setActive] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const savedSecret = localStorage.getItem(SECRET_KEY);
      const key = savedSecret ? hexToBytes(savedSecret) : generateSecretKey();
      if (!savedSecret) localStorage.setItem(SECRET_KEY, bytesToHex(key));
      setSecret(key);
      setPubkey(getPublicKey(key));
      const savedContacts = JSON.parse(localStorage.getItem(CONTACTS_KEY) || "[]") as Contact[];
      setContacts(savedContacts.filter((c) => /^[0-9a-f]{64}$/.test(c.pubkey)));
    } catch {
      setNotice("Could not initialize your messenger identity in this browser.");
    }
  }, []);

  const activeContact = useMemo(() => contacts.find((contact) => contact.pubkey === active), [contacts, active]);

  const refresh = useCallback(async () => {
    if (!secret || !pubkey || !active) return;
    setLoading(true);
    setNotice("");
    try {
      const contact = active;
      const [incoming, outgoing] = await Promise.all([
        queryMessages({ kinds: [4], "#p": [pubkey], limit: 100 }),
        queryMessages({ kinds: [4], authors: [pubkey], "#p": [contact], limit: 100 })
      ]);
      const byId = new Map<string, Event>();
      [...incoming, ...outgoing].forEach((event) => byId.set(event.id, event));
      const events = [...byId.values()].filter((event) =>
        event.pubkey === contact
          ? event.tags.some((tag) => tag[0] === "p" && tag[1] === pubkey)
          : event.pubkey === pubkey && event.tags.some((tag) => tag[0] === "p" && tag[1] === contact)
      );
      const decrypted = await Promise.all(events.map(async (event) => {
        const peer = event.pubkey === pubkey ? contact : event.pubkey;
        try {
          return {
            id: event.id,
            pubkey: event.pubkey,
            created_at: event.created_at,
            content: await nip04.decrypt(secret, peer, event.content),
            mine: event.pubkey === pubkey
          } satisfies Message;
        } catch {
          return null;
        }
      }));
      setMessages((decrypted.filter(Boolean) as Message[]).sort((a, b) => a.created_at - b.created_at));
    } catch {
      setNotice("Could not load messages from the relay network. Try refreshing.");
    } finally {
      setLoading(false);
    }
  }, [secret, pubkey, active]);

  useEffect(() => { void refresh(); }, [refresh]);

  function saveContacts(next: Contact[]) {
    setContacts(next);
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(next));
  }

  function addContact() {
    const key = validPubkey(draftKey);
    if (!key || key === pubkey) {
      setNotice("Enter the other person's 64-character public key in hex. Do not enter a private key.");
      return;
    }
    const next = contacts.some((c) => c.pubkey === key)
      ? contacts
      : [...contacts, { pubkey: key, label: draftLabel.trim().slice(0, 40) || shortKey(key) }];
    saveContacts(next);
    setActive(key);
    setDraftKey("");
    setDraftLabel("");
    setNotice("Contact saved. Messages are end-to-end encrypted by NIP-04; relay availability can vary.");
  }

  async function send() {
    if (!secret || !active || !draft.trim() || sending) return;
    setSending(true);
    setNotice("Sending…");
    try {
      const ciphertext = await nip04.encrypt(secret, active, draft.trim());
      const event = finalizeEvent({
        kind: 4,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", active]],
        content: ciphertext
      }, secret);
      await publishMessage(event);
      setMessages((current) => [...current, {
        id: event.id, pubkey, created_at: event.created_at, content: draft.trim(), mine: true
      }]);
      setDraft("");
      setNotice("Message sent.");
    } catch {
      setNotice("Message could not be delivered. Check the public key and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button className="messenger-launch" onClick={() => setOpen(true)} aria-label="Open messenger">
        <span aria-hidden="true">✉</span> Messenger
      </button>
      {open && (
        <div className="messenger-overlay" onMouseDown={() => setOpen(false)}>
          <section className="messenger-window" role="dialog" aria-modal="true" aria-label="WBTS Messenger" onMouseDown={(event) => event.stopPropagation()}>
            <header className="messenger-head">
              <div><span className="messenger-kicker">WBTS COMMUNITY</span><h2>Messenger</h2></div>
              <button className="messenger-close" onClick={() => setOpen(false)} aria-label="Close messenger">×</button>
            </header>
            <div className="messenger-identity">
              <span>Your public messaging key</span>
              <code>{pubkey ? shortKey(pubkey) : "Creating identity…"}</code>
              <button disabled={!pubkey} onClick={() => { void navigator.clipboard.writeText(pubkey); setNotice("Public key copied. Share it so people can message you."); }}>Copy key</button>
            </div>
            <div className="messenger-body">
              <aside className="messenger-contacts">
                <strong>Conversations</strong>
                {contacts.map((contact) => (
                  <button key={contact.pubkey} className={active === contact.pubkey ? "messenger-contact active" : "messenger-contact"} onClick={() => setActive(contact.pubkey)}>
                    <span className="messenger-avatar">{(contact.label || "W").slice(0, 1).toUpperCase()}</span>
                    <span><b>{contact.label}</b><small>{shortKey(contact.pubkey)}</small></span>
                  </button>
                ))}
                <div className="messenger-add">
                  <label htmlFor="messenger-label">Contact name (optional)</label>
                  <input id="messenger-label" value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} placeholder="Name or nickname" maxLength={40} />
                  <label htmlFor="messenger-key">Their public key (hex)</label>
                  <input id="messenger-key" value={draftKey} onChange={(e) => setDraftKey(e.target.value)} placeholder="64-character public key" />
                  <button onClick={addContact}>Start conversation</button>
                </div>
              </aside>
              <section className="messenger-chat">
                {activeContact ? (
                  <>
                    <div className="messenger-chat-title"><strong>{activeContact.label}</strong><small>Encrypted direct messages · {shortKey(activeContact.pubkey)}</small></div>
                    <div className="messenger-messages">
                      {loading && <p className="messenger-empty">Loading messages…</p>}
                      {!loading && messages.length === 0 && <p className="messenger-empty">No messages yet. Say hello to start the conversation.</p>}
                      {messages.map((message) => (
                        <div className={message.mine ? "messenger-bubble mine" : "messenger-bubble"} key={message.id}>
                          <p>{message.content}</p><time>{new Date(message.created_at * 1000).toLocaleString()}</time>
                        </div>
                      ))}
                    </div>
                    <form className="messenger-compose" onSubmit={(event) => { event.preventDefault(); void send(); }}>
                      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a message…" maxLength={4000} rows={2} />
                      <button disabled={!draft.trim() || sending}>{sending ? "Sending…" : "Send"}</button>
                    </form>
                    <button className="messenger-refresh" onClick={() => void refresh()}>Refresh messages</button>
                  </>
                ) : (
                  <div className="messenger-empty messenger-welcome"><span>✉</span><h3>Make a connection.</h3><p>Add someone's public key to start a private conversation, or copy your key and share it with them.</p></div>
                )}
              </section>
            </div>
            {notice && <p className="messenger-notice" role="status">{notice}</p>}
            <p className="messenger-disclaimer">Your identity key stays in this browser. Save your browser data carefully: clearing it can permanently remove access to this identity. Messages depend on public Nostr relays and may not be instantly available.</p>
          </section>
        </div>
      )}
    </>
  );
}
