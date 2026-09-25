"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchProfiles, queryEvents, shortNpub, type IdentityProfile } from "@/lib/nostr";
import { timeAgo } from "@/lib/format";
import type { Event } from "nostr-tools";

export default function ProfilePage({ params }: { params: Promise<{ pubkey: string }> }) {
  const [pubkey, setPubkey] = useState("");
  const [profile, setProfile] = useState<IdentityProfile | null>(null);
  const [posts, setPosts] = useState<Event[]>([]);

  useEffect(() => {
    void params.then(async ({ pubkey }) => {
      setPubkey(pubkey);
      const [profiles, events] = await Promise.all([
        fetchProfiles([pubkey]),
        queryEvents({ kinds: [1], authors: [pubkey], "#t": ["wcjc"], limit: 40 })
      ]);
      setProfile(profiles[pubkey] || null);
      setPosts(events.sort((a, b) => b.created_at - a.created_at));
    });
  }, [params]);

  return <main className="profile-shell">
    <Link className="back" href="/">← wecanjuschill network</Link>
    <section className="profile-card">
      <div className="profile-avatar">{(profile?.name || pubkey || "WC").slice(0, 2).toUpperCase()}</div>
      <div className="profile-type">{profile?.type === "company" ? "COMPANY" : "PERSON"}</div>
      <h1>{profile?.name || (pubkey ? shortNpub(pubkey) : "Loading…")}</h1>
      <h2>{profile?.headline || "Builder on wecanjuschill"}</h2>
      <p>{profile?.about || ""}</p>
      <div className="profile-meta"><span>{profile?.location}</span>{profile?.website && <a href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`} target="_blank" rel="noreferrer">Website ↗</a>}</div>
      {pubkey && <code>{shortNpub(pubkey)}</code>}
    </section>
    <section className="profile-posts"><div className="profile-posts-head"><strong>Posts</strong><span>{posts.length}</span></div>{posts.length ? posts.map((post) => <article className="post-card panel" key={post.id}><p className="post-body">{post.content}</p><div className="post-foot"><span>{timeAgo(post.created_at)}</span><span>✓ signed</span></div></article>) : <div className="panel empty">No Posts from this identity yet.</div>}</section>
  </main>;
}
