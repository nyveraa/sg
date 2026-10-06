"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Aperture, Bell, CornerDownLeft, Eye, Keyboard, MessageCircle, PartyPopper, Plus, Search, Settings as Cog, Ticket, UserPlus, Users, Volume2 } from "lucide-react";
import { convName, useOnyx } from "@/lib/client/store";
import { previewOf } from "@/lib/client/format";
import { Avatar } from "./Avatar";
import type { ModalKind } from "./Sidebar";

type Item = { id: string; group: string; label: string; hint?: string; lead: React.ReactNode; run: () => void };

/** Ctrl/⌘ + K: jump to any chat or person, or run any action. */
export function CommandPalette({ open, onClose, onModal, onShortcuts }: { open: boolean; onClose: () => void; onModal: (m: ModalKind) => void; onShortcuts: () => void }) {
  const { s, friends, setActive, setView, setPrefs, fxRef, showProfile } = useOnyx();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const me = s.me!;
  useEffect(() => { if (open) { setQ(""); setI(0); } }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (fn: () => void) => () => { onClose(); fn(); };
    const chats: Item[] = Object.values(s.convs).sort((a, b) => b.updatedAt - a.updatedAt).map((c) => ({
      id: `c-${c.id}`, group: "Chats", label: convName(c, s.users, me.id), hint: previewOf(c.last, s.users, me.id),
      lead: <Avatar user={c.kind === "dm" ? s.users[c.memberIds.find((x) => x !== me.id) ?? ""] : undefined} group={c.kind === "group"} size={30} />, run: go(() => setActive(c.id)),
    }));
    const people: Item[] = friends.map((f) => ({ id: `p-${f.id}`, group: "People", label: f.displayName, hint: `@${f.username}`, lead: <Avatar user={f} size={30} />, run: go(() => showProfile(f.id)) }));
    const act = (id: string, label: string, hint: string, icon: React.ReactNode, fn: () => void): Item => ({ id, group: "Actions", label, hint, lead: <span className="grid h-[30px] w-[30px] place-items-center rounded-full border border-white/14 text-mute">{icon}</span>, run: go(fn) });
    return [
      ...chats, ...people,
      act("a-chats", "Go to Chats", "Alt + 1", <MessageCircle size={14} />, () => setView("chats")),
      act("a-feed", "Go to Moments", "Alt + 2", <Aperture size={14} />, () => setView("feed")),
      act("a-friends", "Go to Friends", "Alt + 3", <Users size={14} />, () => setView("friends")),
      act("a-invite", "New invite link", "Generate a single-use code", <Ticket size={14} />, () => onModal("invite")),
      act("a-code", "Add a friend with a code", "Enter an invite code", <UserPlus size={14} />, () => onModal("code")),
      act("a-group", "New group", "Start a group chat", <Plus size={14} />, () => onModal("group")),
      act("a-settings", "Open settings", "Profile, privacy, appearance", <Cog size={14} />, () => onModal("settings")),
      act("a-receipts", `Read receipts: ${me.prefs.readReceipts ? "turn off" : "turn on"}`, "Privacy", <Eye size={14} />, () => setPrefs({ readReceipts: !me.prefs.readReceipts })),
      act("a-sound", `Sounds: ${me.prefs.sounds ? "mute" : "unmute"}`, "Notification sounds", <Volume2 size={14} />, () => setPrefs({ sounds: !me.prefs.sounds })),
      act("a-notify", `Desktop notifications: ${me.prefs.notifications ? "off" : "on"}`, "Open settings to allow", <Bell size={14} />, () => onModal("settings")),
      act("a-confetti", "Throw confetti", "Because you can", <PartyPopper size={14} />, () => fxRef.current?.("confetti")),
      act("a-keys", "Keyboard shortcuts", "?", <Keyboard size={14} />, onShortcuts),
    ];
  }, [s.convs, s.users, friends, me.id, me.prefs.readReceipts, me.prefs.sounds, me.prefs.notifications, onClose, onModal, onShortcuts, setActive, setView, setPrefs, fxRef, showProfile]);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return items.filter((x) => x.group !== "People").slice(0, 14);
    return items
      .map((x) => { const t = `${x.label} ${x.hint ?? ""}`.toLowerCase(); return { x, score: words.every((w) => t.includes(w)) ? (x.label.toLowerCase().startsWith(words[0]) ? 2 : 1) : 0 }; })
      .filter((r) => r.score).sort((a, b) => b.score - a.score).map((r) => r.x).slice(0, 30);
  }, [items, q]);

  useEffect(() => { setI(0); }, [q]);
  useEffect(() => { list.current?.children[i]?.scrollIntoView({ block: "nearest" }); }, [i]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setI((n) => Math.min(shown.length - 1, n + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); shown[i]?.run(); }
    else if (e.key === "Escape") onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[140] flex items-start justify-center px-4 pt-[14vh] [perspective:1200px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label="Command palette" className="card relative w-full max-w-[600px] overflow-hidden shadow-[0_50px_140px_-30px_#000]" style={{ borderRadius: 24 }}
            initial={{ opacity: 0, rotateX: -14, y: -16, scale: 0.97 }} animate={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ type: "spring", stiffness: 340, damping: 30 }}>
            <label className="flex items-center gap-4 border-b border-white/10 px-6 py-5">
              <Search size={18} className="text-mute" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Jump to a chat, a person, or an action…" aria-label="Search commands" className="w-full bg-transparent text-[17px] outline-none placeholder:text-dim" />
              <kbd className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-dim">Esc</kbd>
            </label>
            <ul ref={list} className="max-h-[52vh] overflow-y-auto p-2" role="listbox">
              {shown.length === 0 && <li className="px-5 py-10 text-center text-[14px] text-mute italic">Nothing matches “{q}”.</li>}
              {shown.map((x, k) => (
                <li key={x.id} role="option" aria-selected={k === i}>
                  {(k === 0 || shown[k - 1].group !== x.group) && <div className="label px-4 pt-3 pb-1.5">{x.group}</div>}
                  <button onClick={x.run} onMouseMove={() => setI(k)} className={`flex w-full items-center gap-4 rounded-xl px-4 py-2.5 text-left transition ${k === i ? "bg-white/[0.08]" : ""}`}>
                    {x.lead}
                    <span className="min-w-0 flex-1"><span className="block truncate text-[15px]">{x.label}</span>{x.hint && <span className="block truncate text-[12px] text-mute">{x.hint}</span>}</span>
                    {k === i && <CornerDownLeft size={14} className="text-mute" />}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
