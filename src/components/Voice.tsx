"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Send, Trash2 } from "lucide-react";
import { VoiceOrb } from "./Scene";
import { Spinner } from "./Loader";
import type { Message, VoiceData } from "@/lib/types";

const MAX_SECONDS = 120;
export type VoiceClip = { audio: string; duration: number; peaks: number[] };
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Shrinks raw mic levels to ≤48 bars, normalised so quiet clips still show shape. */
function toPeaks(levels: number[], bars = 48): number[] {
  if (!levels.length) return Array(bars).fill(0.12);
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const a = Math.floor((i / bars) * levels.length), b = Math.max(a + 1, Math.floor(((i + 1) / bars) * levels.length));
    out.push(Math.max(...levels.slice(a, b)));
  }
  const top = Math.max(...out, 0.001);
  return out.map((v) => Math.max(0.08, Math.round((v / top) * 100) / 100));
}

/** Inline recorder: mic orb + live waveform + timer. Calls onSend with a base64 clip, or onCancel. */
export function VoiceRecorder({ onSend, onCancel, onError }: { onSend: (v: VoiceClip) => Promise<unknown>; onCancel: () => void; onError: (msg: string) => void }) {
  const level = useRef(0);
  const levels = useRef<number[]>([]);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const started = useRef(0);
  const discard = useRef(false);
  const [secs, setSecs] = useState(0);
  const [live, setLive] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  // Latest callbacks live in a ref so a parent re-render can never restart the recording.
  const cb = useRef({ onSend, onCancel, onError });
  cb.current = { onSend, onCancel, onError };

  const cleanup = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    void ctx.current?.close().catch(() => {});
  }, []);

  useEffect(() => {
    let dead = false;
    // Fresh state per mount (React StrictMode mounts, tears down, and mounts again in development).
    discard.current = false; chunks.current = []; levels.current = [];
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("unsupported");
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m));
        const r = new MediaRecorder(s, { mimeType: mime, audioBitsPerSecond: 32000 });
        rec.current = r;
        r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        r.onstop = async () => {
          cleanup();
          if (discard.current) return;
          const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
          const audio: string = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(blob); });
          const duration = Math.max(0.5, (Date.now() - started.current) / 1000);
          if (audio.length > 1_800_000) { cb.current.onError("That recording is too long"); cb.current.onCancel(); return; }
          await cb.current.onSend({ audio, duration: Math.min(duration, 180), peaks: toPeaks(levels.current) });
          cb.current.onCancel(); // sent or failed, the recorder is finished either way — return to the normal composer
        };
        // metering
        const ac = new AudioContext();
        ctx.current = ac;
        const an = ac.createAnalyser(); an.fftSize = 512;
        ac.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.fftSize);
        let lastSample = 0;
        const tick = (now: number) => {
          an.getByteTimeDomainData(buf);
          let sum = 0; for (const v of buf) sum += ((v - 128) / 128) ** 2;
          level.current = Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
          if (now - lastSample > 110) {
            lastSample = now;
            levels.current.push(level.current);
            setLive((l) => [...l.slice(-39), level.current]);
            const t = (Date.now() - started.current) / 1000;
            setSecs(t);
            if (t >= MAX_SECONDS && r.state === "recording") { r.stop(); setReady(true); }
          }
          raf.current = requestAnimationFrame(tick);
        };
        started.current = Date.now();
        r.start(250);
        raf.current = requestAnimationFrame(tick);
      } catch (err) {
        console.error("[voice] recorder failed", err);
        if (!dead) { cb.current.onError("Microphone unavailable — check browser permissions"); cb.current.onCancel(); }
      }
    })();
    return () => { dead = true; discard.current = true; if (rec.current?.state === "recording") rec.current.stop(); cleanup(); };
  }, [cleanup]);

  const finish = () => { if (rec.current?.state === "recording") { setSending(true); rec.current.stop(); } };
  const cancel = () => { discard.current = true; if (rec.current?.state === "recording") rec.current.stop(); cleanup(); cb.current.onCancel(); };

  return (
    <div className="flex items-center gap-3 rounded-full border border-white/20 bg-white/[0.04] p-1.5 pr-2">
      <button onClick={cancel} aria-label="Discard recording" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-mute transition hover:bg-white/10 hover:text-white"><Trash2 size={17} strokeWidth={1.6} /></button>
      <div className="h-12 w-12 shrink-0" aria-hidden><VoiceOrb level={level} /></div>
      <div className="flex h-10 min-w-0 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden>
        {Array.from({ length: 40 }, (_, i) => {
          const v = live[i - (40 - live.length)] ?? 0;
          return <i key={i} className="block w-[3px] shrink-0 rounded-full bg-white/80 transition-[height] duration-100" style={{ height: 4 + v * 32, opacity: v ? 0.5 + v * 0.5 : 0.18 }} />;
        })}
      </div>
      <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums" role="timer" aria-live="off">{fmt(secs)}</span>
      <button onClick={finish} disabled={sending && !ready} aria-label="Send voice message" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-black transition hover:scale-105">
        {sending ? <Spinner size={15} /> : <Send size={16} />}
      </button>
    </div>
  );
}

let playing: HTMLAudioElement | null = null; // only one clip plays at a time

/** Playback bubble: play/pause, scrubbable waveform, speed toggle. */
export function VoiceBubble({ m, mine }: { m: Message; mine: boolean }) {
  const d = m.data as VoiceData;
  const el = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  const [t, setT] = useState(0);
  const [rate, setRate] = useState(1);
  const dur = d.duration;
  const pct = Math.min(1, t / dur);

  const toggle = () => {
    const a = el.current!;
    if (a.paused) { if (playing && playing !== a) playing.pause(); playing = a; void a.play(); } else a.pause();
  };
  const seek = (ratio: number) => { const a = el.current!; a.currentTime = Math.max(0, Math.min(dur, ratio * dur)); setT(a.currentTime); };
  const cycle = () => { const n = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1; setRate(n); el.current!.playbackRate = n; };

  return (
    <div className="flex min-w-[250px] items-center gap-3">
      <audio ref={el} src={m.body} preload="metadata" onPlay={() => setOn(true)} onPause={() => setOn(false)} onEnded={() => { setOn(false); setT(0); }}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} />
      <button onClick={toggle} aria-label={on ? "Pause" : "Play voice message"}
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition hover:scale-105 ${mine ? "bg-black text-white" : "bg-white text-black"}`}>
        {on ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div role="slider" tabIndex={0} aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)}
          className="flex h-9 cursor-pointer items-center gap-[2px]"
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width); }}
          onKeyDown={(e) => { if (e.key === "ArrowRight") seek(pct + 0.05); if (e.key === "ArrowLeft") seek(pct - 0.05); }}>
          {d.peaks.map((p, i) => (
            <i key={i} className="block flex-1 rounded-full" style={{ height: 5 + p * 28, background: mine ? "#000" : "#fff", opacity: i / d.peaks.length <= pct ? 1 : 0.28 }} />
          ))}
        </div>
        <div className={`mt-0.5 flex justify-between text-[11px] tabular-nums ${mine ? "text-black/55" : "text-white/50"}`}>
          <span>{fmt(on || t ? t : dur)}</span>
          <button onClick={cycle} aria-label={`Playback speed ${rate}x`} className="font-semibold tracking-wide">{rate}×</button>
        </div>
      </div>
    </div>
  );
}
