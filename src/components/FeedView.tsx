"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Heart, ImagePlus, MessageCircle, Plus, Send, Trash2, X } from "lucide-react";
import { api, imageToDataUrl } from "@/lib/client/api";
import { useOnyx } from "@/lib/client/store";
import type { Post, PostComment, User } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Spinner } from "./Loader";
import { StoryComposer, StoryViewer, ago, useSeenStories } from "./Stories";
import { Tilt } from "./Tilt";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g;
const Linkified = ({ text }: { text: string }) => (
  <>{text.split(URL_RE).map((part, i) => i % 2 ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-white">{part}</a> : part)}</>
);

export function FeedView({ onImage }: { onImage: (src: string) => void }) {
  const { s } = useOnyx();
  const me = s.me!;
  const [viewer, setViewer] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "photos" | "mine">("all");
  const posts = s.posts.filter((p) => (filter === "photos" ? !!p.image : filter === "mine" ? p.userId === me.id : true));
  const [composing, setComposing] = useState(false);

  return (
    <div className="h-full min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] px-5 pt-10 pb-28 md:px-8 md:pb-16">
        <header className="mb-9">
          <div className="label mb-3">Moments</div>
          <h1 className="display text-[clamp(2.6rem,6vw,4.2rem)]">What’s <em>happening.</em></h1>
          <p className="mt-3 max-w-md text-[15px] text-mute">Posts and stories — shared only with the people you invited.</p>
        </header>

        <StoryRow onOpen={setViewer} onCompose={() => setComposing(true)} />
        <PostComposer />

        <div className="mt-7 flex gap-1.5" role="tablist" aria-label="Filter posts">
          {([["all", "Everything"], ["photos", "Photos"], ["mine", "Mine"]] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
              className={`rounded-full border px-4 py-1.5 text-[12.5px] transition ${filter === id ? "border-white bg-white text-black" : "border-white/14 text-mute hover:text-white"}`}>{label}</button>
          ))}
        </div>

        {!s.feedLoaded ? (
          <div className="mt-8 space-y-5" aria-busy="true" aria-label="Loading moments">{[0, 1].map((i) => <div key={i} className="skeleton h-56 rounded-[22px]" style={{ animationDelay: `${i * 120}ms` }} />)}</div>
        ) : posts.length === 0 ? (
          <div className="card mt-8 p-10 text-center">
            <p className="display text-[34px]">Nothing posted <em>yet.</em></p>
            <p className="mx-auto mt-3 max-w-xs text-[14.5px] text-mute">Be the first. Share a thought or a photo — your friends will see it instantly.</p>
          </div>
        ) : (
          <div className="mt-8 space-y-5 [perspective:1600px]">
            <AnimatePresence initial={false}>
              {posts.map((p) => <PostCard key={p.id} post={p} author={s.users[p.userId]} mine={p.userId === me.id} onImage={onImage} />)}
            </AnimatePresence>
          </div>
        )}
      </div>

      <StoryViewer startUserId={viewer} onClose={() => setViewer(null)} />
      <StoryComposer open={composing} onClose={() => setComposing(false)} />
    </div>
  );
}

/* ───────────── stories row ───────────── */

function StoryRow({ onOpen, onCompose }: { onOpen: (userId: string) => void; onCompose: () => void }) {
  const { s } = useOnyx();
  const { seen } = useSeenStories();
  const me = s.me!;
  const groups = useMemo(() => {
    const by = new Map<string, Post[]>();
    for (const p of s.stories) by.set(p.userId, [...(by.get(p.userId) ?? []), p]);
    return [...by.entries()].filter(([u]) => u !== me.id).sort(([, a], [, b]) => b[b.length - 1].createdAt - a[a.length - 1].createdAt);
  }, [s.stories, me.id]);
  const mine = s.stories.filter((p) => p.userId === me.id);

  return (
    <div className="-mx-1 mb-6 flex gap-5 overflow-x-auto px-1 pt-1 pb-3 [perspective:700px]" aria-label="Stories">
      <Bubble label="Your story" user={me} ring={mine.length > 0 ? "seen" : "none"} onClick={() => (mine.length ? onOpen(me.id) : onCompose())}
        badge={<span onClick={(e) => { e.stopPropagation(); onCompose(); }} role="button" aria-label="Add to your story" className="absolute -right-0.5 -bottom-0.5 grid h-6 w-6 place-items-center rounded-full border-2 border-black bg-white text-black"><Plus size={14} strokeWidth={2.6} /></span>} />
      {groups.map(([uid, ps]) => (
        <Bubble key={uid} label={s.users[uid]?.displayName ?? "…"} user={s.users[uid]} ring={ps.every((p) => seen.has(p.id)) ? "seen" : "new"} onClick={() => onOpen(uid)} />
      ))}
      {groups.length === 0 && <p className="self-center pl-2 text-[13.5px] text-mute italic">When friends share a story, it appears here.</p>}
    </div>
  );
}

function Bubble({ label, user, ring, onClick, badge }: { label: string; user?: User; ring: "new" | "seen" | "none"; onClick: () => void; badge?: React.ReactNode }) {
  return (
    <Tilt max={16} glare={false} className="shrink-0">
      <button onClick={onClick} className="group flex w-[76px] flex-col items-center gap-2">
        <span className={`relative grid h-[72px] w-[72px] place-items-center rounded-full p-[3px] transition ${ring === "new" ? "bg-[conic-gradient(from_0deg,#fff,#444,#fff,#888,#fff)] shadow-[0_0_28px_-6px_#fff]" : ring === "seen" ? "bg-white/25" : "bg-white/10"}`}>
          <span className="grid h-full w-full place-items-center rounded-full bg-black p-[3px]"><Avatar user={user} size={60} ring={false} /></span>
          {badge}
        </span>
        <span className={`w-full truncate text-center text-[12px] ${ring === "new" ? "text-white" : "text-mute"}`}>{label}</span>
      </button>
    </Tilt>
  );
}

/* ───────────── composer ───────────── */

function PostComposer() {
  const { s, createPost, toast } = useOnyx();
  const me = s.me!;
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ta.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 220) + "px"; } }, [text]);

  async function post() {
    setBusy(true);
    const ok = await createPost({ kind: "post", body: text.trim(), image: image ?? undefined });
    setBusy(false);
    if (ok) { setText(""); setImage(null); }
  }

  return (
    <Tilt className="card p-5" max={0}>
      <div className="flex gap-4">
        <Avatar user={me} size={46} />
        <div className="min-w-0 flex-1">
          <textarea ref={ta} value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1500} placeholder="Share something with your circle…" aria-label="New post"
            className="w-full resize-none bg-transparent pt-2 font-display text-[22px] leading-snug outline-none placeholder:text-dim" />
          {image && (
            <div className="relative mt-2 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="Attachment preview" className="max-h-56 rounded-2xl border border-white/12" />
              <button onClick={() => setImage(null)} aria-label="Remove photo" className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-black/80 text-white"><X size={14} /></button>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
            <button onClick={() => file.current?.click()} className="flex items-center gap-2 rounded-full px-3 py-2 text-[13px] text-mute transition hover:bg-white/8 hover:text-white"><ImagePlus size={17} strokeWidth={1.5} /> Photo</button>
            <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = "";
              if (!f) return;
              try { setImage(await imageToDataUrl(f, 1100)); } catch (err) { toast(err instanceof Error ? err.message : "Couldn't use that image", "error"); }
            }} />
            <button onClick={post} disabled={busy || (!text.trim() && !image)} className="btn btn-sm">{busy ? <Spinner /> : <>Post <Send size={13} /></>}</button>
          </div>
        </div>
      </div>
    </Tilt>
  );
}

/* ───────────── post card ───────────── */

function PostCard({ post, author, mine, onImage }: { post: Post; author?: User; mine: boolean; onImage: (src: string) => void }) {
  const { s, likePost, deletePost, showProfile } = useOnyx();
  const liked = post.likes.includes(s.me!.id);
  const [open, setOpen] = useState(false);
  const [burst, setBurst] = useState(0);

  return (
    <motion.article layout="position" initial={{ opacity: 0, y: 40, rotateX: -10 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
      <Tilt className="card p-6" max={2.5}>
        <header className="flex items-center gap-4">
          <button onClick={() => showProfile(post.userId)} aria-label={`${author?.displayName ?? "Someone"}'s profile`} className="rounded-full transition hover:opacity-80"><Avatar user={author} size={46} online={author?.online} /></button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[21px] leading-none">{mine ? "You" : author?.displayName}</div>
            <div className="mt-1.5 text-[12px] text-mute">{ago(post.createdAt)}</div>
          </div>
          {mine && <button onClick={() => deletePost(post.id)} aria-label="Delete post" className="grid h-9 w-9 place-items-center rounded-full text-dim transition hover:bg-white/10 hover:text-white"><Trash2 size={15} strokeWidth={1.6} /></button>}
        </header>

        {post.body && <p className="mt-5 text-[16.5px] leading-[1.6] break-words whitespace-pre-wrap text-white/90"><Linkified text={post.body} /></p>}
        {post.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.image} alt="Post photo" loading="lazy" onClick={() => onImage(post.image!)} className="mt-5 max-h-[520px] w-full cursor-zoom-in rounded-2xl border border-white/10 object-cover transition duration-500 hover:brightness-110" />
        )}

        <footer className="mt-5 flex items-center gap-2 border-t border-white/10 pt-4">
          <button onClick={() => { likePost(post.id); if (!liked) setBurst((n) => n + 1); }} aria-pressed={liked} aria-label={liked ? "Unlike" : "Like"}
            className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-[13px] transition ${liked ? "bg-white text-black" : "text-mute hover:bg-white/8 hover:text-white"}`}>
            <motion.span key={burst} animate={burst ? { scale: [1, 1.7, 0.9, 1] } : undefined} transition={{ duration: 0.5 }}><Heart size={16} fill={liked ? "currentColor" : "none"} strokeWidth={1.7} /></motion.span>
            {burst > 0 && liked && [0, 1, 2, 3, 4, 5].map((k) => (
              <motion.i key={`${burst}-${k}`} className="pointer-events-none absolute top-1/2 left-7 block h-1 w-1 rounded-full bg-white" initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: Math.cos((k / 6) * Math.PI * 2) * 22, y: Math.sin((k / 6) * Math.PI * 2) * 22, opacity: 0 }} transition={{ duration: 0.6 }} />))}
            {post.likes.length || ""}
          </button>
          <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className={`flex items-center gap-2 rounded-full px-4 py-2 text-[13px] transition ${open ? "bg-white/10 text-white" : "text-mute hover:bg-white/8 hover:text-white"}`}>
            <MessageCircle size={16} strokeWidth={1.7} />{post.commentCount || "Comment"}
          </button>
          {post.likes.length > 0 && <span className="ml-auto truncate text-[12px] text-dim italic">{post.likes.slice(0, 2).map((id) => (id === s.me!.id ? "You" : s.users[id]?.displayName)).filter(Boolean).join(", ")}{post.likes.length > 2 ? ` +${post.likes.length - 2}` : ""} liked this</span>}
        </footer>

        <AnimatePresence initial={false}>{open && <Comments postId={post.id} count={post.commentCount} />}</AnimatePresence>
      </Tilt>
    </motion.article>
  );
}

function Comments({ postId, count }: { postId: number; count: number }) {
  const { s, toast } = useOnyx();
  const [list, setList] = useState<PostComment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    api<{ comments: PostComment[] }>("GET", `/api/posts/${postId}/comments`).then((r) => !dead && setList(r.comments)).catch(() => !dead && setList([]));
    return () => { dead = true; };
  }, [postId, count]); // count changes when anyone comments (live), so the thread refreshes

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try { await api("POST", `/api/posts/${postId}/comments`, { body }); setText(""); }
    catch (err) { toast(err instanceof Error ? err.message : "Couldn't comment", "error"); }
    setBusy(false);
  }

  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
      <div className="space-y-4 pt-5">
        {list === null && <div className="skeleton h-10 rounded-xl" />}
        {list?.map((c) => (
          <div key={c.id} className="flex gap-3">
            <Avatar user={s.users[c.userId]} size={30} ring={false} />
            <div className="min-w-0 rounded-2xl rounded-tl-md border border-white/10 bg-white/[0.03] px-4 py-2.5">
              <div className="flex items-baseline gap-2"><span className="font-display text-[15px]">{c.userId === s.me!.id ? "You" : s.users[c.userId]?.displayName}</span><span className="text-[11px] text-dim">{ago(c.createdAt)}</span></div>
              <p className="text-[14.5px] leading-relaxed break-words text-white/85">{c.body}</p>
            </div>
          </div>
        ))}
        <form onSubmit={add} className="flex gap-2 pt-1">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Write a comment…" aria-label="Write a comment" className="box min-w-0 flex-1 px-5 py-2.5 text-sm placeholder:text-dim" />
          <button disabled={busy || !text.trim()} aria-label="Send comment" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-black disabled:opacity-30">{busy ? <Spinner size={14} /> : <Send size={15} />}</button>
        </form>
      </div>
    </motion.div>
  );
}
