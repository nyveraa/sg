import crypto from "node:crypto";
import { all, one, run, tx } from "./db";
import { emitTo, isOnline } from "./bus";
import { ApiError } from "./api";
import { hashPassword } from "./password";
import {
  EFFECTS, type BallData, type Bootstrap, type C4Data, type Conversation, type Effect, type FlipData,
  type FriendInfo, type InviteRow, type Message, type MessageKind, type PollData, type Post, type PostComment,
  type PromptData, type RollData, type RpsData, type RpsPick, type TttData, type User, type VoiceData,
} from "../types";

/* ───────────────────────────── users ───────────────────────────── */

type UserRow = { id: string; username: string; display_name: string; bio: string; hue: number };

const toUserDto = (r: UserRow): User => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name,
  bio: r.bio,
  hue: r.hue,
  online: isOnline(r.id),
});

export function toUser(id: string): User | null {
  const r = one<UserRow>("SELECT id, username, display_name, bio, hue FROM users WHERE id = ?", id);
  return r ? toUserDto(r) : null;
}

function usersByIds(ids: string[]): User[] {
  if (!ids.length) return [];
  const rows = all<UserRow>(
    `SELECT id, username, display_name, bio, hue FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
  return rows.map(toUserDto);
}

export function findLogin(username: string) {
  return one<{ id: string; pass_salt: string; pass_hash: string }>(
    "SELECT id, pass_salt, pass_hash FROM users WHERE username = ?", username.toLowerCase());
}

export function createUser(username: string, displayName: string, password: string): User {
  const uname = username.toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(uname)) throw new ApiError(400, "Username: 3–20 letters, numbers or underscores");
  if (password.length < 8) throw new ApiError(400, "Password must be at least 8 characters");
  if (one("SELECT 1 AS x FROM users WHERE username = ?", uname)) throw new ApiError(409, "That username is taken");
  const id = crypto.randomUUID();
  const { salt, hash } = hashPassword(password);
  run(
    "INSERT INTO users (id, username, display_name, hue, pass_salt, pass_hash, created_at) VALUES (?,?,?,?,?,?,?)",
    id, uname, displayName || uname, crypto.randomInt(0, 360), salt, hash, Date.now());
  return toUser(id)!;
}

/** Everyone who should hear about a user's changes: friends and group co-members. */
function audience(userId: string): string[] {
  return all<{ id: string }>(
    `SELECT friend_id AS id FROM friendships WHERE user_id = ?
     UNION SELECT m2.user_id FROM members m1 JOIN members m2 ON m1.conv_id = m2.conv_id WHERE m1.user_id = ?`,
    userId, userId).map((r) => r.id);
}

export function updateProfile(userId: string, patch: { displayName?: string; bio?: string; hue?: number }) {
  const cur = toUser(userId)!;
  const displayName = patch.displayName || cur.displayName;
  const bio = patch.bio ?? cur.bio;
  const hue = patch.hue !== undefined && Number.isFinite(patch.hue) ? Math.round(((patch.hue % 360) + 360) % 360) : cur.hue;
  run("UPDATE users SET display_name = ?, bio = ?, hue = ? WHERE id = ?", displayName, bio, hue, userId);
  const user = toUser(userId)!;
  emitTo([userId, ...audience(userId)], { type: "user", user });
  return user;
}

export function broadcastPresence(userId: string, online: boolean) {
  emitTo(audience(userId), { type: "presence", userId, online });
}

/* ───────────────────────────── messages ───────────────────────────── */

type MsgRow = {
  id: number; conv_id: string; sender_id: string; kind: MessageKind; body: string; data: string | null;
  secret: string | null; reply_to: number | null; created_at: number; edited_at: number | null; deleted: number;
};

const marks = (n: number) => Array(n).fill("?").join(",");

function hydrate(rows: MsgRow[]): Message[] {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const reacts = all<{ message_id: number; emoji: string; user_id: string }>(
    `SELECT message_id, emoji, user_id FROM reactions WHERE message_id IN (${marks(ids.length)}) ORDER BY rowid`, ...ids);
  const replyIds = [...new Set(rows.flatMap((r) => (r.reply_to ? [r.reply_to] : [])))];
  const replies = new Map(
    (replyIds.length
      ? all<{ id: number; sender_id: string; kind: MessageKind; body: string; deleted: number }>(
          `SELECT id, sender_id, kind, body, deleted FROM messages WHERE id IN (${marks(replyIds.length)})`, ...replyIds)
      : []
    ).map((r) => [r.id, r]));

  return rows.map((r) => {
    const deleted = !!r.deleted;
    const grouped = new Map<string, string[]>();
    if (!deleted) for (const x of reacts) if (x.message_id === r.id) grouped.set(x.emoji, [...(grouped.get(x.emoji) ?? []), x.user_id]);
    const rep = r.reply_to ? replies.get(r.reply_to) : undefined;
    return {
      id: r.id,
      convId: r.conv_id,
      senderId: r.sender_id,
      kind: r.kind,
      body: deleted ? "" : r.body,
      data: deleted || !r.data ? null : JSON.parse(r.data),
      replyTo: rep
        ? { id: rep.id, senderId: rep.sender_id, kind: rep.deleted ? "text" : rep.kind,
            body: rep.deleted ? "Message deleted" : rep.kind === "image" ? "" : rep.body.slice(0, 120) }
        : null,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      deleted,
      reactions: [...grouped].map(([emoji, userIds]) => ({ emoji, userIds })),
    };
  });
}

const loadMessage = (id: number) => hydrate([one<MsgRow>("SELECT * FROM messages WHERE id = ?", id)!])[0];

function memberIds(convId: string): string[] {
  return all<{ user_id: string }>("SELECT user_id FROM members WHERE conv_id = ?", convId).map((r) => r.user_id);
}

function assertMember(convId: string, userId: string) {
  if (!one("SELECT 1 AS x FROM members WHERE conv_id = ? AND user_id = ?", convId, userId))
    throw new ApiError(404, "Conversation not found");
}

export function listMessages(userId: string, convId: string, before?: number, limit = 60): Message[] {
  assertMember(convId, userId);
  const rows = before
    ? all<MsgRow>("SELECT * FROM messages WHERE conv_id = ? AND id < ? ORDER BY id DESC LIMIT ?", convId, before, limit)
    : all<MsgRow>("SELECT * FROM messages WHERE conv_id = ? ORDER BY id DESC LIMIT ?", convId, limit);
  return hydrate(rows.reverse());
}

function insertMessage(
  convId: string, senderId: string, kind: MessageKind, body: string, data: unknown = null, replyTo: number | null = null,
  secret: unknown = null,
): Message {
  const now = Date.now();
  const res = run(
    "INSERT INTO messages (conv_id, sender_id, kind, body, data, secret, reply_to, created_at) VALUES (?,?,?,?,?,?,?,?)",
    convId, senderId, kind, body, data ? JSON.stringify(data) : null, secret ? JSON.stringify(secret) : null, replyTo, now);
  const id = Number(res.lastInsertRowid);
  run("UPDATE conversations SET updated_at = ? WHERE id = ?", now, convId);
  run("UPDATE members SET last_read = ? WHERE conv_id = ? AND user_id = ? AND last_read < ?", id, convId, senderId, id);
  return loadMessage(id);
}

const BALL = [
  "It is certain.", "Without a doubt.", "Yes — definitely.", "Signs point to yes.", "Ask again later.",
  "Cannot predict now.", "Don't count on it.", "My sources say no.", "Very doubtful.", "Outlook not so good.",
];
const WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

const TRUTHS = [
  "What's the most embarrassing thing on your phone right now?", "Who was your first crush?",
  "What's a lie you've told that you still think about?", "What's your most irrational fear?",
  "What's the last thing you searched that you'd never admit?", "Which friend would you swap lives with for a week?",
  "What's the worst date you've been on?", "What's a secret talent nobody knows about?",
  "What's your guilty-pleasure song?", "When did you last cry, and why?",
  "What's something you pretend to like but don't?", "What's the pettiest reason you've stopped talking to someone?",
];
const DARES = [
  "Send the last photo in your camera roll (no cheating).", "Voice-message your best movie quote.",
  "Change your bio to something ridiculous for an hour.", "Type your next message with your elbows.",
  "Send a voice note of you humming a song — we guess it.", "Draw a portrait of someone in this chat in 30 seconds.",
  "Speak only in questions for the next 5 messages.", "Send a post-worthy selfie face you'd never normally make.",
  "Tell a story using only emojis.", "Compliment everyone here in the most dramatic way possible.",
];

type Built = { kind: MessageKind; body: string; data?: unknown; secret?: unknown };

/** Slash commands. Returns null for plain text. Server-side so results are fair and identical for everyone. */
export function parseCommand(userId: string, text: string): Built | null {
  const m = /^\/(\w+)(?:\s+([\s\S]*))?$/.exec(text);
  if (!m) return null;
  const arg = (m[2] ?? "").trim();
  switch (m[1].toLowerCase()) {
    case "roll": {
      const n = Number(arg.replace(/^d/i, "")) || 6;
      const sides = Math.min(1000, Math.max(2, Math.floor(n)));
      return { kind: "roll", body: `rolled a d${sides}`, data: { sides, result: crypto.randomInt(1, sides + 1) } satisfies RollData };
    }
    case "flip":
      return { kind: "flip", body: "flipped a coin",
        data: { result: crypto.randomInt(0, 2) ? "heads" : "tails" } satisfies FlipData };
    case "8ball":
      return { kind: "ball", body: arg || "…", data: { question: arg || "…", answer: BALL[crypto.randomInt(0, BALL.length)] } satisfies BallData };
    case "poll": {
      const [question, ...opts] = arg.split("|").map((s) => s.trim()).filter(Boolean);
      if (!question || opts.length < 2 || opts.length > 6)
        throw new ApiError(400, "Poll format: /poll Question | option | option (2–6 options)");
      const data: PollData = { question: question.slice(0, 200), options: opts.map((t) => ({ text: t.slice(0, 80), votes: [] })) };
      return { kind: "poll", body: data.question, data };
    }
    case "ttt": {
      const data: TttData = { board: Array(9).fill(""), x: userId, o: null, turn: "X", winner: null, line: null };
      return { kind: "ttt", body: "started Tic-Tac-Toe", data };
    }
    case "c4": {
      const data: C4Data = { board: Array(42).fill(""), x: userId, o: null, turn: "X", winner: null, line: null, last: null };
      return { kind: "c4", body: "started Connect Four", data };
    }
    case "rps": {
      const data: RpsData = { players: [], picked: [], result: null };
      return { kind: "rps", body: "called Rock · Paper · Scissors", data, secret: { picks: {} } };
    }
    case "truth":
    case "dare": {
      const type = m[1].toLowerCase() as "truth" | "dare";
      const pool = type === "truth" ? TRUTHS : DARES;
      return { kind: "prompt", body: type, data: { type, text: pool[crypto.randomInt(0, pool.length)] } satisfies PromptData };
    }
    case "shrug":
      return { kind: "text", body: `${arg} ¯\\_(ツ)_/¯`.trim() };
    default:
      if ((EFFECTS as string[]).includes(m[1].toLowerCase()))
        return { kind: "effect", body: arg, data: { effect: m[1].toLowerCase() as Effect } };
      return null;
  }
}

export const IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const AUDIO_RE = /^data:audio\/(webm|ogg|mp4|mpeg|wav|aac|x-m4a)(;codecs=[\w.,=-]+)?;base64,[A-Za-z0-9+/=]+$/;

export function sendMessage(
  userId: string, convId: string,
  input: { body: string; image?: string; voice?: { audio: string; duration: number; peaks: number[] }; replyTo?: number },
): Message {
  assertMember(convId, userId);
  let replyTo: number | null = null;
  if (input.replyTo) {
    if (!one("SELECT 1 AS x FROM messages WHERE id = ? AND conv_id = ?", input.replyTo, convId))
      throw new ApiError(400, "Reply target not found");
    replyTo = input.replyTo;
  }
  let built: Built;
  if (input.image) {
    if (input.image.length > 1_000_000 || !IMAGE_RE.test(input.image)) throw new ApiError(400, "Unsupported or oversized image");
    built = { kind: "image", body: input.image };
  } else if (input.voice) {
    const { audio, duration, peaks } = input.voice;
    if (audio.length > 1_800_000 || !AUDIO_RE.test(audio)) throw new ApiError(400, "Unsupported or oversized voice message");
    if (!(duration > 0 && duration <= 180)) throw new ApiError(400, "Voice messages can be up to 3 minutes");
    if (!Array.isArray(peaks) || peaks.length > 80 || peaks.some((p) => typeof p !== "number" || !(p >= 0 && p <= 1)))
      throw new ApiError(400, "Invalid waveform");
    built = { kind: "voice", body: audio, data: { duration: Math.round(duration * 10) / 10, peaks: peaks.map((p) => Math.round(p * 100) / 100) } satisfies VoiceData };
  } else {
    if (!input.body) throw new ApiError(400, "Message is empty");
    built = parseCommand(userId, input.body) ?? { kind: "text", body: input.body };
  }
  const message = insertMessage(convId, userId, built.kind, built.body, built.data ?? null, replyTo, built.secret ?? null);
  emitTo(memberIds(convId), { type: "message", message });
  return message;
}

export function editMessage(userId: string, id: number, body: string) {
  const r = one<MsgRow>("SELECT * FROM messages WHERE id = ?", id);
  if (!r || r.sender_id !== userId || r.deleted || r.kind !== "text") throw new ApiError(403, "You can't edit this message");
  if (!body) throw new ApiError(400, "Message is empty");
  run("UPDATE messages SET body = ?, edited_at = ? WHERE id = ?", body, Date.now(), id);
  return broadcastUpdate(id);
}

export function deleteMessage(userId: string, id: number) {
  const r = one<MsgRow>("SELECT * FROM messages WHERE id = ?", id);
  if (!r || r.sender_id !== userId) throw new ApiError(403, "You can't delete this message");
  run("UPDATE messages SET deleted = 1 WHERE id = ?", id);
  return broadcastUpdate(id);
}

function broadcastUpdate(id: number) {
  const message = loadMessage(id);
  emitTo(memberIds(message.convId), { type: "message_update", message });
  return message;
}

export function toggleReaction(userId: string, id: number, emoji: string) {
  const r = one<MsgRow>("SELECT * FROM messages WHERE id = ?", id);
  if (!r || r.deleted) throw new ApiError(404, "Message not found");
  assertMember(r.conv_id, userId);
  if (!emoji || emoji.length > 16) throw new ApiError(400, "Invalid emoji");
  const had = one("SELECT 1 AS x FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", id, userId, emoji);
  if (had) run("DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", id, userId, emoji);
  else run("INSERT INTO reactions (message_id, user_id, emoji) VALUES (?,?,?)", id, userId, emoji);
  return broadcastUpdate(id);
}

/** Seat the mover for a two-player turn game (X = creator, O = first other user to move). Mutates `g`. */
function seatMover(g: TttData, userId: string) {
  if (g.winner) throw new ApiError(409, "Game over");
  if (g.turn === "X" && userId !== g.x) throw new ApiError(403, "Not your turn");
  if (g.turn === "O") {
    if (userId === g.x) throw new ApiError(403, "Not your turn");
    if (g.o && g.o !== userId) throw new ApiError(403, "Game already has two players");
    g.o = userId;
  }
}

/** Four in a row anywhere on a 6x7 board for `mark`; returns the winning cells. */
function c4Line(board: string[], mark: string): number[] | null {
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [0, 1, 2, 3].map((k) => [r + dr * k, c + dc * k]);
      if (cells.every(([rr, cc]) => rr >= 0 && rr < 6 && cc >= 0 && cc < 7 && board[rr * 7 + cc] === mark)) return cells.map(([rr, cc]) => rr * 7 + cc);
    }
  }
  return null;
}

const BEATS: Record<RpsPick, RpsPick> = { r: "s", s: "p", p: "r" }; // key beats value

/** Interactive messages: poll votes, Tic-Tac-Toe / Connect Four moves, Rock-Paper-Scissors picks. */
export function actOnMessage(userId: string, id: number, action: { option?: number; cell?: number; col?: number; pick?: string }) {
  return tx(() => {
    const r = one<MsgRow>("SELECT * FROM messages WHERE id = ?", id);
    if (!r || r.deleted || !r.data) throw new ApiError(404, "Message not found");
    assertMember(r.conv_id, userId);

    if (r.kind === "poll") {
      const poll = JSON.parse(r.data) as PollData;
      const i = action.option;
      if (typeof i !== "number" || !poll.options[i]) throw new ApiError(400, "Pick an option");
      const already = poll.options[i].votes.includes(userId);
      for (const o of poll.options) o.votes = o.votes.filter((v) => v !== userId);
      if (!already) poll.options[i].votes.push(userId);
      run("UPDATE messages SET data = ? WHERE id = ?", JSON.stringify(poll), id);
    } else if (r.kind === "ttt") {
      const g = JSON.parse(r.data) as TttData;
      const c = action.cell;
      if (typeof c !== "number" || !Number.isInteger(c) || c < 0 || c > 8) throw new ApiError(400, "Pick a cell");
      if (g.winner) throw new ApiError(409, "Game over");
      if (g.board[c]) throw new ApiError(409, "Cell taken");
      seatMover(g, userId);
      const mark = g.turn;
      g.board[c] = mark;
      const line = WIN_LINES.find((l) => l.every((i) => g.board[i] === mark));
      if (line) { g.winner = mark; g.line = line; }
      else if (g.board.every(Boolean)) g.winner = "draw";
      else g.turn = mark === "X" ? "O" : "X";
      run("UPDATE messages SET data = ? WHERE id = ?", JSON.stringify(g), id);
    } else if (r.kind === "c4") {
      const g = JSON.parse(r.data) as C4Data;
      const col = action.col;
      if (typeof col !== "number" || !Number.isInteger(col) || col < 0 || col > 6) throw new ApiError(400, "Pick a column");
      if (g.winner) throw new ApiError(409, "Game over");
      let row = 5;
      while (row >= 0 && g.board[row * 7 + col]) row--;
      if (row < 0) throw new ApiError(409, "Column is full");
      seatMover(g, userId);
      const mark = g.turn;
      const idx = row * 7 + col;
      g.board[idx] = mark;
      g.last = idx;
      const line = c4Line(g.board, mark);
      if (line) { g.winner = mark; g.line = line; }
      else if (g.board.every(Boolean)) g.winner = "draw";
      else g.turn = mark === "X" ? "O" : "X";
      run("UPDATE messages SET data = ? WHERE id = ?", JSON.stringify(g), id);
    } else if (r.kind === "rps") {
      const d = JSON.parse(r.data) as RpsData;
      const sec = JSON.parse(r.secret ?? '{"picks":{}}') as { picks: Record<string, RpsPick> };
      const pick = action.pick;
      if (pick !== "r" && pick !== "p" && pick !== "s") throw new ApiError(400, "Pick rock, paper or scissors");
      if (d.result) throw new ApiError(409, "Round is over");
      if (!d.players.includes(userId)) {
        if (d.players.length >= 2) throw new ApiError(403, "Two players only");
        d.players.push(userId);
      }
      if (sec.picks[userId]) throw new ApiError(409, "You already locked in");
      sec.picks[userId] = pick;
      d.picked.push(userId);
      if (d.players.length === 2 && d.players.every((p) => sec.picks[p])) {
        const [a, b] = d.players;
        d.result = { picks: { [a]: sec.picks[a], [b]: sec.picks[b] },
          winner: sec.picks[a] === sec.picks[b] ? null : BEATS[sec.picks[a]] === sec.picks[b] ? a : b };
      }
      run("UPDATE messages SET data = ?, secret = ? WHERE id = ?", JSON.stringify(d), JSON.stringify(sec), id);
    } else {
      throw new ApiError(400, "Nothing to do on this message");
    }
    return broadcastUpdate(id);
  });
}

export function markRead(userId: string, convId: string) {
  assertMember(convId, userId);
  const top = one<{ m: number | null }>("SELECT MAX(id) AS m FROM messages WHERE conv_id = ?", convId)?.m ?? 0;
  const res = run("UPDATE members SET last_read = ? WHERE conv_id = ? AND user_id = ? AND last_read < ?", top, convId, userId, top);
  if (Number(res.changes) > 0) emitTo(memberIds(convId), { type: "read", convId, userId, lastReadId: top });
}

export function typing(userId: string, convId: string) {
  assertMember(convId, userId);
  emitTo(memberIds(convId).filter((m) => m !== userId), { type: "typing", convId, userId });
}

/* ───────────────────────────── conversations ───────────────────────────── */

type ConvRow = { id: string; kind: "dm" | "group"; title: string | null; updated_at: number };

export function conversationFor(convId: string, viewerId: string): Conversation {
  const c = one<ConvRow>("SELECT id, kind, title, updated_at FROM conversations WHERE id = ?", convId)!;
  const members = all<{ user_id: string; last_read: number }>("SELECT user_id, last_read FROM members WHERE conv_id = ?", convId);
  const mine = members.find((m) => m.user_id === viewerId)?.last_read ?? 0;
  const lastRow = one<MsgRow>("SELECT * FROM messages WHERE conv_id = ? ORDER BY id DESC LIMIT 1", convId);
  const unread = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM messages WHERE conv_id = ? AND id > ? AND sender_id != ? AND deleted = 0 AND kind != 'system'",
    convId, mine, viewerId)!.n;
  return {
    id: c.id, kind: c.kind, title: c.title,
    memberIds: members.map((m) => m.user_id),
    reads: Object.fromEntries(members.map((m) => [m.user_id, m.last_read])),
    unread, last: lastRow ? hydrate([lastRow])[0] : null, updatedAt: c.updated_at,
  };
}

export function bootstrap(userId: string): Bootstrap {
  const convIds = all<{ conv_id: string }>("SELECT conv_id FROM members WHERE user_id = ?", userId).map((r) => r.conv_id);
  const conversations = convIds.map((id) => conversationFor(id, userId)).sort((a, b) => b.updatedAt - a.updatedAt);
  const ids = new Set<string>([userId, ...conversations.flatMap((c) => c.memberIds)]);
  return { me: toUser(userId)!, users: usersByIds([...ids]), conversations };
}

function getOrCreateDm(a: string, b: string): string {
  const id = `dm_${[a, b].sort().join("_")}`;
  const now = Date.now();
  if (!one("SELECT 1 AS x FROM conversations WHERE id = ?", id)) {
    run("INSERT INTO conversations (id, kind, created_at, updated_at) VALUES (?, 'dm', ?, ?)", id, now, now);
    run("INSERT INTO members (conv_id, user_id) VALUES (?,?)", id, a);
    run("INSERT INTO members (conv_id, user_id) VALUES (?,?)", id, b);
  }
  return id;
}

const areFriends = (a: string, b: string) =>
  !!one("SELECT 1 AS x FROM friendships WHERE user_id = ? AND friend_id = ?", a, b);

function pushConversation(convId: string, extra?: (viewerId: string) => string | undefined) {
  const ids = memberIds(convId);
  const users = usersByIds(ids);
  for (const id of ids)
    emitTo([id], { type: "conversation", conversation: conversationFor(convId, id), users, celebrate: extra?.(id) });
}

export function createGroup(creatorId: string, title: string, members: string[]) {
  const others = [...new Set(members)].filter((m) => m !== creatorId);
  if (!title) throw new ApiError(400, "Give the group a name");
  if (others.length < 2) throw new ApiError(400, "Pick at least two friends");
  if (others.length > 20) throw new ApiError(400, "Groups are limited to 21 people");
  if (!others.every((m) => areFriends(creatorId, m))) throw new ApiError(403, "You can only add your friends");
  const id = `grp_${crypto.randomUUID()}`;
  const now = Date.now();
  tx(() => {
    run("INSERT INTO conversations (id, kind, title, created_by, created_at, updated_at) VALUES (?, 'group', ?, ?, ?, ?)", id, title, creatorId, now, now);
    for (const m of [creatorId, ...others]) run("INSERT INTO members (conv_id, user_id) VALUES (?,?)", id, m);
    insertMessage(id, creatorId, "system", `created the group “${title}”`);
  });
  pushConversation(id);
  return conversationFor(id, creatorId);
}

/* ───────────────────────────── invites & friends ───────────────────────────── */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const INVITE_TTL = 1000 * 60 * 60 * 24 * 7;
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function mintInvite(userId: string) {
  let code = "";
  for (let i = 0; i < 8; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  const now = Date.now();
  run("DELETE FROM invites WHERE owner_id = ? AND used_by IS NULL AND expires_at < ?", userId, now);
  run("INSERT INTO invites (code, owner_id, created_at, expires_at) VALUES (?,?,?,?)", code, userId, now, now + INVITE_TTL);
  return { code, expiresAt: now + INVITE_TTL };
}

export function inviteInfo(rawCode: string) {
  const r = one<{ owner_id: string; used_by: string | null; expires_at: number }>(
    "SELECT owner_id, used_by, expires_at FROM invites WHERE code = ?", normalizeCode(rawCode));
  if (!r) return { valid: false as const };
  const owner = toUser(r.owner_id)!;
  return {
    valid: !r.used_by && r.expires_at > Date.now(),
    inviter: { displayName: owner.displayName, username: owner.username, hue: owner.hue },
  };
}

export function redeemInvite(userId: string, rawCode: string) {
  const code = normalizeCode(rawCode);
  if (code.length !== 8) throw new ApiError(400, "Invite codes are 8 characters");
  const { convId, friendId } = tx(() => {
    const inv = one<{ owner_id: string; used_by: string | null; expires_at: number }>(
      "SELECT owner_id, used_by, expires_at FROM invites WHERE code = ?", code);
    if (!inv) throw new ApiError(404, "That code doesn't exist");
    if (inv.used_by) throw new ApiError(410, "That code has already been used");
    if (inv.expires_at < Date.now()) throw new ApiError(410, "That code has expired — ask for a fresh one");
    if (inv.owner_id === userId) throw new ApiError(400, "That's your own code — send it to a friend");
    if (areFriends(userId, inv.owner_id)) throw new ApiError(409, "You're already connected");
    const now = Date.now();
    run("UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?", userId, now, code);
    run("INSERT INTO friendships (user_id, friend_id, created_at) VALUES (?,?,?)", userId, inv.owner_id, now);
    run("INSERT INTO friendships (user_id, friend_id, created_at) VALUES (?,?,?)", inv.owner_id, userId, now);
    const convId = getOrCreateDm(userId, inv.owner_id);
    insertMessage(convId, userId, "system", "joined with an invite code — say hi 👋");
    return { convId, friendId: inv.owner_id };
  });
  pushConversation(convId, (viewer) => (viewer === userId ? friendId : userId));
  return conversationFor(convId, userId);
}

/* ───────────────────────────── friends & invite management ───────────────────────────── */

const dmId = (a: string, b: string) => `dm_${[a, b].sort().join("_")}`;
const friendIds = (userId: string) =>
  all<{ friend_id: string }>("SELECT friend_id FROM friendships WHERE user_id = ?", userId).map((r) => r.friend_id);

export function listFriends(userId: string): FriendInfo[] {
  return all<{ friend_id: string; created_at: number }>(
    "SELECT friend_id, created_at FROM friendships WHERE user_id = ? ORDER BY created_at DESC", userId,
  ).map((r) => ({
    user: toUser(r.friend_id)!,
    since: r.created_at,
    convId: one("SELECT 1 AS x FROM conversations WHERE id = ?", dmId(userId, r.friend_id)) ? dmId(userId, r.friend_id) : null,
  }));
}

/** Ends a friendship for both people and deletes their DM (and its history). Group chats are untouched. */
export function removeFriend(userId: string, friendId: string) {
  if (!areFriends(userId, friendId)) throw new ApiError(404, "You're not friends with that person");
  const convId = dmId(userId, friendId);
  tx(() => {
    run("DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)", userId, friendId, friendId, userId);
    run("DELETE FROM conversations WHERE id = ?", convId);
  });
  emitTo([userId], { type: "friend_removed", userId: friendId, convId });
  emitTo([friendId], { type: "friend_removed", userId, convId });
}

export function listInvites(userId: string): InviteRow[] {
  const now = Date.now();
  return all<{ code: string; created_at: number; expires_at: number; used_by: string | null }>(
    "SELECT code, created_at, expires_at, used_by FROM invites WHERE owner_id = ? ORDER BY created_at DESC LIMIT 30", userId,
  ).map((r) => {
    const by = r.used_by ? toUser(r.used_by) : null;
    return {
      code: r.code, createdAt: r.created_at, expiresAt: r.expires_at,
      status: r.used_by ? "used" : r.expires_at < now ? "expired" : "pending",
      usedBy: by ? { displayName: by.displayName, username: by.username } : null,
    };
  });
}

export function revokeInvite(userId: string, rawCode: string) {
  const res = run("DELETE FROM invites WHERE code = ? AND owner_id = ? AND used_by IS NULL", normalizeCode(rawCode), userId);
  if (Number(res.changes) === 0) throw new ApiError(404, "No unused invite with that code");
}

/* ───────────────────────────── posts & stories ───────────────────────────── */

const STORY_TTL = 24 * 60 * 60 * 1000;
type PostRow = { id: number; user_id: string; kind: "post" | "story"; body: string; image: string | null; tone: number; created_at: number };

function hydratePosts(rows: PostRow[]): Post[] {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const likes = all<{ post_id: number; user_id: string }>(
    `SELECT post_id, user_id FROM post_likes WHERE post_id IN (${marks(ids.length)})`, ...ids);
  const counts = new Map(all<{ post_id: number; n: number }>(
    `SELECT post_id, COUNT(*) AS n FROM post_comments WHERE post_id IN (${marks(ids.length)}) GROUP BY post_id`, ...ids).map((c) => [c.post_id, c.n]));
  return rows.map((r) => ({
    id: r.id, userId: r.user_id, kind: r.kind, body: r.body, image: r.image, tone: r.tone, createdAt: r.created_at,
    likes: likes.filter((l) => l.post_id === r.id).map((l) => l.user_id), commentCount: counts.get(r.id) ?? 0,
  }));
}

const loadPost = (id: number) => hydratePosts([one<PostRow>("SELECT * FROM posts WHERE id = ?", id)!])[0];

function visiblePost(userId: string, id: number): PostRow {
  const r = one<PostRow>("SELECT * FROM posts WHERE id = ?", id);
  if (!r || (r.user_id !== userId && !areFriends(userId, r.user_id))) throw new ApiError(404, "Post not found");
  return r;
}

const postAudience = (userId: string) => [userId, ...friendIds(userId)];

export function listFeed(userId: string): { posts: Post[]; stories: Post[] } {
  const ids = postAudience(userId);
  const posts = all<PostRow>(
    `SELECT * FROM posts WHERE kind = 'post' AND user_id IN (${marks(ids.length)}) ORDER BY id DESC LIMIT 50`, ...ids);
  const stories = all<PostRow>(
    `SELECT * FROM posts WHERE kind = 'story' AND created_at > ? AND user_id IN (${marks(ids.length)}) ORDER BY id ASC`, Date.now() - STORY_TTL, ...ids);
  return { posts: hydratePosts(posts), stories: hydratePosts(stories) };
}

export function createPost(userId: string, input: { kind: "post" | "story"; body: string; image?: string; tone?: number }): Post {
  const { kind, body, image } = input;
  if (!body && !image) throw new ApiError(400, "Write something or add a photo");
  if (body.length > (kind === "story" ? 220 : 1500)) throw new ApiError(400, "That's too long");
  if (image && (image.length > 1_200_000 || !IMAGE_RE.test(image))) throw new ApiError(400, "Unsupported or oversized image");
  const tone = Math.min(5, Math.max(0, Math.floor(input.tone ?? 0)));
  const res = run("INSERT INTO posts (user_id, kind, body, image, tone, created_at) VALUES (?,?,?,?,?,?)",
    userId, kind, body, image ?? null, tone, Date.now());
  const post = loadPost(Number(res.lastInsertRowid));
  emitTo(postAudience(userId), { type: "post", post });
  return post;
}

export function deletePost(userId: string, id: number) {
  const r = one<PostRow>("SELECT * FROM posts WHERE id = ?", id);
  if (!r || r.user_id !== userId) throw new ApiError(403, "You can only delete your own posts");
  run("DELETE FROM posts WHERE id = ?", id);
  emitTo(postAudience(userId), { type: "post_removed", id });
}

function broadcastPost(id: number, authorId: string) {
  const post = loadPost(id);
  emitTo(postAudience(authorId), { type: "post_update", post });
  return post;
}

export function togglePostLike(userId: string, id: number) {
  const r = visiblePost(userId, id);
  const had = one("SELECT 1 AS x FROM post_likes WHERE post_id = ? AND user_id = ?", id, userId);
  if (had) run("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?", id, userId);
  else run("INSERT INTO post_likes (post_id, user_id) VALUES (?,?)", id, userId);
  return broadcastPost(id, r.user_id);
}

export function listComments(userId: string, postId: number): PostComment[] {
  visiblePost(userId, postId);
  return all<{ id: number; post_id: number; user_id: string; body: string; created_at: number }>(
    "SELECT * FROM post_comments WHERE post_id = ? ORDER BY id ASC LIMIT 200", postId,
  ).map((c) => ({ id: c.id, postId: c.post_id, userId: c.user_id, body: c.body, createdAt: c.created_at }));
}

export function addComment(userId: string, postId: number, body: string): PostComment {
  const r = visiblePost(userId, postId);
  if (!body || body.length > 500) throw new ApiError(400, "Comments are 1–500 characters");
  const now = Date.now();
  const res = run("INSERT INTO post_comments (post_id, user_id, body, created_at) VALUES (?,?,?,?)", postId, userId, body, now);
  broadcastPost(postId, r.user_id);
  return { id: Number(res.lastInsertRowid), postId, userId, body, createdAt: now };
}
