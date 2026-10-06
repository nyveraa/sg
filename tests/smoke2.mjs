// Backend checks for voice, games, posts/stories, friends & invite management: node tests/smoke2.mjs [baseUrl]
const BASE = process.argv[2] ?? "http://localhost:3100";
let failed = 0;
const ok = (cond, name, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`);
  if (!cond) failed++;
};
class Client {
  cookie = "";
  async call(method, path, body) {
    const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie: this.cookie }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get("set-cookie"); if (set) this.cookie = set.split(";")[0];
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }
}
const tag = Math.random().toString(36).slice(2, 7);
const mk = async (n) => { const c = new Client(); const r = await c.call("POST", "/api/auth/signup", { username: `${n}_${tag}`, displayName: n, password: "supersecret1" }); c.id = r.body.user.id; return c; };
const [a, b, c] = [await mk("ann"), await mk("bea"), await mk("cam")];
let r = await a.call("POST", "/api/invites"); const code = r.body.code;
r = await b.call("POST", "/api/invites/redeem", { code }); const dm = r.body.conversation.id;
const send = (who, body) => who.call("POST", `/api/conversations/${dm}/messages`, body);

// voice
const audio = "data:audio/webm;codecs=opus;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAHTEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBJUqWZTrIHfTbuMU6uEFlSua1OsggEwTbuMU6uEHFO7a1OsggHm7AEAAAAAAABZ";
r = await send(a, { voice: { audio, duration: 4.2, peaks: [0.1, 0.5, 0.9, 0.3] } });
ok(r.status === 200 && r.body.message.kind === "voice" && r.body.message.data.duration === 4.2, "voice message accepted", JSON.stringify(r.body).slice(0, 200));
r = await send(a, { voice: { audio: "data:text/html;base64,AAAA", duration: 3, peaks: [0.1] } });
ok(r.status === 400, "non-audio voice rejected");
r = await send(a, { voice: { audio, duration: 999, peaks: [0.1] } });
ok(r.status === 400, "over-long voice rejected");
r = await send(a, { voice: { audio, duration: 3, peaks: [2] } });
ok(r.status === 400, "bad waveform rejected");

// rock paper scissors: picks stay secret
r = await send(a, { body: "/rps" }); const rps = r.body.message.id;
ok(r.body.message.kind === "rps" && r.body.message.data.result === null, "/rps created");
r = await a.call("POST", `/api/messages/${rps}/act`, { pick: "r" });
ok(r.body.message.data.picked.length === 1 && !JSON.stringify(r.body.message).includes('"picks"'), "pick locked, value hidden", JSON.stringify(r.body));
r = await a.call("POST", `/api/messages/${rps}/act`, { pick: "p" });
ok(r.status === 409, "cannot pick twice");
r = await a.call("GET", `/api/conversations/${dm}/messages`);
ok(!JSON.stringify(r.body).includes('"secret"') && r.body.messages.find((m) => m.id === rps).data.result === null, "history never leaks secret picks");
r = await b.call("POST", `/api/messages/${rps}/act`, { pick: "p" });
ok(r.body.message.data.result?.winner === b.id, "paper beats rock → bea wins", JSON.stringify(r.body));
r = await c.call("POST", `/api/messages/${rps}/act`, { pick: "s" });
ok(r.status === 404, "outsider cannot play");

// connect four
r = await send(a, { body: "/c4" }); const c4 = r.body.message.id;
r = await b.call("POST", `/api/messages/${c4}/act`, { col: 0 });
ok(r.status === 403, "O cannot open Connect Four");
for (const [who, col] of [[a, 0], [b, 1], [a, 0], [b, 1], [a, 0], [b, 1]]) r = await who.call("POST", `/api/messages/${c4}/act`, { col });
ok(r.body.message.data.board[35] === "X" && r.body.message.data.board[28] === "X" && r.body.message.data.winner === null, "pieces stack with gravity");
r = await a.call("POST", `/api/messages/${c4}/act`, { col: 0 });
ok(r.body.message.data.winner === "X" && r.body.message.data.line.length === 4, "vertical four wins", JSON.stringify(r.body.message?.data));
r = await b.call("POST", `/api/messages/${c4}/act`, { col: 3 });
ok(r.status === 409, "no moves after Connect Four ends");
r = await send(a, { body: "/c4" }); const c4b = r.body.message.id;
r = await a.call("POST", `/api/messages/${c4b}/act`, { col: 9 });
ok(r.status === 400, "invalid column rejected");

// prompts & new effects
r = await send(a, { body: "/truth" });
ok(r.body.message.kind === "prompt" && r.body.message.data.type === "truth" && r.body.message.data.text, "/truth");
r = await send(a, { body: "/dare" });
ok(r.body.message.data.type === "dare", "/dare");
r = await send(a, { body: "/snow" });
ok(r.body.message.kind === "effect" && r.body.message.data.effect === "snow", "/snow effect");

// posts & stories
r = await a.call("POST", "/api/posts", { kind: "post", body: "first light" });
const post = r.body.post;
ok(r.status === 200 && post.likes.length === 0, "create post", JSON.stringify(r));
r = await a.call("POST", "/api/posts", { kind: "post", body: "" });
ok(r.status === 400, "empty post rejected");
r = await a.call("POST", "/api/posts", { kind: "post", body: "x", image: "data:text/html;base64,AAAA" });
ok(r.status === 400, "non-image post attachment rejected");
r = await a.call("POST", "/api/posts", { kind: "story", body: "story time", tone: 3 });
const story = r.body.post;
ok(story.kind === "story" && story.tone === 3, "create story");
r = await b.call("GET", "/api/feed");
ok(r.body.posts.some((p) => p.id === post.id) && r.body.stories.some((s) => s.id === story.id), "friend sees posts and stories");
r = await c.call("GET", "/api/feed");
ok(!r.body.posts.some((p) => p.id === post.id) && !r.body.stories.some((s) => s.id === story.id), "non-friend does not");
r = await c.call("POST", `/api/posts/${post.id}/like`);
ok(r.status === 404, "non-friend cannot like");
r = await c.call("POST", `/api/posts/${post.id}/comments`, { body: "hi" });
ok(r.status === 404, "non-friend cannot comment");
r = await b.call("POST", `/api/posts/${post.id}/like`);
ok(r.body.post.likes.length === 1, "like");
r = await b.call("POST", `/api/posts/${post.id}/like`);
ok(r.body.post.likes.length === 0, "like toggles off");
r = await b.call("POST", `/api/posts/${post.id}/comments`, { body: "gorgeous" });
ok(r.status === 200 && r.body.comment.body === "gorgeous", "comment");
r = await a.call("GET", `/api/posts/${post.id}/comments`);
ok(r.body.comments.length === 1, "author reads comments");
r = await b.call("GET", "/api/feed");
ok(r.body.posts.find((p) => p.id === post.id).commentCount === 1, "comment count in feed");
r = await b.call("DELETE", `/api/posts/${post.id}`);
ok(r.status === 403, "cannot delete others' posts");
r = await a.call("DELETE", `/api/posts/${post.id}`);
ok(r.status === 200, "author deletes post");
r = await b.call("GET", "/api/feed");
ok(!r.body.posts.some((p) => p.id === post.id), "deleted post gone");

// invites management
r = await a.call("POST", "/api/invites"); const spare = r.body.code;
r = await a.call("GET", "/api/invites");
ok(r.body.invites.some((i) => i.code === code && i.status === "used" && i.usedBy?.username === `bea_${tag}`) && r.body.invites.some((i) => i.code === spare && i.status === "pending"), "invite list shows used + pending");
r = await b.call("DELETE", `/api/invites/${spare}`);
ok(r.status === 404, "cannot revoke someone else's invite");
r = await a.call("DELETE", `/api/invites/${spare}`);
ok(r.status === 200, "revoke own pending invite");
r = await c.call("POST", "/api/invites/redeem", { code: spare });
ok(r.status === 404, "revoked code is dead");

// friends management
r = await a.call("GET", "/api/friends");
ok(r.body.friends.length === 1 && r.body.friends[0].user.username === `bea_${tag}` && r.body.friends[0].convId === dm, "friends list");
r = await c.call("DELETE", `/api/friends/${a.id}`);
ok(r.status === 404, "cannot unfriend a non-friend");
r = await a.call("DELETE", `/api/friends/${b.id}`);
ok(r.status === 200, "unfriend");
r = await a.call("GET", "/api/friends");
ok(r.body.friends.length === 0, "friend gone for A");
r = await b.call("GET", "/api/bootstrap");
ok(r.body.conversations.length === 0, "DM removed for B too");
r = await b.call("GET", "/api/feed");
ok(!r.body.stories.some((s) => s.id === story.id), "ex-friend no longer sees stories");
r = await a.call("POST", "/api/invites"); r = await b.call("POST", "/api/invites/redeem", { code: r.body.code });
ok(r.status === 200, "can reconnect with a fresh invite");

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
