"use client";

import { useEffect, useRef } from "react";
import type { Effect } from "@/lib/types";
import { useActions } from "@/lib/client/store";

type P = {
  x: number; y: number; vx: number; vy: number; r: number; vr: number; life: number; max: number; size: number;
  g: number; drag: number; sprite?: HTMLCanvasElement; color?: string;
};

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const MAX_PARTICLES = 260;

/** Emoji are drawn once to a tiny canvas and then blitted — fillText with colour-emoji fonts every frame is the slow part. */
const sprites = new Map<string, HTMLCanvasElement>();
function sprite(ch: string, size: number): HTMLCanvasElement {
  const px = Math.max(12, Math.round(size / 6) * 6), key = `${ch}${px}`;
  let c = sprites.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = c.height = Math.ceil(px * 1.4);
    const g = c.getContext("2d")!;
    g.font = `${px}px serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(ch, c.width / 2, c.height / 2);
    sprites.set(key, c);
  }
  return c;
}

/** 1 = everything, <1 = fewer particles. Follows the user's effects setting and weaker devices. */
function quality(): number {
  const level = document.documentElement.dataset.fx;
  if (level === "off" || matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  let q = level === "lite" ? 0.35 : 1;
  if ((navigator.hardwareConcurrency ?? 8) <= 4) q *= 0.6;
  return q;
}

/** Fullscreen canvas particle effects (/confetti /hearts /snow /stars /fire /boom). Mounted once; fired via ctx.fxRef. */
export function FxLayer() {
  const { fxRef } = useActions();
  const cv = useRef<HTMLCanvasElement>(null);
  const parts = useRef<P[]>([]);
  const raf = useRef(0);

  useEffect(() => {
    const canvas = cv.current!;
    const ctx = canvas.getContext("2d", { alpha: true })!;
    let d = 1;
    const fit = () => {
      d = Math.min(window.devicePixelRatio || 1, 1.5); // retina-sharp isn't worth 4× the pixels for falling confetti
      canvas.width = Math.round(innerWidth * d); canvas.height = Math.round(innerHeight * d);
    };
    fit();
    addEventListener("resize", fit);

    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000); last = now;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const H = innerHeight;
      let w = 0;
      const list = parts.current;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        p.life += dt;
        if (p.life >= p.max || p.y > H + 80 || p.y < -200) continue; // dead: skipped (and compacted below)
        list[w++] = p;
        const k = 1 - p.drag * dt;
        p.vy += p.g * dt; p.vx *= k; p.vy *= k;
        p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        const cos = Math.cos(p.r) * d, sin = Math.sin(p.r) * d;
        ctx.setTransform(cos, sin, -sin, cos, p.x * d, p.y * d);
        ctx.globalAlpha = Math.max(0, Math.min(1, (p.max - p.life) * 2.2));
        if (p.sprite) ctx.drawImage(p.sprite, -p.sprite.width / 2, -p.sprite.height / 2);
        else { ctx.fillStyle = p.color!; ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6); }
      }
      list.length = w;
      raf.current = w && !document.hidden ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => { if (!raf.current) { last = performance.now(); raf.current = requestAnimationFrame(tick); } };

    const base = () => ({ r: rnd(0, 6), vr: rnd(-8, 8), life: 0, max: rnd(1.6, 3), size: rnd(8, 16), g: 600, drag: 0.4 });

    fxRef.current = (e: Effect) => {
      const q = quality();
      if (q === 0) return;
      const W = innerWidth, H = innerHeight, add = parts.current;
      const n = (count: number) => Math.max(8, Math.round(count * q));
      const push = (p: P) => { if (add.length < MAX_PARTICLES) add.push(p); };

      if (e === "confetti") {
        for (let i = 0, N = n(150); i < N; i++) {
          const left = i % 2 === 0;
          const a = rnd(-Math.PI * 0.85, -Math.PI * 0.15), v = rnd(500, 1100);
          push({ ...base(), x: left ? 0 : W, y: H, vx: (Math.abs(Math.cos(a)) * v + 150) * (left ? 1 : -1), vy: Math.sin(a) * v,
            color: `hsl(0 0% ${rnd(60, 100)}%)`, max: rnd(2, 3.4) });
        }
      } else if (e === "hearts") {
        for (let i = 0, N = n(40); i < N; i++)
          push({ ...base(), x: rnd(0, W), y: H + rnd(0, 200), vx: rnd(-40, 40), vy: rnd(-420, -220), g: -30, drag: 0.1,
            sprite: sprite(["❤️", "💜", "💖", "🩷", "💕"][i % 5], rnd(22, 44)), size: 30, vr: rnd(-1, 1), max: rnd(2.5, 4) });
      } else if (e === "snow") {
        for (let i = 0, N = n(130); i < N; i++)
          push({ ...base(), x: rnd(0, W), y: rnd(-H * 0.6, -10), vx: rnd(-30, 30), vy: rnd(60, 160), g: 6, drag: 0.05,
            sprite: sprite(i % 5 ? "•" : "❄", i % 5 ? rnd(8, 18) : rnd(14, 26)), size: 16, vr: rnd(-0.6, 0.6), max: rnd(5, 8) });
      } else if (e === "stars") {
        for (let i = 0, N = n(60); i < N; i++)
          push({ ...base(), x: rnd(0, W), y: rnd(0, H), vx: rnd(-8, 8), vy: rnd(-14, 6), g: 0, drag: 0.2,
            sprite: sprite(["✦", "✧", "✶", "·"][i % 4], rnd(14, 40)), size: 20, vr: rnd(-0.4, 0.4), max: rnd(1.6, 3.4) });
      } else if (e === "fire") {
        for (let i = 0, N = n(70); i < N; i++)
          push({ ...base(), x: rnd(0, W), y: H + 20, vx: rnd(-60, 60), vy: rnd(-700, -300), g: -120, drag: 0.5,
            sprite: sprite(i % 6 ? "🔥" : "✨", rnd(24, 54)), size: 30, vr: rnd(-1, 1), max: rnd(1.4, 2.6) });
      } else {
        const cx = W / 2, cy = H / 2;
        for (let i = 0, N = n(100); i < N; i++) {
          const a = rnd(0, Math.PI * 2), v = rnd(300, 1300), big = i % 4 === 0;
          push({ ...base(), x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 500, drag: 1.4,
            sprite: big ? sprite("💥", rnd(28, 52)) : undefined, color: `hsl(0 0% ${rnd(70, 100)}%)`, size: big ? 30 : rnd(6, 14), max: rnd(0.8, 1.6) });
        }
        if (q > 0.5) document.body.animate(
          [{ transform: "translate(0,0)" }, { transform: "translate(-9px,5px)" }, { transform: "translate(8px,-6px)" },
           { transform: "translate(-5px,-4px)" }, { transform: "translate(0,0)" }], { duration: 420 });
      }
      kick();
    };
    return () => { removeEventListener("resize", fit); cancelAnimationFrame(raf.current); raf.current = 0; fxRef.current = null; };
  }, [fxRef]);

  return <canvas ref={cv} aria-hidden className="pointer-events-none fixed inset-0 z-[150] h-full w-full" />;
}
