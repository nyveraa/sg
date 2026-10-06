"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { ArrowDown } from "lucide-react";
import { api } from "@/lib/client/api";
import { AuthCard, type AuthMode } from "./AuthCard";
import { Avatar } from "./Avatar";
import { Mark, Wordmark } from "./Logo";
import { Reveal, Rise } from "./Reveal";
import { HeroScene } from "./Scene";
import { Tilt } from "./Tilt";

export type InviteInfo = { code: string; valid: boolean; inviter?: { displayName: string; username: string; hue: number } };

const CHAPTERS = ["Prologue", "Access", "Everything", "Enter"];

export function Landing({ invite }: { invite?: InviteInfo }) {
  const router = useRouter();
  const scroller = useRef<HTMLElement>(null);
  const form = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ container: scroller });
  const [mode, setMode] = useState<AuthMode>("signup");
  const [note, setNote] = useState("");
  const [chapter, setChapter] = useState(0);
  const [intro, setIntro] = useState(false);
  const [t0, setT0] = useState(0.2); // headline delay: longer when the curtain plays first

  useMotionValueEvent(scrollYProgress, "change", (p) => setChapter(Math.min(3, Math.floor(p * 4 - 0.001 + 0.05))));
  const heroY = useTransform(scrollYProgress, [0, 0.14], [0, -90]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.12], [1, 0]);

  // Decide once per page load whether to play the curtain. The decision lives in a ref because React StrictMode
  // (development) runs this effect twice: reading sessionStorage twice would make the second run skip the timer.
  const playIntro = useRef<boolean | null>(null);
  useEffect(() => {
    if (invite) { requestAnimationFrame(() => form.current?.scrollIntoView({ behavior: "instant" })); return; }
    if (playIntro.current === null) {
      let seen = false;
      try { seen = sessionStorage.getItem("onyx:intro") === "1"; sessionStorage.setItem("onyx:intro", "1"); } catch { /* storage blocked */ }
      playIntro.current = !seen;
    }
    if (!playIntro.current) return;
    setIntro(true); setT0(2.3);
    const t = setTimeout(() => setIntro(false), 2200);
    return () => clearTimeout(t);
  }, [invite]);

  const toForm = (m?: AuthMode) => { if (m) setMode(m); form.current?.scrollIntoView({ behavior: "smooth" }); };

  async function done() {
    if (invite?.valid) {
      try {
        const { conversation } = await api<{ conversation: { id: string } }>("POST", "/api/invites/redeem", { code: invite.code });
        router.replace(`/app?welcome=${conversation.id}`); // the app plays the "connected" moment on arrival
        return;
      } catch (e) {
        setNote(`You're in, but the invite didn't work: ${e instanceof Error ? e.message : "unknown error"}`);
        await new Promise((r) => setTimeout(r, 2200));
      }
    }
    router.replace("/app");
  }

  return (
    <main ref={scroller} className="stage relative h-dvh overflow-x-hidden overflow-y-auto scroll-smooth">
      {/* fixed cinematic backdrop: aurora light + the stone */}
      <div className="aurora fixed"><i /><i /><i /></div>
      <div className="fixed inset-0"><HeroScene progress={scrollYProgress} /></div>
      <div className="pointer-events-none fixed inset-0 bg-black/60 lg:hidden" />

      <AnimatePresence>{intro && <Curtain key="curtain" />}</AnimatePresence>

      {/* top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between bg-gradient-to-b from-black via-black/70 to-transparent px-6 pt-5 pb-10 sm:px-10 lg:px-14">
        <Wordmark size={24} />
        <div className="flex items-center gap-3">
          <button onClick={() => toForm("login")} className="btn btn-ghost btn-sm">Sign in</button>
          <button onClick={() => toForm("signup")} className="btn btn-sm hidden sm:inline-flex">Request entry</button>
        </div>
      </header>

      {/* chapter rail */}
      <aside className="fixed top-1/2 right-6 z-30 hidden -translate-y-1/2 flex-col items-end gap-4 lg:flex" aria-hidden>
        {CHAPTERS.map((c, i) => (
          <div key={c} className={`flex items-center gap-3 transition-all duration-500 ${chapter === i ? "opacity-100" : "opacity-35"}`}>
            <span className="label">{c}</span>
            <span className={`h-px transition-all duration-500 ${chapter === i ? "w-10 bg-white" : "w-4 bg-white/60"}`} />
          </div>
        ))}
      </aside>

      <div className="relative z-10">
        {/* 0 — prologue */}
        <section className="relative mx-auto flex min-h-dvh max-w-[1400px] items-center px-6 sm:px-10 lg:px-14">
          <motion.div style={{ y: heroY, opacity: heroOpacity }} className="max-w-[760px] pt-16">
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: t0 }} className="label mb-8">Private messaging · by invitation</motion.p>
            <Reveal as="h1" trigger="mount" delay={t0 + 0.1} stagger={0.12} text={"Speak in\n_the dark._"} className="display text-[clamp(3.6rem,10.5vw,9.5rem)]" />
            <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: t0 + 0.9, duration: 1 }} className="mt-9 max-w-md text-[17px] leading-relaxed text-white/70">
              A quiet, cinematic place for the people you actually let in. Voice, moments, games — and nobody you didn’t invite.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: t0 + 1.1, duration: 1 }} className="mt-10 flex flex-wrap gap-3">
              <button onClick={() => toForm("signup")} className="btn">Request entry</button>
              <button onClick={() => scroller.current?.scrollTo({ top: window.innerHeight, behavior: "smooth" })} className="btn btn-ghost">How it works</button>
            </motion.div>
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: t0 + 1.6 }} className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-3 sm:flex">
            <span className="label">Scroll</span><ArrowDown size={14} className="animate-bounce text-mute" />
          </motion.div>
        </section>

        {/* 1 — access */}
        <section className="mx-auto flex min-h-[115dvh] max-w-[1400px] items-center justify-end px-6 sm:px-10 lg:px-14">
          <div className="max-w-[560px]">
            <Rise><p className="label mb-6">01 — Access</p></Rise>
            <Reveal as="h2" text={"Nobody gets in\n_uninvited._"} className="display text-[clamp(2.8rem,6.4vw,5.6rem)]" />
            <Rise delay={0.15}><p className="mt-8 text-[17px] leading-relaxed text-white/70">Every friend arrives through a single-use code. Generate a link, send it, and the door opens exactly once. No feeds to wade through. No strangers to block.</p></Rise>
            <Rise delay={0.25} className="mt-10 [perspective:1000px]"><TicketMock /></Rise>
          </div>
        </section>

        {/* 2 — everything */}
        <section className="mx-auto flex min-h-[135dvh] max-w-[1400px] flex-col justify-center px-6 py-24 sm:px-10 lg:px-14">
          <Rise><p className="label mb-6">02 — Everything</p></Rise>
          <Reveal as="h2" text={"Say it\n_every way._"} className="display mb-14 text-[clamp(2.8rem,6.4vw,5.6rem)]" />
          <div className="grid gap-4 [perspective:1400px] sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 50, rotateX: -18 }} whileInView={{ opacity: 1, y: 0, rotateX: 0 }} viewport={{ once: true, margin: "-8% 0px" }}
                transition={{ duration: 0.9, delay: (i % 3) * 0.1, ease: [0.16, 1, 0.3, 1] }}>
                <Tilt className="card h-full p-6" max={5}>
                  <div className="mb-8 h-24">{f.art}</div>
                  <h3 className="display text-[30px]">{f.title}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-mute">{f.copy}</p>
                </Tilt>
              </motion.div>
            ))}
          </div>
        </section>

        {/* 3 — enter */}
        <section ref={form} id="enter" className="mx-auto flex min-h-dvh max-w-[1400px] items-center px-6 pt-32 pb-24 sm:px-10 lg:px-14">
          <div className="w-full max-w-[460px]">
            <Rise><p className="label mb-6">03 — Enter</p></Rise>
            <Reveal as="h2" text={mode === "signup" ? "Step\n_inside._" : "Welcome\n_back._"} className="display mb-10 text-[clamp(3rem,7vw,6rem)]" />
            {invite?.inviter && (
              <Rise className="mb-9">
                <div className="card flex items-center gap-4 p-4">
                  <Avatar user={invite.inviter} size={46} />
                  <div className="min-w-0">
                    <div className="label">{invite.valid ? "You’re invited by" : "This invite from"}</div>
                    <div className="display truncate text-[22px]">{invite.inviter.displayName}{!invite.valid && <span className="text-[13px] text-mute"> · no longer valid</span>}</div>
                  </div>
                </div>
              </Rise>
            )}
            <Rise delay={0.1}><AuthCard mode={mode} onMode={setMode} onDone={done} /></Rise>
            {note && <p role="status" className="mt-5 text-[13px] text-white/75 italic">{note}</p>}
          </div>
        </section>

        <footer className="mx-auto flex max-w-[1400px] items-center justify-between px-6 pb-8 sm:px-10 lg:px-14">
          <span className="label">© onyx.</span><Mark size={20} className="text-white/40" />
        </footer>
      </div>
    </main>
  );
}

/** Intro: the symbol draws itself on black, then the screen parts like a curtain. */
function Curtain() {
  const ease = [0.76, 0, 0.24, 1] as const;
  return (
    <motion.div className="fixed inset-0 z-[250]" exit={{ pointerEvents: "none" }}>
      <motion.div className="absolute inset-x-0 top-0 h-1/2 bg-black" exit={{ y: "-101%" }} transition={{ duration: 1.2, ease }} />
      <motion.div className="absolute inset-x-0 bottom-0 h-1/2 bg-black" exit={{ y: "101%" }} transition={{ duration: 1.2, ease }} />
      <motion.div className="absolute inset-0 grid place-items-center" exit={{ opacity: 0, scale: 1.2 }} transition={{ duration: 0.5 }}>
        <div className="flex flex-col items-center gap-6">
          <Mark size={84} draw className="text-white" />
          <motion.div initial={{ opacity: 0, letterSpacing: "0.1em" }} animate={{ opacity: 1, letterSpacing: "-0.02em" }} transition={{ delay: 0.7, duration: 1.2 }} className="font-display text-[34px]">onyx.</motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function TicketMock() {
  return (
    <Tilt className="card relative max-w-[420px] overflow-hidden p-6" max={9}>
      <div className="sheen pointer-events-none absolute inset-0" />
      <div className="flex items-center justify-between"><Mark size={24} /><span className="label">Single use · 7 days</span></div>
      <div className="my-8 text-center font-mono text-[34px] font-medium tracking-[0.14em] metal">K7Q2–M9XD</div>
      <div className="relative -mx-6 border-t border-dashed border-white/20">
        <span className="absolute -top-2.5 -left-2.5 h-5 w-5 rounded-full bg-[#050506] ring-1 ring-white/15" /><span className="absolute -top-2.5 -right-2.5 h-5 w-5 rounded-full bg-[#050506] ring-1 ring-white/15" />
      </div>
      <div className="mt-4 flex justify-between text-[12px] text-mute"><span>onyx.app/join/K7Q2M9XD</span><span className="italic">one door, once</span></div>
    </Tilt>
  );
}

/* tiny animated illustrations for the feature cards */
const Wave = () => (
  <div className="flex h-full items-center gap-[3px]">{Array.from({ length: 30 }, (_, i) => (
    <i key={i} className="block w-[3px] origin-center rounded-full bg-white/80" style={{ height: 14 + ((i * 37) % 54), animation: `bar ${1.1 + (i % 5) * 0.18}s ease-in-out ${i * 0.05}s infinite` }} />))}</div>
);
const Stories = () => (
  <div className="relative h-full [perspective:500px]">{[0, 1, 2].map((i) => (
    <div key={i} className="absolute top-1 h-[88px] w-[58px] rounded-xl border border-white/20" style={{ left: 8 + i * 44, transform: `rotateY(${-22 + i * 22}deg) translateZ(${i === 1 ? 24 : 0}px)`, background: `linear-gradient(${150 + i * 30}deg, #26262b, #0a0a0c)` }} />))}</div>
);
const Board = () => (
  <div className="grid h-full w-[96px] grid-cols-3 gap-1">{["✕", "", "◯", "", "✕", "", "◯", "", "✕"].map((c, i) => (
    <div key={i} className="grid place-items-center rounded-md border border-white/14 font-display text-lg">{c}</div>))}</div>
);
const Bars = () => (
  <div className="flex h-full flex-col justify-center gap-2.5">{[88, 56, 32].map((w, i) => (
    <div key={i} className="h-5 rounded-full border border-white/14 p-[2px]"><div className="h-full rounded-full bg-white/80" style={{ width: `${w}%` }} /></div>))}</div>
);
const Squiggle = () => (
  <svg viewBox="0 0 220 96" className="h-full w-full" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
    <path d="M6 70 C 30 10, 52 10, 66 56 S 104 100, 124 40 S 170 6, 214 52" pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1, animation: "draw 2.6s ease-in-out infinite alternate" }} />
  </svg>
);
const Sparks = () => (
  <div className="relative h-full">{Array.from({ length: 22 }, (_, i) => (
    <i key={i} className="absolute block rounded-full bg-white" style={{ left: `${(i * 47) % 96}%`, top: `${(i * 31) % 90}%`, width: 2 + (i % 3), height: 2 + (i % 3), opacity: 0.35 + (i % 4) * 0.15, animation: `float-y ${3 + (i % 4)}s ease-in-out ${i * 0.1}s infinite` }} />))}</div>
);

const FEATURES = [
  { title: "Voice notes", copy: "Hold a thought and say it. Waveforms, speed control, no typing.", art: <Wave /> },
  { title: "Moments", copy: "Posts and 24-hour stories — seen only by the people you invited.", art: <Stories /> },
  { title: "Games", copy: "Tic-Tac-Toe, Connect Four, Rock Paper Scissors — right inside the chat.", art: <Board /> },
  { title: "Polls & prompts", copy: "Settle it with a vote, or play Truth and Dare with the group.", art: <Bars /> },
  { title: "Sketch", copy: "Draw something on the spot and send it as a picture.", art: <Squiggle /> },
  { title: "Screen effects", copy: "Confetti, snow, stars, fire. Make the whole room react.", art: <Sparks /> },
];
