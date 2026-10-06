// Fills a dev server with friends, posts, stories, a voice note, games: node tests/seed.mjs [baseUrl]
// Log in afterwards as  ekta / blackout-test-1
import zlib from "node:zlib";
const BASE = process.argv[2] ?? "http://localhost:3100";

class Client {
  cookie = "";
  async call(method, path, body) {
    const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie: this.cookie }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get("set-cookie"); if (set) this.cookie = set.split(";")[0];
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }
}

/* tiny PNG encoder so we can post real images without dependencies */
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
function png(w, h, px) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = px(x, y); const o = y * (w * 3 + 1) + 1 + x * 3; raw[o - (x ? 0 : 1)] = x ? raw[o - (x ? 0 : 1)] : 0; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return "data:image/png;base64," + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}
const mono = (v) => [v, v, v];
const dunes = png(640, 400, (x, y) => { const f = Math.sin(x / 70 + Math.sin(y / 55) * 1.6) * 0.5 + 0.5; const fall = 1 - y / 400; return mono(Math.min(255, Math.floor(18 + f * 150 * fall + (y > 300 ? 30 : 0)))); });
const orb = png(640, 640, (x, y) => { const dx = x - 320, dy = y - 320, d = Math.hypot(dx, dy); const lit = Math.max(0, 1 - Math.hypot(dx + 90, dy + 110) / 330); return mono(d < 220 ? Math.floor(20 + 235 * lit ** 1.6) : Math.floor(Math.max(0, 40 - d / 14))); });

/* a real, playable 3-second WAV so the voice player can be exercised */
function wav() {
  const rate = 8000, n = rate * 3, d = Buffer.alloc(n);
  for (let i = 0; i < n; i++) d[i] = 128 + Math.round(60 * Math.sin(i / 9) * (0.5 + 0.5 * Math.sin(i / 900)));
  const h = Buffer.alloc(44); h.write("RIFF"); h.writeUInt32LE(36 + n, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate, 28); h.writeUInt16LE(1, 32); h.writeUInt16LE(8, 34); h.write("data", 36); h.writeUInt32LE(n, 40);
  return "data:audio/wav;base64," + Buffer.concat([h, d]).toString("base64");
}
const peaks = Array.from({ length: 48 }, (_, i) => Math.round((0.15 + 0.85 * Math.abs(Math.sin(i / 4) * Math.sin(i / 11 + 1))) * 100) / 100);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const make = async (u, name, bio = "") => {
  const c = new Client();
  let r = await c.call("POST", "/api/auth/signup", { username: u, displayName: name, password: "blackout-test-1" });
  if (r.status === 409) r = await c.call("POST", "/api/auth/login", { username: u, password: "blackout-test-1" });
  c.id = r.body.user.id;
  if (bio) await c.call("PATCH", "/api/me", { bio });
  return c;
};

const ekta = await make("ekta", "Ekta", "Building in the dark.");
const mika = await make("mika", "Mika", "Night owl. Chess, ramen, bad puns.");
const zane = await make("zane", "Zane", "Photographer.");
const luna = await make("luna", "Luna", "Here for the games.");
const befriend = async (a, b) => { const r = await a.call("POST", "/api/invites"); return (await b.call("POST", "/api/invites/redeem", { code: r.body.code })).body.conversation?.id; };
const dmMika = await befriend(ekta, mika);
const dmZane = await befriend(ekta, zane);
const dmLuna = await befriend(ekta, luna);
await ekta.call("POST", "/api/invites"); // one pending invite to show in Friends → Invites
for (const c of [mika, zane, luna]) { const dead = await ekta.call("POST", "/api/invites"); void dead; }

const say = (who, conv, body) => who.call("POST", `/api/conversations/${conv}/messages`, body);
await say(mika, dmMika, { body: "you made it. welcome to the dark side 🖤" });
await say(ekta, dmMika, { body: "this place looks insane" });
await say(mika, dmMika, { voice: { audio: wav(), duration: 3, peaks } });
await say(mika, dmMika, { body: "/roll d20" });
await say(mika, dmMika, { body: "/c4" });
const rps = (await say(mika, dmMika, { body: "/rps" })).body.message.id;
await mika.call("POST", `/api/messages/${rps}/act`, { pick: "r" });
await say(mika, dmMika, { body: "/poll Where to next? | Tokyo | Lisbon | Reykjavik" });
await say(mika, dmMika, { body: "/truth" });
await say(zane, dmZane, { body: "sent you the shots from last night" });
await say(zane, dmZane, { image: dunes });
await say(luna, dmLuna, { body: "/ttt" });
await say(luna, dmLuna, { body: "your move 😏" });

await zane.call("POST", "/api/posts", { kind: "post", body: "Golden hour doesn't exist at night, so I made my own.", image: dunes });
await mika.call("POST", "/api/posts", { kind: "post", body: "Hot take: the best conversations happen after midnight. Everything else is small talk." });
const lunaPost = (await luna.call("POST", "/api/posts", { kind: "post", body: "New obsession.", image: orb })).body.post;
await ekta.call("POST", "/api/posts", { kind: "post", body: "Shipping something I'm really proud of. More soon." });
await mika.call("POST", `/api/posts/${lunaPost.id}/like`);
await zane.call("POST", `/api/posts/${lunaPost.id}/like`);
await zane.call("POST", `/api/posts/${lunaPost.id}/comments`, { body: "That lighting. Unreal." });
await mika.call("POST", `/api/posts/${lunaPost.id}/comments`, { body: "ok I need to know how you did this" });
await mika.call("POST", "/api/posts", { kind: "story", body: "3am and still awake.", tone: 1 });
await mika.call("POST", "/api/posts", { kind: "story", body: "Coffee count: 4", tone: 0 });
await zane.call("POST", "/api/posts", { kind: "story", body: "", image: dunes });
await luna.call("POST", "/api/posts", { kind: "story", body: "Say less.", tone: 2 });
console.log("seeded — log in as ekta / blackout-test-1");
await sleep(100);
