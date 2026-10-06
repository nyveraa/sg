// End-to-end backend check against a running dev server: node tests/smoke.mjs [baseUrl]
const BASE = process.argv[2] ?? "http://localhost:3100";
let failed = 0;
const ok = (cond, name, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`);
  if (!cond) failed++;
};

class Client {
  cookie = "";
  async call(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: { "content-type": "application/json", cookie: this.cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }
}

const tag = Math.random().toString(36).slice(2, 7);
const a = new Client(), b = new Client(), c = new Client();

// signup + validation
let r = await a.call("POST", "/api/auth/signup", { username: `ana_${tag}`, displayName: "Ana", password: "supersecret1" });
ok(r.status === 200 && r.body.user?.username === `ana_${tag}`, "signup A", JSON.stringify(r));
r = await a.call("POST", "/api/auth/signup", { username: `ana_${tag}`, displayName: "x", password: "supersecret1" });
ok(r.status === 409, "duplicate username rejected", JSON.stringify(r));
r = await new Client().call("POST", "/api/auth/signup", { username: "ab", displayName: "x", password: "supersecret1" });
ok(r.status === 400, "bad username rejected");
await b.call("POST", "/api/auth/signup", { username: `bo_${tag}`, displayName: "Bo", password: "supersecret1" });
await c.call("POST", "/api/auth/signup", { username: `cy_${tag}`, displayName: "Cy", password: "supersecret1" });
r = await new Client().call("GET", "/api/bootstrap");
ok(r.status === 401, "bootstrap requires auth");
r = await new Client().call("POST", "/api/auth/login", { username: `ana_${tag}`, password: "wrong-password" });
ok(r.status === 401, "wrong password rejected");

// SSE for B
const events = [];
const ac = new AbortController();
fetch(BASE + "/api/stream", { headers: { cookie: b.cookie }, signal: ac.signal }).then(async (res) => {
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value);
    let i; while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      if (chunk.startsWith("data: ")) events.push(JSON.parse(chunk.slice(6)));
    }
  }
}).catch(() => {});
await new Promise((res) => setTimeout(res, 400));

// invites
r = await a.call("POST", "/api/invites");
const code = r.body.code;
ok(/^[A-Z2-9]{8}$/.test(code ?? ""), "invite minted", JSON.stringify(r));
r = await a.call("GET", `/api/invites/${code}`);
ok(r.body.valid === true && r.body.inviter?.displayName === "Ana", "invite peek shows inviter", JSON.stringify(r));
r = await a.call("POST", "/api/invites/redeem", { code });
ok(r.status === 400, "cannot redeem own code", JSON.stringify(r));
r = await b.call("POST", "/api/invites/redeem", { code: "ZZZZZZZZ" });
ok(r.status === 404, "unknown code rejected");
r = await b.call("POST", "/api/invites/redeem", { code: `${code.slice(0, 4)}-${code.slice(4).toLowerCase()}` });
ok(r.status === 200 && r.body.conversation?.kind === "dm", "redeem (dashes+lowercase ok) → DM", JSON.stringify(r));
const dm = r.body.conversation.id;
r = await c.call("POST", "/api/invites/redeem", { code });
ok(r.status === 410, "code is single-use", JSON.stringify(r));
await new Promise((res) => setTimeout(res, 300));
ok(events.some((e) => e.type === "conversation" && e.celebrate), "B got live conversation event with celebrate");

// friendship is mutual
r = await a.call("GET", "/api/bootstrap");
ok(r.body.conversations.length === 1 && r.body.users.some((u) => u.username === `bo_${tag}`), "A sees B as a friend");
r = await a.call("POST", "/api/invites");
r = await b.call("POST", "/api/invites/redeem", { code: r.body.code });
ok(r.status === 409, "already friends → 409");

// messaging
r = await a.call("POST", `/api/conversations/${dm}/messages`, { body: "hello bo" });
ok(r.status === 200 && r.body.message.kind === "text", "send text");
const m1 = r.body.message.id;
await new Promise((res) => setTimeout(res, 200));
ok(events.some((e) => e.type === "message" && e.message.id === m1), "B received message live (SSE)");
r = await c.call("POST", `/api/conversations/${dm}/messages`, { body: "intruder" });
ok(r.status === 404, "non-member cannot post");
r = await c.call("GET", `/api/conversations/${dm}/messages`);
ok(r.status === 404, "non-member cannot read");

// commands
r = await a.call("POST", `/api/conversations/${dm}/messages`, { body: "/roll d20" });
ok(r.body.message.kind === "roll" && r.body.message.data.result >= 1 && r.body.message.data.result <= 20, "/roll d20");
r = await a.call("POST", `/api/conversations/${dm}/messages`, { body: "/flip" });
ok(["heads", "tails"].includes(r.body.message.data.result), "/flip");
r = await a.call("POST", `/api/conversations/${dm}/messages`, { body: "/8ball will this work?" });
ok(r.body.message.kind === "ball" && r.body.message.data.answer, "/8ball");
r = await a.call("POST", `/api/conversations/${dm}/messages`, { body: "/poll Pizza? | yes | no" });
ok(r.body.message.kind === "poll", "/poll");
const poll = r.body.message.id;
r = await b.call("POST", `/api/messages/${poll}/act`, { option: 0 });
ok(r.body.message.data.options[0].votes.length === 1, "vote");
r = await b.call("POST", `/api/messages/${poll}/act`, { option: 1 });
ok(r.body.message.data.options[0].votes.length === 0 && r.body.message.data.options[1].votes.length === 1, "revote moves vote");
r = await a.call("POST", `/api/conversations/${dm}/messages`, { body: "/poll lonely" });
ok(r.status === 400, "bad poll rejected");
r = await a.call("POST", `/api/conversations/${dm}/messages`, { body: "/confetti" });
ok(r.body.message.kind === "effect" && r.body.message.data.effect === "confetti", "/confetti effect");

// tic-tac-toe: A=X, B=O
r = await a.call("POST", `/api/conversations/${dm}/messages`, { body: "/ttt" });
const ttt = r.body.message.id;
r = await b.call("POST", `/api/messages/${ttt}/act`, { cell: 0 });
ok(r.status === 403, "O cannot move first");
for (const [who, cell] of [[a, 0], [b, 3], [a, 1], [b, 4], [a, 2]]) r = await who.call("POST", `/api/messages/${ttt}/act`, { cell });
ok(r.body.message.data.winner === "X" && r.body.message.data.line.join() === "0,1,2", "X wins top row", JSON.stringify(r.body));
r = await b.call("POST", `/api/messages/${ttt}/act`, { cell: 5 });
ok(r.status === 409, "no moves after game over");

// reactions / edit / delete / reply
r = await b.call("POST", `/api/messages/${m1}/react`, { emoji: "🔥" });
ok(r.body.message.reactions[0]?.userIds.length === 1, "react");
r = await b.call("POST", `/api/messages/${m1}/react`, { emoji: "🔥" });
ok(r.body.message.reactions.length === 0, "react toggles off");
r = await b.call("PATCH", `/api/messages/${m1}`, { body: "hax" });
ok(r.status === 403, "cannot edit others' messages");
r = await a.call("PATCH", `/api/messages/${m1}`, { body: "hello bo!!" });
ok(r.body.message.body === "hello bo!!" && r.body.message.editedAt, "edit own");
r = await b.call("POST", `/api/conversations/${dm}/messages`, { body: "replying", replyTo: m1 });
ok(r.body.message.replyTo?.id === m1, "reply");
r = await a.call("POST", `/api/conversations/${dm}/messages`, { image: "data:text/html;base64,PHNjcmlwdD4=" });
ok(r.status === 400, "non-image data URL rejected");
r = await a.call("POST", `/api/conversations/${dm}/messages`, { image: "data:image/png;base64,iVBORw0KGgo=" });
ok(r.body.message?.kind === "image", "image accepted");
r = await a.call("DELETE", `/api/messages/${m1}`);
ok(r.body.message.deleted && r.body.message.body === "", "soft delete clears body");

// read receipts + unread
r = await b.call("GET", "/api/bootstrap");
ok(r.body.conversations[0].unread > 0, "B has unread");
await b.call("POST", `/api/conversations/${dm}/read`);
r = await b.call("GET", "/api/bootstrap");
ok(r.body.conversations[0].unread === 0, "read clears unread");
ok(events.some((e) => e.type === "read" && e.convId === dm), "read receipt broadcast");

// groups
r = await a.call("POST", "/api/conversations", { title: "crew", memberIds: [] });
ok(r.status === 400, "group needs members");
await c.call("POST", "/api/auth/login", { username: `cy_${tag}`, password: "supersecret1" });
r = await a.call("POST", "/api/invites"); await c.call("POST", "/api/invites/redeem", { code: r.body.code });
r = await a.call("POST", "/api/conversations", { title: "crew", memberIds: [(await a.call("GET", "/api/bootstrap")).body.users.find((u) => u.username === `bo_${tag}`).id, (await a.call("GET", "/api/bootstrap")).body.users.find((u) => u.username === `cy_${tag}`).id] });
ok(r.status === 200 && r.body.conversation.memberIds.length === 3, "group created", JSON.stringify(r));

// profile + presence
r = await a.call("PATCH", "/api/me", { displayName: "Ana K", hue: 40, bio: "hi" });
ok(r.body.user.hue === 40, "profile update");
ac.abort();
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
