// Dev tool: screenshot a page of the running app with headless Chrome.
//   node tests/shot.mjs <path> <out.png> [--w=1440] [--h=900] [--login=ekta] [--wait=3500] [--scroll=PX] [--scrollEl=SELECTOR]
//                       [--eval="js"] [--mobile] [--intro]
// (Git Bash users: export MSYS_NO_PATHCONV=1 so "/app" isn't rewritten into a Windows path.)
import { withPage } from "./cdp.mjs";

const [pathArg = "/", out = "shot.png", ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : true]; }));

await withPage({ w: Number(opt.w ?? 1440), h: Number(opt.h ?? 900), mobile: !!opt.mobile, login: opt.login, skipIntro: !opt.intro, reducedMotion: !!opt.rm, fakeMic: !!opt.mic }, async (p) => {
  await p.goto(pathArg);
  await p.wait(Number(opt.wait ?? 3500));
  if (opt.eval) { console.log("eval →", JSON.stringify(await p.eval(opt.eval))); await p.wait(900); }
  if (opt.scroll) { await p.eval(`(document.querySelector(${JSON.stringify(opt.scrollEl ?? "main")}) ?? document.scrollingElement).scrollTo({top:${Number(opt.scroll)},behavior:'instant'})`); await p.wait(2200); }
  await p.shot(out);
  console.log(`saved ${out}`);
  if (p.logs.length) console.log("page errors:\n" + [...new Set(p.logs)].join("\n"));
});
