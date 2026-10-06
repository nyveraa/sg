"use client";

import { motion } from "motion/react";
import { Wordmark } from "./Logo";

const ease = [0.76, 0, 0.24, 1] as const;

/**
 * Boot sequence: the name settles in out of the dark, then the screen parts like a curtain.
 * Render it inside <AnimatePresence> so the exit (the parting) plays when it unmounts.
 */
export function Loader3D({ label = "Entering the dark" }: { label?: string }) {
  return (
    <motion.div className="fixed inset-0 z-[300]" exit={{ pointerEvents: "none" }}>
      <motion.div className="absolute inset-x-0 top-0 h-1/2 bg-black" exit={{ y: "-101%" }} transition={{ duration: 1.1, ease }} />
      <motion.div className="absolute inset-x-0 bottom-0 h-1/2 bg-black" exit={{ y: "101%" }} transition={{ duration: 1.1, ease }} />
      <motion.div className="absolute inset-0 grid place-items-center text-white" exit={{ opacity: 0, scale: 1.1 }} transition={{ duration: 0.45 }}>
        <div className="flex flex-col items-center gap-7">
          <div style={{ animation: "name-in 1.6s cubic-bezier(.2,.8,.2,1) both" }}><Wordmark size={64} /></div>
          <div className="label" style={{ animation: "rise .9s .9s both" }}>{label}</div>
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
