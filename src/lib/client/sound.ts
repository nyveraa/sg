let ctx: AudioContext | null = null;
let muted = false;
try { muted = localStorage.getItem("onyx:muted") === "1"; } catch { /* storage blocked */ }

export const isMuted = () => muted;
export function setMuted(v: boolean) {
  muted = v;
  try { localStorage.setItem("onyx:muted", v ? "1" : "0"); } catch { /* storage blocked */ }
}

function tone(freq: number, dur: number, at = 0, type: OscillatorType = "sine", vol = 0.06) {
  if (muted) return;
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

export const sfx = {
  receive: () => { tone(660, 0.12); tone(990, 0.16, 0.07); },
  send: () => tone(520, 0.08, 0, "triangle", 0.04),
  connect: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, i * 0.09, "sine", 0.07)),
  pop: () => tone(880, 0.05, 0, "sine", 0.03),
};
