import type { Prefs } from "../prefs";

let ctx: AudioContext | null = null;
let enabled = true;
let pack: Prefs["soundPack"] = "chime";

/** Called by the store whenever preferences change. */
export function configureSound(p: Pick<Prefs, "sounds" | "soundPack">) {
  enabled = p.sounds && p.soundPack !== "silent";
  pack = p.soundPack;
}

function tone(freq: number, dur: number, at = 0, type: OscillatorType = "sine", vol = 0.06) {
  if (!enabled) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime + at;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* autoplay blocked */ }
}

/** Incoming-message sound per pack. */
const receive: Record<Prefs["soundPack"], () => void> = {
  chime: () => { tone(660, 0.12); tone(990, 0.16, 0.07); },
  pop: () => tone(520, 0.07, 0, "triangle", 0.07),
  bell: () => { tone(880, 0.5, 0, "sine", 0.05); tone(1320, 0.4, 0.02, "sine", 0.03); },
  silent: () => {},
};

export const sfx = {
  receive: () => receive[pack](),
  send: () => tone(520, 0.08, 0, "triangle", 0.04),
  connect: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, i * 0.09, "sine", 0.07)),
  pop: () => tone(880, 0.05, 0, "sine", 0.03),
};

/** Lets Settings preview a pack. */
export const previewPack = (p: Prefs["soundPack"]) => receive[p]();
