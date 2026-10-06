"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, RotateCcw, Send, Trash2 } from "lucide-react";
import { Modal } from "./Modal";
import { Spinner } from "./Loader";

const W = 760, H = 460;
const INKS = ["#ffffff", "#a8a8b0", "#ff7a7a", "#ffc46b", "#7ee0a1", "#7fb4ff"];
const SIZES = [3, 7, 14];

/** Draw on black, send as a picture. Pointer events cover mouse, pen and touch. */
export function SketchPad({ open, onClose, onSend }: { open: boolean; onClose: () => void; onSend: (jpeg: string) => Promise<boolean> }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<[number, number] | null>(null);
  const history = useRef<ImageData[]>([]);
  const [ink, setInk] = useState(INKS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [erase, setErase] = useState(false);
  const [busy, setBusy] = useState(false);

  const clear = () => {
    const c = cv.current?.getContext("2d");
    if (!c) return;
    c.fillStyle = "#050506"; c.fillRect(0, 0, W, H);
  };
  useEffect(() => { if (open) { requestAnimationFrame(() => { clear(); history.current = []; }); setErase(false); } }, [open]);

  const pos = (e: React.PointerEvent): [number, number] => {
    const r = cv.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const stroke = (from: [number, number], to: [number, number]) => {
    const c = cv.current!.getContext("2d")!;
    c.strokeStyle = erase ? "#050506" : ink; c.lineWidth = erase ? size * 2.2 : size; c.lineCap = "round"; c.lineJoin = "round";
    c.beginPath(); c.moveTo(...from); c.lineTo(...to); c.stroke();
  };
  const down = (e: React.PointerEvent) => {
    const c = cv.current!;
    c.setPointerCapture(e.pointerId);
    history.current = [...history.current.slice(-19), c.getContext("2d")!.getImageData(0, 0, W, H)];
    drawing.current = true; last.current = pos(e);
    stroke(last.current, [last.current[0] + 0.01, last.current[1]]); // a tap leaves a dot
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const p = pos(e); stroke(last.current, p); last.current = p;
  };
  const up = () => { drawing.current = false; last.current = null; };
  const undo = () => { const prev = history.current.pop(); if (prev) cv.current!.getContext("2d")!.putImageData(prev, 0, 0); };

  async function send() {
    setBusy(true);
    let url = "";
    for (const q of [0.88, 0.7, 0.5]) { url = cv.current!.toDataURL("image/jpeg", q); if (url.length < 900_000) break; }
    const ok = await onSend(url);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Sketch" eyebrow="Draw it, send it" width={820}>
      <canvas ref={cv} width={W} height={H} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        aria-label="Drawing canvas" className="w-full touch-none rounded-2xl border border-white/12 bg-[#050506]" style={{ cursor: "crosshair", aspectRatio: `${W} / ${H}` }} />
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex items-center gap-2" role="radiogroup" aria-label="Ink colour">
          {INKS.map((c) => (
            <button key={c} role="radio" aria-checked={ink === c && !erase} aria-label={`Ink ${c}`} onClick={() => { setInk(c); setErase(false); }}
              className={`h-7 w-7 rounded-full transition ${ink === c && !erase ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-black" : "ring-1 ring-white/20"}`} style={{ background: c }} />
          ))}
        </div>
        <div className="flex items-center gap-3" role="radiogroup" aria-label="Brush size">
          {SIZES.map((s) => (
            <button key={s} role="radio" aria-checked={size === s} aria-label={`Brush ${s}px`} onClick={() => setSize(s)}
              className={`grid h-9 w-9 place-items-center rounded-full border transition ${size === s ? "border-white" : "border-white/15"}`}>
              <i className="block rounded-full bg-white" style={{ width: s + 2, height: s + 2 }} />
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setErase((v) => !v)} aria-pressed={erase} aria-label="Eraser" className={`grid h-10 w-10 place-items-center rounded-full border transition ${erase ? "border-white bg-white text-black" : "border-white/15 text-mute hover:text-white"}`}><Eraser size={16} /></button>
          <button onClick={undo} aria-label="Undo" className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-mute transition hover:text-white"><RotateCcw size={16} /></button>
          <button onClick={() => { history.current = []; clear(); }} aria-label="Clear" className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-mute transition hover:text-white"><Trash2 size={16} /></button>
          <button onClick={send} disabled={busy} className="btn ml-2">{busy ? <Spinner /> : <><Send size={15} /> Send</>}</button>
        </div>
      </div>
    </Modal>
  );
}
