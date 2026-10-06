// Backend checks for privacy, presence, preferences, profile photo, pin/mute/archive, groups, nicknames, story viewers,
// /spin /wyr, streaks, password change, export and account deletion: node tests/smoke3.mjs [baseUrl]
const BASE = process.argv[2] ?? "http://localhost:3100";
let failed = 0;
const ok = (cond, name, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`); if (!cond) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Client {
  cookie = "";
  async call(method, path, body) {
    const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie: this.cookie }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get("set-cookie"); if (set) this.cookie = set.split(";")[0];
    const text = await res.text();
    let json = {}; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, body: json, text, headers: res.headers };
  }
  /** Opens the live stream; returns { events, close }. */
  stream() {
    const events = []; const ac = new AbortController();
    fetch(BASE + "/api/stream", { headers: { cookie: this.cookie }, signal: ac.signal }).then(async (res) => {
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value);
        let i; while ((i = buf.indexOf("\n\n")) >= 0) { const c = buf.slice(0, i); buf = buf.slice(i + 2); if (c.startsWith("data: ")) events.push(JSON.parse(c.slice(6))); } }
    }).catch(() => {});
    return { events, close: () => ac.abort() };
  }
}
const tag = Math.random().toString(36).slice(2, 7);
const mk = async (n) => { const c = new Client(); const r = await c.call("POST", "/api/auth/signup", { username: `${n}_${tag}`, displayName: n, password: "supersecret1" }); c.id = r.body.user.id; c.name = `${n}_${tag}`; return c; };
const befriend = async (a, b) => { const r = await a.call("POST", "/api/invites"); return (await b.call("POST", "/api/invites/redeem", { code: r.body.code })).body.conversation.id; };
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const [a, b, c, d] = [await mk("ann"), await mk("bea"), await mk("cam"), await mk("dee")];
const dmAB = await befriend(a, b);
const dmAC = await befriend(a, c);
const me = (cl) => cl.call("GET", "/api/bootstrap").then((r) => r.body);
const conv = async (cl, id) => (await me(cl)).conversations.find((x) => x.id === id);

/* ── preferences ── */
let r = await a.call("PATCH", "/api/me", { prefs: { typingIndicator: true, accent: "neon", bogus: 1, wallpaper: "grid" } });
ok(r.body.me.prefs.accent === "pearl" && r.body.me.prefs.wallpaper === "grid" && !("bogus" in r.body.me.prefs), "preferences are validated (bad values ignored, unknown keys dropped)", JSON.stringify(r.body.me?.prefs));
r = await a.call("GET", "/api/bootstrap");
ok(r.body.me.prefs.readReceipts === true && r.body.me.prefs.wallpaper === "grid", "preferences persist and come back in bootstrap");

/* ── read receipts are mutual ── */
await a.call("POST", `/api/conversations/${dmAB}/messages`, { body: "hello" });
const sa = a.stream(); const sb = b.stream(); await sleep(400);
await b.call("POST", `/api/conversations/${dmAB}/read`);
await sleep(300);
ok(sa.events.some((e) => e.type === "read" && e.userId === b.id), "receipts on: sender sees the reader's read event");
ok((await conv(a, dmAB)).reads[b.id] > 0, "receipts on: reads map shows the reader");
await b.call("PATCH", "/api/me", { prefs: { readReceipts: false } });
await sleep(300);
ok((await conv(a, dmAB)).reads[b.id] === 0, "receipts off (reader): sender's view of their reads is blanked");
const ev0 = sa.events.length;
await a.call("POST", `/api/conversations/${dmAB}/messages`, { body: "second" });
await b.call("POST", `/api/conversations/${dmAB}/read`);
await sleep(300);
ok(!sa.events.slice(ev0).some((e) => e.type === "read" && e.userId === b.id), "receipts off: no read event is sent to the other person");
const bView = await conv(b, dmAB);
ok(bView.reads[a.id] === 0 && bView.reads[b.id] > 0, "receipts off is mutual: reader doesn't see the sender's reads either, but keeps their own");
ok(bView.unread === 0, "…while their own unread count still clears");
await b.call("PATCH", "/api/me", { prefs: { readReceipts: true } });

/* ── typing indicator privacy ── */
await a.call("PATCH", "/api/me", { prefs: { typingIndicator: false } });
const ev1 = sb.events.length;
await a.call("POST", `/api/conversations/${dmAB}/typing`); await sleep(300);
ok(!sb.events.slice(ev1).some((e) => e.type === "typing"), "typing indicator off: nothing is broadcast");
await a.call("PATCH", "/api/me", { prefs: { typingIndicator: true } });
await a.call("POST", `/api/conversations/${dmAB}/typing`); await sleep(300);
ok(sb.events.some((e) => e.type === "typing" && e.userId === a.id), "typing indicator on: it is");

/* ── presence + last active ── */
const seenBy = async (viewer, id) => (await me(viewer)).users.find((u) => u.id === id);
ok((await seenBy(a, b.id)).online === true, "online friends show as online");
await b.call("PATCH", "/api/me", { prefs: { showOnline: false } });
let u = await seenBy(a, b.id);
ok(u.online === false && u.lastSeen === null, "hide online: appears offline with no last-seen leak while actually online", JSON.stringify(u));
await b.call("PATCH", "/api/me", { prefs: { showOnline: true, showLastSeen: false } });
u = await seenBy(a, b.id);
ok(u.online === true && u.lastSeen === null, "hide last seen: still shows online, but no timestamp");
await b.call("PATCH", "/api/me", { prefs: { showLastSeen: true } });
sb.close(); await sleep(600);
u = await seenBy(a, b.id);
ok(u.online === false && typeof u.lastSeen === "number" && Date.now() - u.lastSeen < 10_000, "going offline records a fresh last-active time", JSON.stringify(u));
const bSelf = (await me(b)).me;
ok(typeof bSelf.lastSeen === "number", "you can always see your own last-active");

/* ── profile: photo, status, pronouns ── */
r = await a.call("PATCH", "/api/me", { avatar: png, status: "x".repeat(100), pronouns: "she/her" });
ok(r.body.me.avatar === png && r.body.me.status.length === 60 && r.body.me.pronouns === "she/her", "profile photo, status (trimmed to 60) and pronouns save");
ok((await seenBy(b, a.id)).avatar === png, "friends receive the photo");
r = await a.call("PATCH", "/api/me", { avatar: "data:text/html;base64,PHNjcmlwdD4=" });
ok(r.status === 400, "non-image photo rejected");
r = await a.call("PATCH", "/api/me", { avatar: "data:image/png;base64," + "A".repeat(160_000) });
ok(r.status === 400, "oversized photo rejected");
r = await a.call("PATCH", "/api/me", { avatar: null });
ok(r.body.me.avatar === null, "photo can be removed");

/* ── pin / mute / archive are personal ── */
r = await a.call("POST", `/api/conversations/${dmAB}/prefs`, { pinned: true, muted: true });
ok(r.body.conversation.pinned && r.body.conversation.muted, "pin + mute apply");
ok(!(await conv(b, dmAB)).pinned && !(await conv(b, dmAB)).muted, "…and only for you");
await a.call("POST", `/api/conversations/${dmAB}/prefs`, { muted: false, archived: true });
ok((await conv(a, dmAB)).archived === true, "archive applies");
await b.call("POST", `/api/conversations/${dmAB}/messages`, { body: "wake up" });
ok((await conv(a, dmAB)).archived === false, "a new message pulls an unmuted chat out of the archive");
r = await c.call("POST", `/api/conversations/${dmAB}/prefs`, { pinned: true });
ok(r.status === 404, "outsiders can't touch someone else's chat");

/* ── groups ── */
r = await a.call("POST", "/api/conversations", { title: "crew", memberIds: [b.id, c.id] });
const grp = r.body.conversation.id;
r = await b.call("PATCH", `/api/conversations/${grp}`, { title: "the crew" });
ok(r.status === 200 && (await conv(a, grp)).title === "the crew", "any member can rename a group");
r = await d.call("PATCH", `/api/conversations/${grp}`, { title: "hax" });
ok(r.status === 404, "non-members can't rename");
r = await a.call("PATCH", `/api/conversations/${dmAB}`, { title: "x" });
ok(r.status === 400, "DMs can't be renamed");
r = await a.call("POST", `/api/conversations/${grp}/members`, { userIds: [d.id] });
ok(r.status === 403, "can't add someone who isn't your friend");
await befriend(a, d);
r = await a.call("POST", `/api/conversations/${grp}/members`, { userIds: [d.id] });
ok(r.status === 200 && (await conv(d, grp)).memberIds.length === 4, "adding a friend works and they get the chat");
r = await a.call("POST", `/api/conversations/${grp}/members`, { userIds: [d.id] });
ok(r.status === 400, "adding someone already in it is rejected");
const sg = b.stream(); await sleep(300);
r = await c.call("DELETE", `/api/conversations/${grp}/members/me`);
ok(r.status === 200 && !(await me(c)).conversations.some((x) => x.id === grp), "leaving a group removes it for you");
await sleep(300);
ok((await conv(a, grp)).memberIds.length === 3, "others see the member count drop");
const history = (await a.call("GET", `/api/conversations/${grp}/messages`)).body.messages;
ok(history.some((m) => m.kind === "system" && /left/.test(m.body)) && history.some((m) => /added/.test(m.body)) && history.some((m) => /renamed/.test(m.body)), "renames, adds and leaves are announced");
sg.close();

/* ── nicknames ── */
r = await a.call("PUT", `/api/nicknames/${b.id}`, { nickname: "Bee" });
ok(r.body.nicknames[b.id] === "Bee" && (await me(a)).nicknames[b.id] === "Bee", "nickname saves");
ok(!(await me(b)).nicknames[a.id], "…and only the owner sees it");
r = await a.call("PUT", `/api/nicknames/${tag}x`, { nickname: "nobody" });
ok(r.status === 404, "can't nickname a stranger");
r = await a.call("PUT", `/api/nicknames/${b.id}`, { nickname: "" });
ok(!(r.body.nicknames[b.id]), "empty nickname clears it");

/* ── story viewers ── */
const story = (await a.call("POST", "/api/posts", { kind: "story", body: "hello world", tone: 1 })).body.post;
await b.call("POST", `/api/posts/${story.id}/view`);
await b.call("POST", `/api/posts/${story.id}/view`);
await a.call("POST", `/api/posts/${story.id}/view`);
r = await a.call("GET", `/api/posts/${story.id}/views`);
ok(r.body.views.length === 1 && r.body.views[0].user.id === b.id, "author sees who viewed (once each, not themself)", JSON.stringify(r.body));
r = await b.call("GET", `/api/posts/${story.id}/views`);
ok(r.status === 403, "viewers can't see the viewer list");
r = await d.call("POST", `/api/posts/${story.id}/view`);
ok(r.status === 200 || r.status === 404, "view endpoint is safe for strangers");

/* ── /spin and /wyr, streaks ── */
r = await a.call("POST", `/api/conversations/${grp}/messages`, { body: "/spin who pays?" });
ok(r.body.message.kind === "spin" && r.body.message.data.memberIds.includes(r.body.message.data.winnerId) && r.body.message.data.question === "who pays?", "/spin picks a member");
r = await a.call("POST", `/api/conversations/${dmAB}/messages`, { body: "/wyr" });
ok(r.body.message.kind === "poll" && r.body.message.data.options.length === 2, "/wyr serves a random would-you-rather");
r = await a.call("POST", `/api/conversations/${dmAB}/messages`, { body: "/wyr tea | coffee" });
ok(r.body.message.data.options.map((o) => o.text).join() === "tea,coffee", "/wyr A | B makes your own");
ok((await conv(a, dmAB)).streak >= 1, "both of you wrote today → streak counts", String((await conv(a, dmAB)).streak));
ok((await conv(a, grp)).streak === 0, "groups have no streak");

/* ── account security ── */
r = await a.call("POST", "/api/auth/password", { current: "wrong-password", next: "brandnewpass1" });
ok(r.status === 403, "changing password needs the current one");
const second = new Client(); await second.call("POST", "/api/auth/login", { username: a.name, password: "supersecret1" });
r = await a.call("POST", "/api/auth/password", { current: "supersecret1", next: "brandnewpass1" });
ok(r.status === 200, "password changes");
ok((await second.call("GET", "/api/bootstrap")).status === 401, "…and other devices are signed out");
ok((await a.call("GET", "/api/bootstrap")).status === 200, "…while this one stays signed in");
ok((await new Client().call("POST", "/api/auth/login", { username: a.name, password: "supersecret1" })).status === 401, "old password no longer works");
const third = new Client(); await third.call("POST", "/api/auth/login", { username: a.name, password: "brandnewpass1" });
await third.call("POST", "/api/auth/logout-all");
ok((await a.call("GET", "/api/bootstrap")).status === 401, "log out everywhere signs out every device");
await a.call("POST", "/api/auth/login", { username: a.name, password: "brandnewpass1" });

r = await a.call("GET", "/api/export");
const dump = JSON.parse(r.text);
ok(r.status === 200 && /attachment/.test(r.headers.get("content-disposition")) && dump.friends.length >= 3 && dump.conversations.length >= 3, "data export downloads as JSON with friends and chats");
ok(!r.text.includes("pass_hash") && !r.text.includes("data:image"), "export contains no secrets or raw media");

/* ── delete account ── */
r = await d.call("DELETE", "/api/me", { password: "nope-nope-nope" });
ok(r.status === 403, "deleting needs the right password");
await d.call("POST", "/api/posts", { kind: "post", body: "goodbye post" });
r = await d.call("DELETE", "/api/me", { password: "supersecret1" });
ok(r.status === 200, "account deleted");
ok((await new Client().call("POST", "/api/auth/login", { username: d.name, password: "supersecret1" })).status === 401, "can't log in anymore");
ok(!(await me(a)).conversations.some((x) => x.id === (`dm_${[a.id, d.id].sort().join("_")}`)), "their DM disappears for friends");
ok(!(await a.call("GET", "/api/feed")).body.posts.some((p) => p.body === "goodbye post"), "their posts are gone");
ok((await conv(a, grp)).memberIds.length === 2, "group-mates just see them leave the group");

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
