"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createIdentity,
  fetchFeed,
  fetchProfiles,
  loadIdentity,
  publishConnections,
  publishPost,
  shortNpub,
  type IdentityProfile,
  type StoredIdentity
} from "@/lib/nostr";
import { sanitizeWebsite, timeAgo } from "@/lib/format";
import type { Event } from "nostr-tools";

type FeedItem = Event & { profile?: IdentityProfile };
type Theme = "light" | "dark";

const CONNECTIONS_KEY = "wcjc.connections.v1";
const THEME_KEY = "wecanjuschill.theme.v1";

function loadConnections(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CONNECTIONS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveConnections(values: string[]) {
  localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(values));
}

function readPreferredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}

function Mark() {
  return (
    <div className="mark" aria-label="wecanjuschill">
      <span>w</span>
      <i />
      <span>c</span>
      <i />
      <span>j</span>
      <i />
      <span>c</span>
    </div>
  );
}

export default function HomePage() {
  const [identity, setIdentity] = useState<StoredIdentity | null>(null);
  const [showIdentity, setShowIdentity] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState("");
  const [postPassword, setPostPassword] = useState("");
  const [status, setStatus] = useState("");
  const [connections, setConnections] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<Theme>("dark");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const events = await fetchFeed();
      const profiles = await fetchProfiles(events.map((event) => event.pubkey));
      setFeed(events.map((event) => ({ ...event, profile: profiles[event.pubkey] })));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not reach relays.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const next = readPreferredTheme();
    setTheme(next);
    applyTheme(next);
    setIdentity(loadIdentity());
    setConnections(loadConnections());
    void refresh();
  }, [refresh]);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  const visibleFeed = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return feed;
    return feed.filter((item) =>
      [item.content, item.profile?.name, item.profile?.headline, item.profile?.location]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [feed, query]);

  async function submitPost() {
    if (!identity) {
      setShowIdentity(true);
      return;
    }
    setStatus("Publishing…");
    try {
      const event = await publishPost(identity, postPassword, post);
      setFeed((current) => [{ ...event, profile: identity.profile }, ...current]);
      setPost("");
      setPostPassword("");
      setStatus("Published to the open network.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Publish failed.");
    }
  }

  async function connect(pubkey: string) {
    if (!identity) {
      setShowIdentity(true);
      return;
    }
    const password = window.prompt("Unlock your wecanjuschill identity to publish this connection:");
    if (!password) return;
    const next = connections.includes(pubkey) ? connections.filter((p) => p !== pubkey) : [...connections, pubkey];
    try {
      await publishConnections(identity, password, next);
      saveConnections(next);
      setConnections(next);
      setStatus(next.includes(pubkey) ? "Connection published." : "Connection removed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Connection update failed.");
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <Mark />
          <span>wecanjuschill</span>
        </Link>
        <nav>
          <a href="#network">Network</a>
          <a href="#principles">How it works</a>
          <a href="https://github.com/juliushill42/wcjc" target="_blank" rel="noreferrer">
            Source
          </a>
        </nav>
        <div className="topbar-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button className="button secondary" onClick={() => setShowIdentity(true)}>
            {identity ? identity.profile.name : "Create identity"}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Free professional network</div>
          <h1>
            Build. Connect.
            <br />
            <em>Own the relationship.</em>
          </h1>
          <p>
            wecanjuschill is a free professional network for builders, startups, companies and people who want direct
            relationships without pay-to-connect walls.
          </p>
          <div className="hero-actions">
            <button className="button primary" onClick={() => setShowIdentity(true)}>
              {identity ? "Manage identity" : "Join free"}
            </button>
            <a className="button ghost" href="#network">
              Open the network ↓
            </a>
          </div>
          <div className="proof-row">
            <div>
              <strong>$0</strong>
              <span>to create an identity</span>
            </div>
            <div>
              <strong>3</strong>
              <span>public relays by default</span>
            </div>
            <div>
              <strong>Yours</strong>
              <span>signed identity you control</span>
            </div>
          </div>
        </div>
        <motion.div
          className="hero-card"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="hero-card-top">
            <span>YOUR PROFESSIONAL GRAPH</span>
            <span className="live-dot">LIVE</span>
          </div>
          <div className="graph-orbit orbit-a" />
          <div className="graph-orbit orbit-b" />
          <div className="graph-core">WJC</div>
          <div className="node n1">BUILDERS</div>
          <div className="node n2">STARTUPS</div>
          <div className="node n3">COMPANIES</div>
          <div className="node n4">OPPORTUNITY</div>
          <div className="hero-card-bottom">Signed locally. Published openly. Portable by design.</div>
        </motion.div>
      </section>

      <section className="principles" id="principles">
        <article>
          <span>01</span>
          <h3>No paywall on people.</h3>
          <p>Creating a profile, posting and making a connection are core network actions. They are not premium features.</p>
        </article>
        <article>
          <span>02</span>
          <h3>Your identity is portable.</h3>
          <p>
            Your posts and profile are cryptographically signed by an identity created in your browser—not trapped inside
            one company database.
          </p>
        </article>
        <article>
          <span>03</span>
          <h3>The recipe stays open.</h3>
          <p>
            wecanjuschill can be rebuilt. The network is more resilient when no single gatekeeper owns how it works.
          </p>
        </article>
      </section>

      <section className="network" id="network">
        <aside className="rail">
          <div className="panel identity-panel">
            <div className="panel-label">IDENTITY</div>
            {identity ? (
              <>
                <div className="avatar">{identity.profile.name.slice(0, 2).toUpperCase()}</div>
                <h3>{identity.profile.name}</h3>
                <p>{identity.profile.headline}</p>
                <code>{shortNpub(identity.pubkey)}</code>
                <Link className="text-link" href={`/p/${identity.pubkey}`}>
                  View public profile →
                </Link>
              </>
            ) : (
              <>
                <h3>You don’t need permission.</h3>
                <p>Create a local cryptographic identity and publish your professional profile to the open network.</p>
                <button className="button primary full" onClick={() => setShowIdentity(true)}>
                  Create identity
                </button>
              </>
            )}
          </div>
          <div className="panel compact">
            <div className="panel-label">NETWORK STATUS</div>
            <div className="status-row">
              <span className="dot green" />
              Open relay mesh
            </div>
            <div className="status-row">
              <span className="dot" />
              No central login required
            </div>
            <div className="status-row">
              <span className="dot" />
              Portable signed identity
            </div>
          </div>
        </aside>

        <div className="feed-column">
          <div className="composer panel">
            <div className="composer-row">
              <div className="avatar small">{identity ? identity.profile.name.slice(0, 2).toUpperCase() : "U"}</div>
              <textarea
                value={post}
                onChange={(e) => setPost(e.target.value)}
                placeholder={
                  identity
                    ? "Share what you’re building, hiring for, or looking for…"
                    : "Create an identity to publish on wecanjuschill…"
                }
              />
            </div>
            <div className="composer-actions">
              {identity && (
                <input
                  type="password"
                  value={postPassword}
                  onChange={(e) => setPostPassword(e.target.value)}
                  placeholder="Local identity password"
                />
              )}
              <span>{post.length}/4000</span>
              <button className="button primary" disabled={!post.trim()} onClick={() => void submitPost()}>
                Publish
              </button>
            </div>
            {status && <div className="inline-status">{status}</div>}
          </div>

          <div className="feed-tools">
            <div>
              <strong>Open network</strong>
              <span>{loading ? "Syncing relays…" : `${visibleFeed.length} recent posts`}</span>
            </div>
            <div className="search-wrap">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search this live view" />
              <button onClick={() => void refresh()}>Refresh</button>
            </div>
          </div>

          {loading && feed.length === 0 ? (
            <div className="panel empty">Connecting to the open relay mesh…</div>
          ) : visibleFeed.length === 0 ? (
            <div className="panel empty">No posts found yet. Be the first one in this relay view.</div>
          ) : (
            visibleFeed.map((item) => {
              const profile = item.profile;
              const website = sanitizeWebsite(profile?.website || "");
              const isConnected = connections.includes(item.pubkey);
              return (
                <article className="post-card panel" key={item.id}>
                  <div className="post-head">
                    <Link href={`/p/${item.pubkey}`} className="avatar">
                      {(profile?.name || item.pubkey).slice(0, 2).toUpperCase()}
                    </Link>
                    <div className="post-author">
                      <Link href={`/p/${item.pubkey}`}>
                        <strong>{profile?.name || shortNpub(item.pubkey)}</strong>
                      </Link>
                      <span>{profile?.headline || "Builder on wecanjuschill"}</span>
                      <small>
                        {profile?.location ? `${profile.location} · ` : ""}
                        {timeAgo(item.created_at)}
                      </small>
                    </div>
                    {identity?.pubkey !== item.pubkey && (
                      <button className={`connect ${isConnected ? "connected" : ""}`} onClick={() => void connect(item.pubkey)}>
                        {isConnected ? "Connected" : "Connect"}
                      </button>
                    )}
                  </div>
                  <p className="post-body">{item.content}</p>
                  <div className="post-foot">
                    <span>✓ signed post</span>
                    {website && (
                      <a href={website} target="_blank" rel="noreferrer">
                        Website ↗
                      </a>
                    )}
                    <code>{shortNpub(item.pubkey)}</code>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <aside className="rail right-rail">
          <div className="panel">
            <div className="panel-label">WHY WECANJUSCHILL</div>
            <h3>Professional connection without artificial scarcity.</h3>
            <p>People should not need a paid tier just to reach another person who wants to hear from them.</p>
          </div>
          <div className="panel manifesto">
            <div className="panel-label">THE RULE</div>
            <blockquote>“The relationship belongs to the people in it.”</blockquote>
            <p>Not the feed. Not the subscription tier. Not the platform.</p>
          </div>
        </aside>
      </section>

      <footer>
        <Mark />
        <div>
          <strong>wecanjuschill</strong>
          <span>wecanjuschill.net</span>
        </div>
        <p>Free to use. Open source. Built by Titan Universal Advanced Intelligence.</p>
      </footer>

      <AnimatePresence>
        {showIdentity && (
          <IdentityModal
            existing={identity}
            onClose={() => setShowIdentity(false)}
            onCreated={(value) => {
              setIdentity(value);
              setShowIdentity(false);
              setStatus("Identity created and profile published.");
            }}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function IdentityModal({
  existing,
  onClose,
  onCreated
}: {
  existing: StoredIdentity | null;
  onClose: () => void;
  onCreated: (value: StoredIdentity) => void;
}) {
  const [profile, setProfile] = useState<IdentityProfile>(
    existing?.profile || { name: "", headline: "", about: "", website: "", location: "", type: "person" }
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function create() {
    if (existing) {
      onClose();
      return;
    }
    if (!profile.name.trim() || !profile.headline.trim()) {
      setError("Name and headline are required.");
      return;
    }
    setWorking(true);
    setError("");
    try {
      onCreated(await createIdentity(profile, password));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create identity.");
      setWorking(false);
    }
  }

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.div
        className="modal"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="modal-x" onClick={onClose}>
          ×
        </button>
        <div className="eyebrow">{existing ? "YOUR IDENTITY" : "CREATE YOUR IDENTITY"}</div>
        <h2>{existing ? existing.profile.name : "No subscription. No approval queue."}</h2>
        {existing ? (
          <>
            <p className="modal-copy">
              Your identity key is encrypted in this browser. Your public profile is portable across compatible relays and
              clients.
            </p>
            <code className="key-block">{existing.npub}</code>
          </>
        ) : (
          <>
            <div className="type-switch">
              <button className={profile.type === "person" ? "active" : ""} onClick={() => setProfile({ ...profile, type: "person" })}>
                Person
              </button>
              <button
                className={profile.type === "company" ? "active" : ""}
                onClick={() => setProfile({ ...profile, type: "company" })}
              >
                Company
              </button>
            </div>
            <label>
              Name
              <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="Julius Hill" />
            </label>
            <label>
              Headline
              <input
                value={profile.headline}
                onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
                placeholder="Founder · Systems Engineer"
              />
            </label>
            <label>
              Location
              <input
                value={profile.location}
                onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                placeholder="Chicago, IL"
              />
            </label>
            <label>
              Website
              <input
                value={profile.website}
                onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                placeholder="https://example.com"
              />
            </label>
            <label>
              About
              <textarea
                value={profile.about}
                onChange={(e) => setProfile({ ...profile, about: e.target.value })}
                placeholder="What are you building?"
              />
            </label>
            <label>
              Local identity password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="10+ characters"
              />
            </label>
            <p className="security-note">
              Your private signing key is encrypted locally with this password. wecanjuschill does not receive the password or
              raw private key.
            </p>
          </>
        )}
        {error && <div className="error">{error}</div>}
        <button className="button primary full" disabled={working} onClick={() => void create()}>
          {existing ? "Close" : working ? "Publishing identity…" : "Create + publish identity"}
        </button>
      </motion.div>
    </motion.div>
  );
}
