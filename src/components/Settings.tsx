"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Bell, Camera, Check, Download, Eye, KeyRound, LogOut, Palette, Shield, Trash2, User as UserIcon } from "lucide-react";
import { api, avatarFromFile } from "@/lib/client/api";
import { previewPack } from "@/lib/client/sound";
import { useOnyx } from "@/lib/client/store";
import { ACCENTS, BUBBLES, EFFECT_LEVELS, SOUND_PACKS, TEXT_SIZES, WALLPAPERS, type Prefs } from "@/lib/prefs";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { Spinner } from "./Loader";
import { Tilt } from "./Tilt";

type Tab = "profile" | "privacy" | "appearance" | "notifications" | "account";
const TABS: { id: Tab; label: string; icon: typeof UserIcon }[] = [
  { id: "profile", label: "Profile", icon: UserIcon }, { id: "privacy", label: "Privacy", icon: Shield },
  { id: "appearance", label: "Appearance", icon: Palette }, { id: "notifications", label: "Sound", icon: Bell }, { id: "account", label: "Account", icon: KeyRound },
];
const STATUS_PRESETS = ["🟢 Available", "🌙 Do not disturb", "🎧 Listening to music", "🧠 Focusing", "🏖️ Away", "🎮 Gaming"];
const ACCENT_SWATCH: Record<Prefs["accent"], string> = { pearl: "#ffffff", ice: "#b3d1ff", rose: "#ffc2cf", amber: "#ffd89a", mint: "#b2f0d2", violet: "#cdbcff" };

function Switch({ on, label, hint, onChange }: { on: boolean; label: string; hint?: string; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} role="switch" aria-checked={on} className="flex w-full items-center gap-5 rounded-2xl border border-white/10 px-5 py-4 text-left transition hover:border-white/30">
      <span className="min-w-0 flex-1"><span className="block text-[15px]">{label}</span>{hint && <span className="mt-0.5 block text-[12.5px] leading-snug text-mute">{hint}</span>}</span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-white" : "bg-white/15"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${on ? "left-[22px] bg-black" : "left-0.5 bg-white/70"}`} /></span>
    </button>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full border border-white/14 p-1">
      {options.map((o) => (
        <button key={o} role="radio" aria-checked={value === o} onClick={() => onChange(o)} className="relative flex-1 rounded-full px-3 py-2 text-[12px] tracking-[0.1em] uppercase transition" style={{ color: value === o ? "#000" : "#92929a" }}>
          {value === o && <motion.span layoutId={`seg-${label}`} className="absolute inset-0 rounded-full bg-white" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          <span className="relative font-semibold">{o}</span>
        </button>
      ))}
    </div>
  );
}

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (<section className="mb-8"><div className="label mb-3">{title}</div>{children}</section>);

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { s, saveProfile, setPrefs, logout, toast } = useOnyx();
  const me = s.me!;
  const p = me.prefs;
  const [tab, setTab] = useState<Tab>("profile");
  const [name, setName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio);
  const [status, setStatus] = useState(me.status);
  const [pronouns, setPronouns] = useState(me.pronouns);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Prefs>(k: K) => (v: Prefs[K]) => setPrefs({ [k]: v } as Partial<Prefs>);

  useEffect(() => { if (open) { setName(me.displayName); setBio(me.bio); setStatus(me.status); setPronouns(me.pronouns); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true);
    try { await saveProfile({ displayName: name.trim() || me.displayName, bio: bio.trim(), status: status.trim(), pronouns: pronouns.trim() }); toast("Profile saved", "ok"); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't save", "error"); }
    setBusy(false);
  }
  async function photo(f?: File) {
    if (!f) return;
    try { await saveProfile({ avatar: await avatarFromFile(f) }); toast("Photo updated", "ok"); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't use that photo", "error"); }
  }
  async function notifications(on: boolean) {
    if (on && typeof Notification !== "undefined" && Notification.permission !== "granted") {
      const r = await Notification.requestPermission();
      if (r !== "granted") return toast("Allow notifications in your browser to turn this on", "error");
    }
    setPrefs({ notifications: on });
  }

  return (
    <Modal open={open} onClose={onClose} title="Settings" eyebrow={`@${me.username}`} width={680}>
      <div className="-mx-1 mb-7 flex gap-1 overflow-x-auto pb-1" role="tablist">
        {TABS.map(({ id, label, icon: I }) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[12.5px] transition ${tab === id ? "bg-white font-semibold text-black" : "text-mute hover:text-white"}`}><I size={14} />{label}</button>
        ))}
      </div>

      {tab === "profile" && (
        <>
          <Tilt className="card mb-7 flex items-center gap-5 p-5" max={5}>
            <div className="relative">
              <Avatar user={{ displayName: name || me.displayName, avatar: me.avatar }} size={84} online={p.showOnline} />
              <button onClick={() => file.current?.click()} aria-label="Change profile photo" className="absolute -right-1 -bottom-1 grid h-9 w-9 place-items-center rounded-full border-2 border-black bg-white text-black transition hover:scale-110"><Camera size={15} /></button>
              <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void photo(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            <div className="min-w-0">
              <div className="display truncate text-[30px]">{name || me.displayName}</div>
              <div className="mt-1 truncate text-[13px] text-mute">{status || "No status"}{pronouns ? ` · ${pronouns}` : ""}</div>
              {me.avatar && <button onClick={() => void saveProfile({ avatar: null })} className="mt-2 text-[12px] text-mute underline underline-offset-2 hover:text-white">Remove photo</button>}
            </div>
          </Tilt>
          <div className="space-y-6">
            <label className="block"><span className="label">Display name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="field" /></label>
            <label className="block"><span className="label">Status</span><input value={status} onChange={(e) => setStatus(e.target.value)} maxLength={60} placeholder="What are you up to?" className="field" /></label>
            <div className="flex flex-wrap gap-2">{STATUS_PRESETS.map((x) => <button key={x} onClick={() => setStatus(x)} className="rounded-full border border-white/14 px-3 py-1.5 text-[12px] text-mute transition hover:border-white/50 hover:text-white">{x}</button>)}
              {status && <button onClick={() => setStatus("")} className="rounded-full px-3 py-1.5 text-[12px] text-dim underline underline-offset-2">Clear</button>}</div>
            <label className="block"><span className="label">Pronouns <span className="normal-case tracking-normal text-dim">— optional</span></span><input value={pronouns} onChange={(e) => setPronouns(e.target.value)} maxLength={24} placeholder="she/her, he/him, they/them…" className="field" /></label>
            <label className="block"><span className="label">Bio</span><input value={bio} onChange={(e) => setBio(e.target.value)} maxLength={140} placeholder="Shown on your profile" className="field" /></label>
          </div>
          <button onClick={save} disabled={busy} className="btn mt-8 w-full justify-between"><span>Save profile</span>{busy ? <Spinner /> : <Check size={16} />}</button>
        </>
      )}

      {tab === "privacy" && (
        <>
          <Group title="Who sees what">
            <div className="space-y-2.5">
              <Switch on={p.readReceipts} onChange={set("readReceipts")} label="Read receipts" hint="Show “Seen” when you've read a message. It works both ways: turn it off and you won't see others' receipts either." />
              <Switch on={p.showLastSeen} onChange={set("showLastSeen")} label="Last active" hint="Let friends see when you were last around. Off hides it from everyone (you still see your own)." />
              <Switch on={p.showOnline} onChange={set("showOnline")} label="Online status" hint="Show the white dot when you're online. Off also hides your last-active time while you're connected." />
              <Switch on={p.typingIndicator} onChange={set("typingIndicator")} label="Typing indicator" hint="Let people see when you're writing to them." />
            </div>
          </Group>
          <p className="flex gap-3 text-[13px] leading-relaxed text-mute"><Eye size={16} className="mt-0.5 shrink-0" />These apply immediately and are enforced on the server — nothing about your activity is sent to people you've hidden it from.</p>
        </>
      )}

      {tab === "appearance" && (
        <>
          <Group title="Accent">
            <div className="flex gap-3" role="radiogroup" aria-label="Accent colour">
              {ACCENTS.map((a) => (
                <button key={a} role="radio" aria-checked={p.accent === a} aria-label={a} onClick={() => setPrefs({ accent: a })}
                  className={`h-11 w-11 rounded-full transition ${p.accent === a ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-black" : "ring-1 ring-white/20 hover:scale-105"}`} style={{ background: `linear-gradient(135deg, ${ACCENT_SWATCH[a]}, ${ACCENT_SWATCH[a]}99)` }} />
              ))}
            </div>
          </Group>
          <Group title="Chat wallpaper">
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
              {WALLPAPERS.map((w) => (
                <button key={w} onClick={() => setPrefs({ wallpaper: w })} aria-pressed={p.wallpaper === w} className="text-center">
                  <div data-wp={w} className={`chat-bg h-16 rounded-xl border bg-black transition ${p.wallpaper === w ? "border-white" : "border-white/14 hover:border-white/40"}`} />
                  <span className={`mt-1.5 block text-[11px] capitalize ${p.wallpaper === w ? "text-white" : "text-mute"}`}>{w}</span>
                </button>
              ))}
            </div>
          </Group>
          <Group title="Message bubbles">
            <Seg label="bubbles" value={p.bubbles} options={BUBBLES} onChange={set("bubbles")} />
            <div className="mt-4 flex flex-col items-end gap-2 rounded-2xl border border-white/10 p-4">
              <div className="msg-text max-w-[75%] rounded-[22px] rounded-bl-[6px] border border-white/10 bg-[#17171a] px-4 py-2.5 text-[15px]">Is this the one?</div>
              <div className={`msg-text max-w-[75%] self-end rounded-[22px] rounded-br-[6px] px-4 py-2.5 text-[15px] ${p.bubbles === "outline" ? "border border-white/60 text-white" : p.bubbles === "solid" ? "bg-[var(--acc-a)] text-black" : "bg-gradient-to-br from-[var(--acc-a)] to-[var(--acc-b)] text-black"}`}>It really is.</div>
            </div>
          </Group>
          <Group title="Text size"><Seg label="text size" value={p.textSize} options={TEXT_SIZES} onChange={set("textSize")} /></Group>
          <Group title="Effects">
            <Seg label="effects" value={p.effects} options={EFFECT_LEVELS} onChange={set("effects")} />
            <p className="mt-3 text-[12.5px] leading-relaxed text-mute"><b className="font-medium text-white">Full</b> — everything. <b className="font-medium text-white">Lite</b> — no film grain, drifting light or 3D scenes; fewer confetti pieces. <b className="font-medium text-white">Off</b> — no motion or effects at all. Pick Lite if the app feels heavy on your device.</p>
          </Group>
          <Switch on={p.compact} onChange={set("compact")} label="Compact messages" hint="Tighter spacing between bubbles to fit more on screen." />
        </>
      )}

      {tab === "notifications" && (
        <>
          <div className="space-y-2.5">
            <Switch on={p.sounds} onChange={set("sounds")} label="Sounds" hint="Play a sound for new messages and reactions." />
            <Switch on={p.notifications} onChange={(v) => void notifications(v)} label="Desktop notifications" hint="Get a notification when a message arrives while the tab is in the background. Muted chats stay quiet." />
            <Switch on={p.enterToSend} onChange={set("enterToSend")} label="Enter sends" hint="Off: Enter adds a new line and Ctrl/⌘ + Enter sends." />
          </div>
          <Group title="Notification sound">
            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {SOUND_PACKS.map((k) => (
                <button key={k} onClick={() => { setPrefs({ soundPack: k }); setTimeout(() => previewPack(k), 50); }} aria-pressed={p.soundPack === k}
                  className={`rounded-2xl border px-4 py-3.5 text-[13px] capitalize transition ${p.soundPack === k ? "border-white bg-white text-black" : "border-white/14 text-mute hover:border-white/50 hover:text-white"}`}>{k}</button>
              ))}
            </div>
          </Group>
        </>
      )}

      {tab === "account" && <AccountTab onClose={onClose} logout={logout} />}
    </Modal>
  );
}

function AccountTab({ onClose, logout }: { onClose: () => void; logout: () => Promise<void> }) {
  const { toast } = useOnyx();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const [delPw, setDelPw] = useState("");

  async function run(key: string, fn: () => Promise<void>, ok?: string) {
    setBusy(key);
    try { await fn(); if (ok) toast(ok, "ok"); } catch (e) { toast(e instanceof Error ? e.message : "Something went wrong", "error"); }
    setBusy(null);
  }

  return (
    <>
      <Group title="Change password">
        <form onSubmit={(e) => { e.preventDefault(); void run("pw", async () => { await api("POST", "/api/auth/password", { current: cur, next }); setCur(""); setNext(""); }, "Password changed — other devices were signed out"); }} className="space-y-5">
          <label className="block"><span className="label">Current password</span><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required className="field" /></label>
          <label className="block"><span className="label">New password</span><input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required placeholder="At least 8 characters" className="field" /></label>
          <button disabled={busy === "pw"} className="btn btn-sm">{busy === "pw" ? <Spinner /> : "Update password"}</button>
        </form>
      </Group>

      <Group title="Sessions & data">
        <div className="flex flex-wrap gap-2.5">
          <button onClick={() => void logout()} className="btn btn-ghost btn-sm"><LogOut size={13} /> Log out</button>
          <button disabled={busy === "all"} onClick={() => void run("all", async () => { await api("POST", "/api/auth/logout-all"); location.href = "/"; })} className="btn btn-ghost btn-sm">Log out everywhere</button>
          <a href="/api/export" className="btn btn-ghost btn-sm"><Download size={13} /> Download my data</a>
        </div>
      </Group>

      <Group title="Danger zone">
        {!del ? (
          <button onClick={() => setDel(true)} className="btn btn-danger btn-sm"><Trash2 size={13} /> Delete my account</button>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void run("del", async () => { await api("DELETE", "/api/me", { password: delPw }); onClose(); location.href = "/"; }); }} className="space-y-4 rounded-2xl border border-red-400/30 p-5">
            <p className="text-[14px] leading-relaxed text-white/80">This permanently deletes your account, your messages, posts and one-to-one chats. Group-mates will just see you leave. It can’t be undone.</p>
            <label className="block"><span className="label">Confirm with your password</span><input type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} required className="field" /></label>
            <div className="flex gap-2.5"><button disabled={busy === "del" || !delPw} className="btn btn-danger btn-sm">{busy === "del" ? <Spinner /> : "Delete forever"}</button><button type="button" onClick={() => { setDel(false); setDelPw(""); }} className="btn btn-ghost btn-sm">Cancel</button></div>
          </form>
        )}
      </Group>
    </>
  );
}
