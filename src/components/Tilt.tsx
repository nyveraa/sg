"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "motion/react";

/**
 * Pointer-driven 3D tilt. It also publishes --mx/--my (px) so `.card` can draw a cursor spotlight.
 * Use max={0} for spotlight only.
 */
export function Tilt({
  children, className, style, max = 10, glare = true,
}: { children: ReactNode; className?: string; style?: CSSProperties; max?: number; glare?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  const sx = useSpring(x, { stiffness: 220, damping: 20 });
  const sy = useSpring(y, { stiffness: 220, damping: 20 });
  const rotateX = useTransform(sy, [0, 1], [max, -max]);
  const rotateY = useTransform(sx, [0, 1], [-max, max]);
  const gx = useTransform(sx, (v) => `${v * 100}%`);
  const gy = useTransform(sy, (v) => `${v * 100}%`);
  const sheen = useMotionTemplate`radial-gradient(circle at ${gx} ${gy}, rgb(255 255 255 / .14), transparent 55%)`;

  return (
    <motion.div
      ref={ref}
      className={`relative ${className ?? ""}`}
      style={{ ...style, rotateX, rotateY, transformPerspective: 900, transformStyle: "preserve-3d" }}
      onPointerMove={(e) => {
        const el = ref.current!, r = el.getBoundingClientRect();
        x.set((e.clientX - r.left) / r.width);
        y.set((e.clientY - r.top) / r.height);
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      onPointerLeave={() => { x.set(0.5); y.set(0.5); }}
    >
      {children}
      {glare && max > 0 && (
        <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-screen" style={{ background: sheen }} />
      )}
    </motion.div>
  );
}
