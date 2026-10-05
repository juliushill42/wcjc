"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { finalizeEvent, generateSecretKey, SimplePool, type Event, type Filter } from "nostr-tools";
import { useCallback, useEffect, useMemo, useState } from "react";

const RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];
const STORY_TAG = "behind-that-smile";
const LIKED_KEY = "wbts.loved.v1";

type StoryPayload = {
  title?: string;
  body: string;
  feeling?: string;
};

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
  } catch {
    // Older/plain-text stories remain readable.
  }
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

function LogoMark() {
  return (
    <div className="logo-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export default function HomePage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loves, setLoves] = useState<Record<string, number>>({});
  const [liked, setLiked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
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
          content: JSON.stringify({
            title: title.trim(),
            body: cleanBody,
            feeling
          })
        },
        secret
      );

      await publish(event);
      setStories((current) => [parseStory(event), ...current]);
      setTitle("");
      setBody("");
      setFeeling("Grief");
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
      const rolledBack = liked;
      setLiked(rolledBack);
      localStorage.setItem(LIKED_KEY, JSON.stringify(rolledBack));
      setStatus("Love did not send. Try again.");
    }
  }

  return (
    <main>
      <header className="nav">
        <a href="#top" className="brand" aria-label="What's Behind That Smile home">
          <LogoMark />
          <span>WHAT&apos;S BEHIND THAT SMILE?</span>
        </a>
        <div className="nav-actions">
          <a href="#stories">Stories</a>
          <button className="nav-share" onClick={() => setComposerOpen(true)}>Share yours</button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-image">
          <Image
            src="https://images.unsplash.com/photo-1758600435230-a4894ad86897?auto=format&fit=crop&fm=jpg&q=88&w=1800"
            alt="A Black woman smiling softly"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 48vw"
          />
          <div className="hero-image-shade" />
          <div className="hero-image-caption">
            <span>THE SMILE</span>
            <strong>is only part of the story.</strong>
          </div>
        </div>

        <div className="hero-copy">
          <div className="kicker">WECANJUSCHILL PRESENTS</div>
          <h1>
            What&apos;s behind
            <br />
            <em>that smile?</em>
          </h1>
          <p className="hero-lead">
            A place to remove the mask. Tell the part people cannot see.
            Read somebody else&apos;s truth. Leave them a little love.
          </p>
          <div className="hero-buttons">
            <button className="primary" onClick={() => setComposerOpen(true)}>Tell your story</button>
            <a className="secondary" href="#stories">Read the room ↓</a>
          </div>
          <div className="hero-proof">
            <div>
              <strong>Anonymous</strong>
              <span>No name required.</span>
            </div>
            <div>
              <strong>Human</strong>
              <span>No likes. Just love.</span>
            </div>
            <div>
              <strong>Open</strong>
              <span>Your truth can help somebody.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="statement">
        <p className="statement-small">SOMETIMES THE PERSON SMILING THE HARDEST</p>
        <blockquote>
          is carrying something they never learned
          <span> how to say out loud.</span>
        </blockquote>
        <p>
          This is not a highlight reel. It is a place for grief, depression, heartbreak,
          starting over, missing somebody, surviving something, and admitting: “I&apos;m not okay today.”
        </p>
      </section>

      <section className="split-story">
        <div className="split-copy">
          <span className="section-number">01 — REMOVE THE MASK</span>
          <h2>You do not have to perform here.</h2>
          <p>
            No perfect caption. No polished ending. No requirement to turn pain into inspiration.
            Say what happened. Say what hurts. Say what you wish somebody understood.
          </p>
          <button className="text-button" onClick={() => setComposerOpen(true)}>Write anonymously →</button>
        </div>
        <div className="split-image">
          <Image
            src="https://images.unsplash.com/photo-1664629152253-4cd71d256d8c?auto=format&fit=crop&fm=jpg&q=88&w=1600"
            alt="A Black woman smiling and looking down"
            fill
            sizes="(max-width: 900px) 100vw, 45vw"
          />
        </div>
      </section>

      <section className="stories-section" id="stories">
        <div className="stories-head">
          <div>
            <span className="section-number">02 — THE ROOM</span>
            <h2>Real stories. No masks.</h2>
          </div>
          <div className="room-stats">
            <span>{loading ? "…" : stories.length}<small>stories here</small></span>
            <span>{totalLove}<small>pieces of love</small></span>
          </div>
        </div>

        {status && <div className="status">{status}</div>}

        {loading && stories.length === 0 ? (
          <div className="empty-state">Opening the room…</div>
        ) : stories.length === 0 ? (
          <div className="empty-state">
            <strong>The room is quiet right now.</strong>
            <span>Your story can be the first one somebody needed to read.</span>
            <button className="primary" onClick={() => setComposerOpen(true)}>Open up</button>
          </div>
        ) : (
          <div className="story-grid">
            {stories.map((story, index) => {
              const isLoved = liked.includes(story.id);
              return (
                <motion.article
                  className={`story-card ${index === 0 ? "featured" : ""}`}
                  key={story.id}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.35 }}
                >
                  <div className="story-meta">
                    <span>{story.payload.feeling || "Anonymous truth"}</span>
                    <time>{timeAgo(story.created_at)}</time>
                  </div>
                  {story.payload.title && <h3>{story.payload.title}</h3>}
                  <p>{story.payload.body}</p>
                  <div className="story-foot">
                    <span>Anonymous</span>
                    <button
                      className={isLoved ? "love loved" : "love"}
                      onClick={() => void loveStory(story)}
                      disabled={isLoved}
                      aria-label={isLoved ? "You sent love" : "Send love"}
                    >
                      <span aria-hidden="true">♥</span>
                      {isLoved ? "Loved" : "Show some love"}
                      <b>{loves[story.id] || 0}</b>
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </section>

      <section className="closing">
        <LogoMark />
        <h2>You never know what&apos;s behind a smile.</h2>
        <p>But sometimes knowing you are not carrying it alone changes everything.</p>
        <button className="primary light" onClick={() => setComposerOpen(true)}>Say what&apos;s behind yours</button>
      </section>

      <footer>
        <span>WHAT&apos;S BEHIND THAT SMILE?</span>
        <p>A WeCanJusChill space for the things people usually carry alone.</p>
        <span>Built with love.</span>
      </footer>

      <AnimatePresence>
        {composerOpen && (
          <motion.div
            className="composer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => setComposerOpen(false)}
          >
            <motion.section
              className="composer"
              initial={{ opacity: 0, y: 30, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15 }}
              onMouseDown={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="composer-title"
            >
              <button className="composer-close" onClick={() => setComposerOpen(false)} aria-label="Close">×</button>
              <span className="section-number">YOUR TURN</span>
              <h2 id="composer-title">What&apos;s behind your smile?</h2>
              <p className="composer-note">
                No account. No name. A new anonymous identity signs this story and is discarded after publishing.
              </p>

              <div className="feeling-row" aria-label="Choose a theme">
                {["Grief", "Depression", "Heartbreak", "Starting over", "Missing someone", "Hope"].map((item) => (
                  <button
                    key={item}
                    className={feeling === item ? "feeling active" : "feeling"}
                    onClick={() => setFeeling(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>

              <label>
                A few words at the top <small>optional</small>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value.slice(0, 120))}
                  placeholder="The thing nobody sees…"
                />
              </label>

              <label>
                Your story
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value.slice(0, 5000))}
                  placeholder="You can tell the truth here."
                  autoFocus
                />
              </label>

              <div className="composer-bottom">
                <span>{body.length}/5000</span>
                <button className="primary" disabled={!body.trim() || publishing} onClick={() => void submitStory()}>
                  {publishing ? "Sharing…" : "Share anonymously"}
                </button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
