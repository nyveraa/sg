"use client";

import { useEffect, useRef } from "react";
import type { Effect } from "@/lib/types";
import { useOnyx } from "@/lib/client/store";

type P = { x: number; y: number; vx: number; vy: number; r: number; vr: number; life: number; max: number; size: number; ch?: string; color?: string; g: number; drag: number };

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Fullscreen canvas particle effects (/confetti /hearts /fire /boom). Mounted once; fired via ctx.fxRef. */
export function FxLayer() {
  const { fxRef } = useOnyx();
  const cv = useRef<HTMLCanvasElement>(null);
  const parts = useRef<P[]>([]);
  const raf = useRef(0);

  useEffect(() => {
    const canvas = cv.current!;
    const ctx = canvas.getContext("2d")!;
    const fit = () => {
      const d = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = innerWidth * d; canvas.height = innerHeight * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    fit();
    addEventListener("resize", fit);

    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000); last = now;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.current = parts.current.filter((p) => (p.life += dt) < p.max && p.y < innerHeight + 80 && p.y > -200);
      for (const p of parts.current) {
        p.vy += p.g * dt; p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, (p.max - p.life) * 2.2));
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        if (p.ch) { ctx.font = `${p.size}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(p.ch, 0, 0); }
        else { ctx.fillStyle = p.color!; ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6); }
        ctx.restore();
      }
      raf.current = parts.current.length ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => { if (!raf.current) { last = performance.now(); raf.current = requestAnimationFrame(tick); } };

    const base = (): Omit<P, "x" | "y" | "vx" | "vy"> => ({ r: rnd(0, 6), vr: rnd(-8, 8), life: 0, max: rnd(1.6, 3), size: rnd(8, 16), g: 600, drag: 0.4 });

    fxRef.current = (e: Effect) => {
      const W = innerWidth, H = innerHeight, add = parts.current;
      if (e === "confetti") {
        for (let i = 0; i < 170; i++) {
          const left = i % 2 === 0;
          const a = rnd(-Math.PI * 0.85, -Math.PI * 0.15), v = rnd(500, 1100);
          add.push({ ...base(), x: left ? 0 : W, y: H, vx: (Math.abs(Math.cos(a)) * v + 150) * (left ? 1 : -1),
            vy: Math.sin(a) * v, color: `hsl(0 0% ${rnd(60, 100)}%)`, max: rnd(2, 3.6) });
        }
      } else if (e === "hearts") {
        for (let i = 0; i < 46; i++)
          add.push({ ...base(), x: rnd(0, W), y: H + rnd(0, 200), vx: rnd(-40, 40), vy: rnd(-420, -220), g: -30, drag: 0.1,
            ch: ["❤️", "💜", "💖", "🩷", "💕"][i % 5], size: rnd(22, 46), vr: rnd(-1, 1), max: rnd(2.5, 4) });
      } else if (e === "snow") {
        for (let i = 0; i < 160; i++)
          add.push({ ...base(), x: rnd(0, W), y: rnd(-H * 0.6, -10), vx: rnd(-30, 30), vy: rnd(60, 160), g: 6, drag: 0.05,
            ch: i % 5 ? "•" : "❄", size: i % 5 ? rnd(8, 18) : rnd(14, 26), vr: rnd(-0.6, 0.6), max: rnd(5, 8) });
      } else if (e === "stars") {
        for (let i = 0; i < 70; i++)
          add.push({ ...base(), x: rnd(0, W), y: rnd(0, H), vx: rnd(-8, 8), vy: rnd(-14, 6), g: 0, drag: 0.2,
            ch: ["✦", "✧", "✶", "·"][i % 4], size: rnd(14, 40), vr: rnd(-0.4, 0.4), max: rnd(1.6, 3.4) });
      } else if (e === "fire") {
        for (let i = 0; i < 90; i++)
          add.push({ ...base(), x: rnd(0, W), y: H + 20, vx: rnd(-60, 60), vy: rnd(-700, -300), g: -120, drag: 0.5,
            ch: i % 6 ? "🔥" : "✨", size: rnd(24, 54), vr: rnd(-1, 1), max: rnd(1.4, 2.6) });
      } else {
        const cx = W / 2, cy = H / 2;
        for (let i = 0; i < 120; i++) {
          const a = rnd(0, Math.PI * 2), v = rnd(300, 1300);
          add.push({ ...base(), x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 500, drag: 1.4,
            ch: i % 4 ? undefined : "💥", color: `hsl(0 0% ${rnd(70, 100)}%)`, size: i % 4 ? rnd(6, 14) : rnd(28, 52), max: rnd(0.8, 1.6) });
        }
        document.body.animate(
          [{ transform: "translate(0,0)" }, { transform: "translate(-9px,5px)" }, { transform: "translate(8px,-6px)" },
           { transform: "translate(-5px,-4px)" }, { transform: "translate(0,0)" }], { duration: 420 });
      }
      kick();
    };
    return () => { removeEventListener("resize", fit); cancelAnimationFrame(raf.current); raf.current = 0; fxRef.current = null; };
  }, [fxRef]);

  return <canvas ref={cv} aria-hidden className="pointer-events-none fixed inset-0 z-[150] h-full w-full" />;
}
