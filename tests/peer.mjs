// A scripted second user for eyeballing realtime in the UI: node tests/peer.mjs CODE [username]
const BASE = "http://localhost:3100";
const [code, uname = "mika"] = process.argv.slice(2);
let cookie = "";
const call = async (method, path, body) => {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.get("set-cookie"); if (set) cookie = set.split(";")[0];
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let r = await call("POST", "/api/auth/signup", { username: uname, displayName: "Mika", password: "peer-password-1" });
if (r.status === 409) r = await call("POST", "/api/auth/login", { username: uname, password: "peer-password-1" });
console.log("auth", r.status);
fetch(BASE + "/api/stream", { headers: { cookie } }).then(async (res) => { for await (const _ of res.body); }).catch(() => {}); // stay "online"
await sleep(500);
r = await call("POST", "/api/invites/redeem", { code });
console.log("redeem", r.status, r.body.error ?? "ok");
const conv = r.body.conversation?.id;
if (!conv) process.exit(1);
await sleep(5000); // let the celebration play
const say = async (body, wait = 1500) => { await call("POST", `/api/conversations/${conv}/messages`, { body }); await sleep(wait); };
await call("POST", `/api/conversations/${conv}/typing`); await sleep(2200);
await say("hey!! you made it 🖤");
await say("this place is so dark, I love it", 1200);
await say("/roll d20");
await say("/flip");
await say("/8ball are we going to win at tic tac toe?", 2500);
await say("/poll What should we do tonight? | Movie | Game night | Sleep");
await say("/ttt", 1200);
await say("🔥🔥🔥", 1200);
await say("/confetti");
console.log("peer script done; staying online for 10 minutes");
await sleep(600_000);
