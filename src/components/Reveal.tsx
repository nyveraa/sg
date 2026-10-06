"use client";

import { motion, type Variants } from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Cinematic headline: words rise out of a mask, staggered. `_underscores_` toggle italics and may span words.
 * The scroll trigger lives on the heading itself — never on a word, because a word that starts hidden inside its
 * own clipping mask would never be seen as "in view".
 */
export function Reveal({
  text, className = "", delay = 0, stagger = 0.07, trigger = "view", as: Tag = "div",
}: { text: string; className?: string; delay?: number; stagger?: number; trigger?: "view" | "mount"; as?: "div" | "h1" | "h2" | "h3" | "p" }) {
  let italicOn = false;
  const lines = text.split("\n").map((line) =>
    line.split(" ").map((w) => {
      if (w.startsWith("_")) { italicOn = true; w = w.slice(1); }
      const italic = italicOn;
      if (w.endsWith("_")) { italicOn = false; w = w.slice(0, -1); }
      return { word: w, italic };
    }));

  const word: Variants = {
    hidden: { y: "115%", rotateX: -40, opacity: 0 },
    show: (i: number) => ({ y: "0%", rotateX: 0, opacity: 1, transition: { duration: 1.05, delay: delay + i * stagger, ease: EASE } }),
  };

  let n = 0;
  const M = motion[Tag];
  return (
    <M className={className} aria-label={text.replace(/[_\n]/g, " ").replace(/ +/g, " ").trim()} initial="hidden"
      {...(trigger === "view" ? { whileInView: "show", viewport: { once: true, margin: "-12% 0px" } } : { animate: "show" })}>
      {lines.map((words, li) => (
        <span key={li} className="block" aria-hidden>
          {words.map(({ word: w, italic }, wi) => (
            <span key={wi} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
              <motion.span className={`inline-block ${italic ? "italic" : ""}`} variants={word} custom={n++} style={{ transformOrigin: "0% 100%" }}>{w}</motion.span>
              {wi < words.length - 1 ? " " : ""}
            </span>
          ))}
        </span>
      ))}
    </M>
  );
}

/** Fade + rise for body copy. */
export function Rise({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 1, delay, ease: EASE }}>{children}</motion.div>
  );
}
