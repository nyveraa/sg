// Browser end-to-end: voice, sketch, games, polls, reactions, feed, stories, friends manager.
// Needs a running server seeded with `node tests/seed.mjs`. Repeatable: it creates its own throwaway friend + content.
//   ONYX_NO_RATELIMIT=1 npm run dev   (then)   node tests/e2e.mjs
import { withPage } from "./cdp.mjs";

const BASE = process.env.ONYX_BASE ?? "http://localhost:3100";
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); if (!ok) failed++; };
const step = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, e.message.split("\n")[0]); } };

/* ── setup through the API: a throwaway friend with a post and a comment ── */
const call = async (cookie, method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  return { cookie: r.headers.get("set-cookie")?.split(";")[0], body: await r.json().catch(() => ({})) };
};
const tmpName = "tmp" + Date.now().toString().slice(-8);
const ekta = await call("", "POST", "/api/auth/login", { username: "ekta", password: "blackout-test-1" });
const mikaLogin = await call("", "POST", "/api/auth/login", { username: "mika", password: "blackout-test-1" });
const tmp = await call("", "POST", "/api/auth/signup", { username: tmpName, displayName: "Tempo", password: "blackout-test-1" });
const invite = await call(ekta.cookie, "POST", "/api/invites");
await call(tmp.cookie, "POST", "/api/invites/redeem", { code: invite.body.code });
const tmpPost = (await call(tmp.cookie, "POST", "/api/posts", { kind: "post", body: "Tempo says hello to the dark" })).body.post;
await call(tmp.cookie, "POST", `/api/posts/${tmpPost.id}/comments`, { body: "first!" });

await withPage({ login: "ekta", fakeMic: true, reducedMotion: true, w: 1280, h: 800 }, async (p) => {
  await p.goto("/app");
  await p.waitFor("document.querySelector('nav[aria-label=Conversations] button')", "app to load", 40000);
  await p.wait(2500);

  const apiGet = (path) => p.eval(`fetch(${JSON.stringify(path)}).then(r=>r.json())`);
  const composer = "document.querySelector('textarea[aria-label=Message]')";
  const say = async (text) => { await p.waitFor(`${composer} && !document.querySelector('[role=dialog]')`, "composer ready"); await p.wait(500); await p.type("textarea[aria-label=Message]", text); await p.key("Enter"); };
  let friendCount = 0;

  await step("open chat", async () => {
    await p.clickText("nav[aria-label=Conversations] button", "Mika");
    await p.waitFor(composer, "composer", 40000);
    await p.wait(1500);
    check("open Mika's chat", await p.eval("!!document.querySelector('[id^=m-]')"));
  });

  /* ── voice note: record with the fake mic, send, see it land, recorder closes ── */
  await step("voice", async () => {
    const before = await p.eval("document.querySelectorAll('[role=slider][aria-label=Seek]').length");
    check("mic button present", await p.click("button[aria-label='Record a voice message']"));
    await p.waitFor("document.querySelector('button[aria-label=\"Send voice message\"]')", "recorder UI");
    check("recorder shows live timer", await p.eval("!!document.querySelector('[role=timer]')"));
    await p.wait(2600);
    await p.click("button[aria-label='Send voice message']");
    await p.waitFor(`document.querySelectorAll('[role=slider][aria-label=Seek]').length > ${before}`, "voice bubble", 20000);
    check("voice message appears as a playable bubble", true);
    await p.waitFor(`!document.querySelector('[role=timer]') && ${composer}`, "recorder to close");
    check("recorder closes after sending", true);
    const dm = (await apiGet("/api/bootstrap")).conversations.find((c) => c.kind === "dm" && c.last?.kind === "voice");
    const msgs = (await apiGet(`/api/conversations/${dm.id}/messages`)).messages;
    const v = msgs.filter((m) => m.kind === "voice").pop();
    check("voice stored with duration + waveform", !!v && v.data.duration > 1 && v.data.peaks.length === 48, JSON.stringify(v?.data).slice(0, 80));
    check("audio element has a playable source", await p.eval("[...document.querySelectorAll('audio')].every(a=>a.src.startsWith('data:audio'))"));
  });

  /* ── sketch pad ── */
  await step("sketch", async () => {
    const imgs = await p.eval("document.querySelectorAll('img[alt=\"Shared image\"]').length");
    await p.click("button[aria-label=Sketch]");
    await p.waitFor("document.querySelector('canvas[aria-label=\"Drawing canvas\"]')", "sketch canvas");
    await p.wait(700);
    const r = await p.rect("canvas[aria-label='Drawing canvas']");
    await p.mouse("mousePressed", r.x + 90, r.y + 120);
    for (let i = 1; i <= 14; i++) await p.mouse("mouseMoved", r.x + 90 + i * 30, r.y + 120 + Math.sin(i / 2) * 70);
    await p.mouse("mouseReleased", r.x + 510, r.y + 140);
    const inked = await p.eval(`(()=>{const c=document.querySelector('canvas[aria-label="Drawing canvas"]');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>200)n++;return n})()`);
    check("drawing leaves ink on the canvas", inked > 200, `bright pixels=${inked}`);
    await p.clickText("[role=dialog] button", "Send");
    await p.waitFor(`document.querySelectorAll('img[alt="Shared image"]').length > ${imgs}`, "sketch image message", 20000);
    check("sketch is sent as an image message", true);
  });

  /* ── games: fresh rounds each run ── */
  await step("rock paper scissors", async () => {
    const rocks = await p.eval("document.querySelectorAll('button[aria-label=Rock]').length");
    await say("/rps");
    await p.waitFor(`document.querySelectorAll('button[aria-label=Rock]').length > ${rocks}`, "new RPS card");
    const conv = (await apiGet("/api/bootstrap")).conversations.find((c) => c.last?.kind === "rps");
    await call(mikaLogin.cookie, "POST", `/api/messages/${conv.last.id}/act`, { pick: "s" }); // Mika locks in scissors, secretly
    await p.eval("[...document.querySelectorAll('button[aria-label=Rock]')].pop().click()"); // rock beats scissors
    await p.waitFor("document.body.innerText.includes('You win')", "RPS result");
    check("RPS: hidden pick revealed once both are in, rock beats scissors", true);
  });
  await step("connect four", async () => {
    await say("/c4");
    await p.waitFor("[...document.querySelectorAll('[role=status]')].some(e=>e.textContent==='Your move')", "own Connect Four");
    await p.eval("[...document.querySelectorAll('button[aria-label=\"Drop in column 4\"]')].filter(b=>!b.disabled).pop().click()");
    await p.waitFor("[...document.querySelectorAll('[role=status]')].some(e=>/Waiting for/.test(e.textContent))", "turn passes");
    check("Connect Four: dropping a disc passes the turn", true);
  });
  await step("poll", async () => {
    await say("/poll Best hour? | Midnight | Dawn");
    await p.waitFor("document.body.innerText.includes('Best hour?')", "poll card");
    await p.eval("[...document.querySelectorAll('button')].filter(b=>b.textContent.includes('Midnight')).pop().click()");
    await p.waitFor("[...document.querySelectorAll('button[aria-pressed=true]')].some(b=>b.textContent.includes('Midnight'))", "vote");
    check("poll vote is recorded", true);
  });
  await step("effects", async () => {
    await say("/snow");
    await p.waitFor("document.body.innerText.includes('sent snow')", "snow effect line");
    check("/snow posts an effect message", true);
  });
  await step("reaction", async () => {
    await p.eval("[...document.querySelectorAll('button[aria-label=\"React 🔥\"]')].pop().click()");
    await p.waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.trim().startsWith('🔥')&&/\\d/.test(b.textContent))", "reaction chip");
    check("emoji reaction chip appears", true);
  });

  /* ── moments: posts, likes, comments ── */
  await step("feed", async () => {
    await p.click("button[aria-label=Moments]");
    await p.waitFor("document.querySelector('textarea[aria-label=\"New post\"]')", "feed");
    await p.type("textarea[aria-label='New post']", "e2e: first light over the dunes");
    await p.clickText("button", "Post");
    await p.waitFor("document.body.innerText.includes('e2e: first light over the dunes')", "post to appear");
    check("new post appears in the feed", true);
    check("post stored for friends", (await apiGet("/api/feed")).posts.some((x) => x.body.startsWith("e2e:")));

    const card = "[...document.querySelectorAll('article')].find(a=>a.textContent.includes('Tempo says hello'))";
    await p.waitFor(card, "friend's post");
    await p.eval(`${card}.querySelector('button[aria-label=Like]').click()`);
    await p.waitFor(`${card}.querySelector('button[aria-label=Unlike]')`, "like toggled");
    check("liking a friend's post toggles the heart", true);
    await p.eval(`${card}.querySelector('button[aria-expanded]').click()`);
    await p.waitFor(`${card}.textContent.includes('first!')`, "comments load");
    check("comments expand and load", true);
    await p.eval(`${card}.querySelector('input[aria-label="Write a comment"]').focus()`);
    await p.send("Input.insertText", { text: "stunning" }); await p.key("Enter");
    await p.waitFor(`${card}.textContent.includes('stunning')`, "new comment");
    check("commenting works and shows immediately", true);
  });

  /* ── stories ── */
  await step("stories", async () => {
    const bubble = (name) => `[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(name)})&&b.closest('[aria-label=Stories]'))`;
    await p.eval(`${bubble("Mika")}.click()`);
    await p.waitFor("document.querySelector('[role=dialog][aria-label=Story]')", "story viewer");
    check("story viewer opens", true);
    check("viewer opens on the right person's story", await p.eval("document.body.innerText.includes('3am and still awake.')"));
    await p.key("ArrowRight");
    await p.waitFor("document.body.innerText.includes('Coffee count: 4')", "next story");
    check("→ advances to the next story", true);
    await p.key("Escape");
    await p.waitFor("!document.querySelector('[role=dialog][aria-label=Story]')", "viewer closes");
    check("Esc closes the viewer", true);

    await p.click("[role=button][aria-label='Add to your story']");
    await p.waitFor("document.querySelector('[role=dialog][aria-label=\"New story\"]')", "story composer");
    await p.type("[role=dialog] textarea", "e2e story: night shift");
    await p.clickText("[role=dialog] button", "Share to story");
    await p.waitFor("!document.querySelector('[role=dialog][aria-label=\"New story\"]')", "composer closes", 20000);
    check("posting a story closes the composer", true);
    check("story visible in the feed API", (await apiGet("/api/feed")).stories.some((s) => s.body === "e2e story: night shift"));
  });

  /* ── friends manager ── */
  await step("friends", async () => {
    await p.click("button[aria-label=Friends]");
    await p.waitFor("[...document.querySelectorAll('h3')].some(h=>h.textContent==='Tempo')", "friend cards");
    friendCount = (await apiGet("/api/friends")).friends.length;
    check("friend cards render", await p.eval(`document.querySelectorAll('h3').length === ${friendCount}`), String(friendCount));
    await p.type("input[aria-label='Search friends']", "zan");
    await p.waitFor("[...document.querySelectorAll('h3')].map(h=>h.textContent).join()==='Zane'", "search to filter");
    check("search filters friends", true);
    await p.type("input[aria-label='Search friends']", "");
    await p.waitFor(`document.querySelectorAll('h3').length === ${friendCount}`, "filter cleared");

    await p.click("button[aria-label='Remove Tempo']");
    await p.waitFor("document.querySelector('[role=dialog]')", "confirm dialog");
    check("removing asks for confirmation first", await p.eval("document.querySelector('[role=dialog]').textContent.includes('deleted for')"));
    await p.clickText("[role=dialog] button", "Keep friend");
    await p.waitFor("!document.querySelector('[role=dialog]')", "dialog closes");
    check("'Keep friend' cancels", (await apiGet("/api/friends")).friends.length === friendCount);

    await p.clickText("button[role=tab]", "invites");
    await p.waitFor("document.body.innerText.toLowerCase().includes('pending')", "pending invite");
    check("invites tab lists pending invites", true);
  });

  await step("unfriend", async () => {
    await p.clickText("button[role=tab]", "friends");
    await p.waitFor("document.querySelector('button[aria-label=\"Remove Tempo\"]')", "Tempo card");
    await p.click("button[aria-label='Remove Tempo']");
    await p.waitFor("document.querySelector('[role=dialog]')", "confirm");
    await p.clickText("[role=dialog] button", "Remove");
    await p.waitFor("!document.querySelector('button[aria-label=\"Remove Tempo\"]')", "Tempo card gone", 20000);
    check("unfriending removes the card live", true);
    check("server agrees (one fewer friend)", (await apiGet("/api/friends")).friends.length === friendCount - 1);
    check("their post disappears from my feed", !(await apiGet("/api/feed")).posts.some((x) => x.id === tmpPost.id));
    await p.click("button[aria-label=Chats]");
    await p.wait(800);
    check("DM with Tempo is gone from Chats", await p.eval("![...document.querySelectorAll('nav[aria-label=Conversations] button')].some(b=>b.textContent.includes('Tempo'))"));
  });

  const errs = [...new Set(p.logs.filter((l) => l.startsWith("EXCEPTION")))];
  check("no uncaught page exceptions", errs.length === 0, errs.join(" | "));
  await p.shot("shots/e2e_final.png");
});

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
