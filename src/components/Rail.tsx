"use client";

import { motion } from "motion/react";
import { Aperture, MessageCircle, Plus, Users } from "lucide-react";
import { useOnyx, type View } from "@/lib/client/store";
import { Avatar } from "./Avatar";
import { Wordmark } from "./Logo";
import type { ModalKind } from "./Sidebar";

const ITEMS: { view: View; label: string; icon: typeof MessageCircle }[] = [
  { view: "chats", label: "Chats", icon: MessageCircle },
  { view: "feed", label: "Moments", icon: Aperture },
  { view: "friends", label: "Friends", icon: Users },
];

/** Left rail on desktop, bottom bar on phones. The name runs vertically up the rail — type, not a logo. */
export function Rail({ onModal, className = "" }: { onModal: (m: ModalKind) => void; className?: string }) {
  const { view, setView, totalUnread, s } = useOnyx();
  const me = s.me!;
  return (
    <nav aria-label="Primary" className={`z-30 flex shrink-0 items-center justify-around border-t border-white/10 bg-[#030304]/95 backdrop-blur-xl md:w-[84px] md:flex-col md:justify-start md:gap-2 md:border-t-0 md:border-r md:py-5 ${className}`}>
      <button onClick={() => setView("chats")} aria-label="Whisper home"
        className="mb-4 hidden text-white transition hover:opacity-70 md:block" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
        <Wordmark size={26} />
      </button>

      {ITEMS.map(({ view: v, label, icon: Icon }) => {
        const on = view === v;
        return (
          <button key={v} onClick={() => setView(v)} aria-label={label} aria-current={on ? "page" : undefined}
            className={`group relative flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-2xl transition ${on ? "text-white" : "text-mute hover:text-white"}`}>
            {on && <motion.span layoutId="rail-pill" className="absolute inset-0 rounded-2xl border border-white/15 bg-white/[0.07] shadow-[0_0_30px_-8px_rgb(var(--acc-glow)/.5)]" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
            <span className="relative"><Icon size={21} strokeWidth={1.6} />
              {v === "chats" && totalUnread > 0 && <span className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--acc-a)] px-1 text-[9px] font-bold text-black">{totalUnread > 9 ? "9+" : totalUnread}</span>}
            </span>
            <span className="relative text-[9px] tracking-[0.18em] uppercase">{label}</span>
          </button>
        );
      })}

      <motion.button onClick={() => onModal("code")} aria-label="Add a friend" title="Add a friend" whileHover={{ rotate: 90 }} whileTap={{ scale: 0.9 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}
        className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-b from-[var(--acc-a)] to-[var(--acc-b)] text-black shadow-[0_10px_30px_-10px_rgb(var(--acc-glow)/.6)] md:mt-3">
        <Plus size={22} strokeWidth={2.2} />
      </motion.button>

      <button onClick={() => onModal("settings")} aria-label="Settings and profile" title="Settings" className="transition hover:scale-105 md:mt-auto"><Avatar user={me} size={42} online={me.prefs.showOnline} /></button>
    </nav>
  );
}
