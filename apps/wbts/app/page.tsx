"use client";

import Image from "next/image";
import { finalizeEvent, generateSecretKey, SimplePool, type Event, type Filter } from "nostr-tools";
import { useCallback, useEffect, useMemo, useState } from "react";

const RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];
const STORY_TAG = "behind-that-smile";
const LIKED_KEY = "wbts.loved.v1";
const FEELINGS = ["All", "Grief", "Depression", "Heartbreak", "Starting over", "Missing someone", "Hope"];

type StoryPayload = { title?: string; body: string; feeling?: string };
type Story = Event & { payload: StoryPayload };

function parseStory(event: Event): Story {
  try {
    const parsed = JSON.parse(event.content) as Partial<StoryPayload>;
    if (typeof parsed.body === "string" && parsed.body.trim()) {
      return {
        ...event,
        payload: {
          title: typeof parsed.title === "string" ? parsed.title : "",
          body: parsed.body,
          feeling: typeof parsed.feeling === "string" ? parsed.feeling : ""
        }
      };
    }
  } catch {}
  return { ...event, payload: { body: event.content } };
}

function timeAgo(timestamp: number) {
  const seconds = Math.max(1, Math.floor(Date.now() / 1000) - timestamp);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function publish(event: Event) {
  const pool = new SimplePool();
  try {
    await Promise.any(pool.publish(RELAYS, event));
  } finally {
    pool.close(RELAYS);
  }
}

async function query(filter: Filter, timeoutMs = 5000): Promise<Event[]> {
  const pool = new SimplePool();
  const timeout = new Promise<Event[]>((resolve) => setTimeout(() => resolve([]), timeoutMs));
  try {
    return await Promise.race([pool.querySync(RELAYS, filter), timeout]);
  } finally {
    pool.close(RELAYS);
  }
}

function readLiked(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LIKED_KEY) || "[]");
  } catch {
    return [];
  }
}

function Brand() {
  return (
    <div className="brand-lockup">
      <div className="brand-face" aria-hidden="true">
        <span className="hair">●</span>
        <span className="profile">◖</span>
      </div>
      <div>
        <div className="script">What&apos;s Behind</div>
        <div className="brand-smile">THAT SMILE</div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loves, setLoves] = useState<Record<string, number>>({});
  const [liked, setLiked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [activeFeeling, setActiveFeeling] = useState("All");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [feeling, setFeeling] = useState("Grief");
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [storyEvents, reactionEvents] = await Promise.all([
        query({ kinds: [1], "#t": [STORY_TAG], limit: 80 }),
        query({ kinds: [7], "#t": [STORY_TAG], limit: 500 })
      ]);

      const nextStories = storyEvents
        .map(parseStory)
        .filter((story) => story.payload.body.trim())
        .sort((a, b) => b.created_at - a.created_at);

      const nextLoves: Record<string, number> = {};
      for (const reaction of reactionEvents) {
        if (reaction.content !== "❤️" && reaction.content !== "+") continue;
        const eventId = reaction.tags.find((tag) => tag[0] === "e")?.[1];
        if (eventId) nextLoves[eventId] = (nextLoves[eventId] || 0) + 1;
      }

      setStories(nextStories);
      setLoves(nextLoves);
      setStatus("");
    } catch {
      setStatus("The community feed could not refresh. Your page is still here.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLiked(readLiked());
    void refresh();
  }, [refresh]);

  const filteredStories = useMemo(() => {
    if (activeFeeling === "All") return stories;
    return stories.filter((story) => story.payload.feeling === activeFeeling);
  }, [stories, activeFeeling]);

  const totalLove = useMemo(
    () => Object.values(loves).reduce((sum, value) => sum + value, 0),
    [loves]
  );

  async function submitStory() {
    const cleanBody = body.trim();
    if (!cleanBody || publishing) return;
    setPublishing(true);
    setStatus("Sharing your story anonymously…");

    try {
      const secret = generateSecretKey();
      const event = finalizeEvent(
        {
          kind: 1,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["t", STORY_TAG],
            ["client", "wecanjuschill-behind-that-smile"],
            ["feeling", feeling]
          ],
          content: JSON.stringify({ title: title.trim(), body: cleanBody, feeling })
        },
        secret
      );

      await publish(event);
      setStories((current) => [parseStory(event), ...current]);
      setTitle("");
      setBody("");
      setFeeling("Grief");
      setActiveFeeling("All");
      setComposerOpen(false);
      setStatus("Your story is out there. No name attached.");
    } catch {
      setStatus("That story did not publish. Tap share and try once more.");
    } finally {
      setPublishing(false);
    }
  }

  async function loveStory(story: Story) {
    if (liked.includes(story.id)) return;

    const previousLiked = liked;
    const nextLiked = [...liked, story.id];
    setLiked(nextLiked);
    localStorage.setItem(LIKED_KEY, JSON.stringify(nextLiked));
    setLoves((current) => ({ ...current, [story.id]: (current[story.id] || 0) + 1 }));

    try {
      const secret = generateSecretKey();
      const event = finalizeEvent(
        {
          kind: 7,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["e", story.id],
            ["p", story.pubkey],
            ["t", STORY_TAG],
            ["client", "wecanjuschill-behind-that-smile"]
          ],
          content: "❤️"
        },
        secret
      );
      await publish(event);
    } catch {
      setLoves((current) => ({ ...current, [story.id]: Math.max(0, (current[story.id] || 1) - 1) }));
      setLiked(previousLiked);
      localStorage.setItem(LIKED_KEY, JSON.stringify(previousLiked));
      setStatus("Love did not send. Try again.");
    }
  }

  return (
    <main>
      <header className="topbar">
        <a href="#top" className="brand-link" aria-label="What's Behind That Smile home">
          <Brand />
        </a>
        <nav>
          <a href="#stories">Stories</a>
          <button onClick={() => setComposerOpen(true)}>Tell yours</button>
        </nav>
      </header>

      <section className="hero" id="top">
        <Image
          className="hero-photo"
          src="https://images.unsplash.com/photo-1758600435230-a4894ad86897?auto=format&fit=crop&fm=jpg&q=90&w=2000"
          alt="A Black woman smiling"
          fill
          priority
          sizes="100vw"
        />
        <div className="hero-wash" />
        <div className="hero-content">
          <div className="hero-brand"><Brand /></div>
          <p className="eyebrow">REAL PEOPLE. REAL STORIES. A BRIGHTER TOMORROW.</p>
          <h1>YOU DON&apos;T HAVE<br />TO SAY YOU&apos;RE<br /><em>FINE HERE.</em></h1>
          <p className="hero-copy">A place to remove the mask and say what&apos;s really behind the smile.</p>
          <div className="hero-actions">
            <button className="cta primary" onClick={() => setComposerOpen(true)}>
              <span className="cta-icon">✎</span>
              <span><strong>Tell Your Story</strong><small>ANONYMOUSLY IF YOU NEED TO</small></span>
              <b>›</b>
            </button>
            <a className="cta secondary" href="#stories">
              <span className="cta-icon">♥</span>
              <span><strong>Read Their Stories</strong><small>LEAVE SOMEBODY SOME LOVE</small></span>
              <b>↓</b>
            </a>
          </div>
          <p className="signature">Real People. Real Stories.<br />A Brighter Tomorrow.</p>
        </div>
      </section>

      <section className="quick-row" aria-label="What you can do here">
        <a href="#stories"><span>◫</span><b>Read<br />Stories</b></a>
        <button onClick={() => setComposerOpen(true)}><span>♥</span><b>Show<br />Some Love</b></button>
        <button onClick={() => setComposerOpen(true)}><span>✎</span><b>Tell<br />Your Truth</b></button>
        <a href="#stories"><span>❧</span><b>Find<br />Hope</b></a>
        <a href="#stories"><span>●●</span><b>You&apos;re<br />Not Alone</b></a>
      </section>

      <section className="truth-strip">
        <div>
          <span>REMOVE THE MASK</span>
          <h2>Some smiles carry stories nobody can see.</h2>
        </div>
        <p>
          Grief. Depression. Heartbreak. Starting over. Missing somebody.
          Surviving something. You can say the part you usually carry alone.
        </p>
      </section>

      <section className="stories-section" id="stories">
        <div className="stories-heading">
          <div>
            <p className="eyebrow gold">REAL STORIES. REAL PEOPLE.</p>
            <h2>Different Smiles.<br />Same Truth.</h2>
          </div>
          <div className="metrics">
            <span><strong>{loading ? "…" : stories.length}</strong><small>stories</small></span>
            <span><strong>{totalLove}</strong><small>pieces of love</small></span>
          </div>
        </div>

        <div className="filters" aria-label="Filter stories">
          {FEELINGS.map((item) => (
            <button
              key={item}
              className={activeFeeling === item ? "active" : ""}
              onClick={() => setActiveFeeling(item)}
            >
              {item}
            </button>
          ))}
        </div>

        {status && <div className="status">{status}</div>}

        {loading && stories.length === 0 ? (
          <div className="empty">Opening the room…</div>
        ) : filteredStories.length === 0 ? (
          <div className="empty">
            <strong>No story in this room yet.</strong>
            <span>You can be the first person to say it.</span>
            <button className="pill" onClick={() => setComposerOpen(true)}>Tell your story</button>
          </div>
        ) : (
          <div className="story-grid">
            {filteredStories.map((story, index) => {
              const isLoved = liked.includes(story.id);
              return (
                <article className={index === 0 ? "story-card feature" : "story-card"} key={story.id}>
                  <div className="story-top">
                    <span>{story.payload.feeling || "Anonymous truth"}</span>
                    <time>{timeAgo(story.created_at)}</time>
                  </div>
                  <div className="quote-mark">“</div>
                  {story.payload.title && <h3>{story.payload.title}</h3>}
                  <p>{story.payload.body}</p>
                  <div className="story-bottom">
                    <span>Anonymous</span>
                    <button
                      className={isLoved ? "love loved" : "love"}
                      onClick={() => void loveStory(story)}
                      disabled={isLoved}
                    >
                      ♥ <b>{loves[story.id] || 0}</b> <small>{isLoved ? "Loved" : "Show some love"}</small>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="closing">
        <div className="closing-image">
          <Image
            src="https://images.unsplash.com/photo-1664629152253-4cd71d256d8c?auto=format&fit=crop&fm=jpg&q=88&w=1800"
            alt="A quiet reflective moment"
            fill
            sizes="100vw"
          />
          <div className="closing-shade" />
        </div>
        <div className="closing-copy">
          <p className="signature white">Remove the Mask.<br />Find Your People.</p>
          <button className="closing-button" onClick={() => setComposerOpen(true)}>
            <span>♥</span><strong>SHOW SOME LOVE</strong><small>IT MATTERS</small>
          </button>
        </div>
      </section>

      <footer>
        <Brand />
        <p>A WeCanJusChill space for the things people usually carry alone.</p>
      </footer>

      {composerOpen && (
        <div className="modal-backdrop" onMouseDown={() => setComposerOpen(false)}>
          <section className="composer" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <button className="close" onClick={() => setComposerOpen(false)} aria-label="Close">×</button>
            <p className="eyebrow gold">YOUR TURN</p>
            <h2>What&apos;s behind your smile?</h2>
            <p className="privacy">No account. No name. A new anonymous identity signs your story and is discarded after publishing. The story itself is public.</p>

            <div className="feeling-row">
              {FEELINGS.slice(1).map((item) => (
                <button key={item} className={feeling === item ? "active" : ""} onClick={() => setFeeling(item)}>{item}</button>
              ))}
            </div>

            <label>
              A few words at the top <small>optional</small>
              <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} placeholder="The thing nobody sees…" />
            </label>

            <label>
              Your story
              <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 5000))} placeholder="You can tell the truth here." autoFocus />
            </label>

            <div className="composer-foot">
              <span>{body.length}/5000</span>
              <button className="pill" disabled={!body.trim() || publishing} onClick={() => void submitStory()}>
                {publishing ? "Sharing…" : "Share anonymously"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
