"use client";

import { motion } from "motion/react";
import { Mark } from "./Logo";

const ease = [0.76, 0, 0.24, 1] as const;

/**
 * Boot sequence: the symbol draws itself on black, then the screen parts like a curtain.
 * Render it inside <AnimatePresence> so the exit (the parting) plays when it unmounts.
 */
export function Loader3D({ label = "Entering the dark" }: { label?: string }) {
  return (
    <motion.div className="fixed inset-0 z-[300]" exit={{ pointerEvents: "none" }}>
      <motion.div className="absolute inset-x-0 top-0 h-1/2 bg-black" exit={{ y: "-101%" }} transition={{ duration: 1.1, ease }} />
      <motion.div className="absolute inset-x-0 bottom-0 h-1/2 bg-black" exit={{ y: "101%" }} transition={{ duration: 1.1, ease }} />
      <motion.div className="absolute inset-0 grid place-items-center text-white" exit={{ opacity: 0, scale: 1.15 }} transition={{ duration: 0.45 }}>
        <div className="flex flex-col items-center gap-7">
          <div className="[perspective:700px]"><div style={{ animation: "float-y 5s ease-in-out infinite" }}><Mark size={88} draw /></div></div>
          <div className="text-center">
            <div className="font-display text-[38px] leading-none" style={{ animation: "rise .9s .5s both" }}>onyx<span className="opacity-60">.</span></div>
            <div className="label mt-4" style={{ animation: "rise .9s .8s both" }}>{label}</div>
          </div>
          <div className="relative h-px w-44 overflow-hidden bg-white/12">
            <div className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white to-transparent" style={{ animation: "sweep 1.3s ease-in-out infinite" }} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span role="status" aria-label="Loading" className="inline-block animate-spin rounded-full border-[1.5px] border-current/30 border-t-current"
      style={{ width: size, height: size }} />
  );
}
