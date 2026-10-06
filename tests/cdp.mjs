// Minimal headless-Chrome driver over the DevTools protocol (no dependencies). Used by shot.mjs and e2e.mjs.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const BASE = process.env.ONYX_BASE ?? "http://localhost:3100";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p));

/** Opens a page and runs `fn(page)`. page: eval, click, type, key, mouse, shot, wait, waitFor, logs, goto. */
export async function withPage({ w = 1440, h = 900, mobile = false, login, password = "blackout-test-1", skipIntro = true, fakeMic = false, reducedMotion = false }, fn) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "onyx-cdp-"));
  const flags = ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${w},${h}`, "--hide-scrollbars",
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-first-run", "--disable-extensions", "--autoplay-policy=no-user-gesture-required"];
  if (fakeMic) flags.push("--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream");
  const chrome = spawn(CHROME, [...flags, "about:blank"], { stdio: "ignore" });
  try {
    let targets;
    for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch { /* starting */ } await sleep(200); }
    const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0; const pending = new Map(); const logs = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
      if (d.method === "Runtime.exceptionThrown") logs.push("EXCEPTION " + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 300));
      if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") logs.push("console.error " + d.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300));
    };
    const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
    const evalJs = async (expression) => {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "eval failed");
      return r.result.value;
    };
    await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
    if (reducedMotion) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true });
    if (skipIntro) await send("Page.addScriptToEvaluateOnNewDocument", { source: "try{sessionStorage.setItem('onyx:intro','1')}catch(e){}" });
    if (fakeMic) await send("Browser.grantPermissions", { permissions: ["audioCapture"], origin: BASE }).catch(() => {});

    if (login) {
      const res = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: login, password }) });
      const token = res.headers.get("set-cookie")?.match(/onyx_session=([^;]+)/)?.[1];
      if (!token) throw new Error("login failed for " + login);
      await send("Network.setCookie", { name: "onyx_session", value: token, domain: "localhost", path: "/" });
    }

    const page = {
      logs, eval: evalJs, send,
      goto: async (p) => { await send("Page.navigate", { url: BASE + p }); },
      wait: sleep,
      /** Polls a JS expression until truthy. */
      waitFor: async (expr, what = expr, timeout = 15000) => {
        const t0 = Date.now();
        for (;;) {
          try { if (await evalJs(`!!(${expr})`)) return true; } catch { /* page navigating */ }
          if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for: ${what}`);
          await sleep(200);
        }
      },
      click: (sel) => evalJs(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;e.click();return true})()`),
      clickText: (sel, text) => evalJs(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>x.textContent.includes(${JSON.stringify(text)}));if(!e)return false;e.click();return true})()`),
      /** Types into the focused/selected input via real key events so React sees it. */
      type: async (sel, text) => {
        await evalJs(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.focus();e.select&&e.select();})()`);
        await send("Input.insertText", { text });
      },
      key: async (key) => {
        const vk = { Enter: 13, Escape: 27, ArrowLeft: 37, ArrowRight: 39, " ": 32 }[key] ?? 0;
        await send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: vk, text: key === "Enter" ? "\r" : undefined });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: vk });
      },
      mouse: (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 }),
      rect: (sel) => evalJs(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`),
      shot: async (file) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(s.data, "base64")); },
    };
    const out = await fn(page);
    ws.close();
    return out;
  } finally {
    chrome.kill();
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold files; the OS temp dir cleans up */ } }, 2500).unref();
  }
}
