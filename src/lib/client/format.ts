import type { Message, User } from "../types";

export const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** One-line summary of a message for lists and notifications. */
export function previewOf(m: Message | null, users: Record<string, User>, meId: string) {
  if (!m) return "No messages yet";
  const who = m.senderId === meId ? "You: " : "";
  if (m.deleted) return "Message deleted";
  switch (m.kind) {
    case "image": return `${who}Photo`;
    case "voice": return `${who}Voice message · ${fmtDur((m.data as { duration: number }).duration)}`;
    case "roll": return `${who}rolled a ${(m.data as { result: number }).result}`;
    case "flip": return `${who}flipped ${(m.data as { result: string }).result}`;
    case "ball": return `${who}asked the 8-ball`;
    case "poll": return `${who}Poll — ${m.body}`;
    case "ttt": return `${who}Tic-Tac-Toe`;
    case "c4": return `${who}Connect Four`;
    case "rps": return `${who}Rock · Paper · Scissors`;
    case "spin": return `${who}spun the wheel`;
    case "prompt": return `${who}${m.body === "truth" ? "Truth" : "Dare"}: ${(m.data as { text: string }).text}`;
    case "effect": return `${who}sent ${(m.data as { effect: string }).effect}`;
    case "system": return `${users[m.senderId]?.displayName ?? "Someone"} ${m.body}`;
    default: return who + m.body;
  }
}

export function timeShort(ts: number) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (now.getTime() - ts < 6 * 864e5) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export const ago = (ts: number) => {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};

/** "Online now" / "Active 5m ago" / "Active yesterday" / "Offline" — honours the person's privacy (null lastSeen). */
export function presenceLabel(u: Pick<User, "online" | "lastSeen"> | undefined): string {
  if (!u) return "Offline";
  if (u.online) return "Online now";
  if (!u.lastSeen) return "Offline";
  const m = Math.floor((Date.now() - u.lastSeen) / 60000);
  if (m < 1) return "Active just now";
  if (m < 60) return `Active ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Active ${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "Active yesterday" : d < 7 ? `Active ${d} days ago` : `Active ${new Date(u.lastSeen).toLocaleDateString([], { month: "short", day: "numeric" })}`;
}
