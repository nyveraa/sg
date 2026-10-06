# Whisper

Private, invite-only messaging with a cinematic black-and-white interface.

```bash
npm install
npm run dev          # http://localhost:3100
npm run seed         # optional demo content: log in as  ekta / blackout-test-1
```

## How people get in
Sign up → **(+)** → *Get invite link* → send the link or code → your friend signs up through it (or presses **(+)** → *Enter a code*) and you are connected with a chat open. Codes are single-use, expire after 7 days, and can be revoked under **Friends → Invites**.

## What's inside
- **Chats** — live delivery, typing and presence, read receipts, replies, edit/delete, emoji reactions, search, groups.
- **Voice notes** — record in the composer (3D orb reacts to your voice), waveform playback with scrubbing and 1×/1.5×/2×.
- **Sketch** — draw on a canvas and send it as a picture.
- **Games & fun** (type `/` or press ⚡): `/roll` `/flip` `/8ball` `/poll` `/ttt` `/c4` (Connect Four) `/rps` (secret picks) `/truth` `/dare`, plus screen effects `/confetti` `/hearts` `/snow` `/stars` `/fire` `/boom`.
- **Moments** — posts with photos, likes and comments, and 24-hour stories with a fullscreen viewer.
- **Friends** — manage your circle (message, remove with confirmation) and your invites.

## Stack
Next.js 16 · Node's built-in SQLite (`data/onyx.db`) · Server-Sent Events · React-Three-Fiber · Motion · Tailwind 4.
Type: EB Garamond (display) · Instrument Sans (UI) · Martian Mono (codes).

## Tests
```bash
npm run test:api     # 149 API checks (auth, invites, access control, privacy and read receipts, games, posts, friends…)
npm run seed && npm run test:e2e   # 35 browser checks in headless Chrome (needs Chrome or Edge installed)
```
Dev conveniences: `ONYX_NO_RATELIMIT=1 npm run dev` disables rate limits (ignored in production);
`node tests/shot.mjs /app out.png --login=ekta` screenshots any page with headless Chrome.
