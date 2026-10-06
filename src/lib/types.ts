import type { Prefs } from "./prefs";
export type { Prefs } from "./prefs";

export type User = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  status: string; // short "what I am up to" line
  pronouns: string;
  avatar: string | null; // small JPEG data URL
  hue: number; // legacy column; the brand is monochrome so this is unused by the UI
  online: boolean; // already respects the person's privacy setting
  lastSeen: number | null; // null when hidden or unknown
  realName?: string; // client-only: set when displayName has been replaced by your private nickname
};
/** The signed-in user: same as User but with real presence and their preferences. */
export type Me = User & { prefs: Prefs };

export type MessageKind =
  | "text" | "image" | "voice" | "spin" | "system" | "roll" | "flip" | "ball" | "poll" | "ttt" | "c4" | "rps" | "prompt" | "effect";

export type Effect = "confetti" | "hearts" | "fire" | "boom" | "snow" | "stars";
export const EFFECTS: Effect[] = ["confetti", "hearts", "fire", "boom", "snow", "stars"];

export type Reaction = { emoji: string; userIds: string[] };

export type PollData = { question: string; options: { text: string; votes: string[] }[] };
export type TttData = {
  board: string[]; // 9 cells: "", "X", "O"
  x: string; // user id playing X (creator)
  o: string | null; // user id playing O (first opponent to move)
  turn: "X" | "O";
  winner: "X" | "O" | "draw" | null;
  line: number[] | null;
};
/** Connect Four: 6 rows x 7 columns, index = row * 7 + col, row 0 is the top. */
export type C4Data = TttData & { last: number | null };
export type RpsPick = "r" | "p" | "s";
export type RpsData = {
  players: string[]; // first two users to pick
  picked: string[]; // who has locked in (the picks themselves stay secret until both are in)
  result: null | { picks: Record<string, RpsPick>; winner: string | null };
};
export type PromptData = { type: "truth" | "dare"; text: string };
export type VoiceData = { duration: number; peaks: number[] };
export type SpinData = { question: string; memberIds: string[]; winnerId: string };
export type RollData = { sides: number; result: number };
export type FlipData = { result: "heads" | "tails" };
export type BallData = { question: string; answer: string };
export type EffectData = { effect: Effect };

export type Message = {
  id: number;
  convId: string;
  senderId: string;
  kind: MessageKind;
  body: string;
  data: unknown;
  replyTo: { id: number; senderId: string; kind: MessageKind; body: string } | null;
  createdAt: number;
  editedAt: number | null;
  deleted: boolean;
  reactions: Reaction[];
  pending?: boolean; // client-only: shown instantly, awaiting the server
  failed?: boolean; // client-only: the server rejected / the network dropped it
};

export type Conversation = {
  id: string;
  kind: "dm" | "group";
  title: string | null;
  memberIds: string[];
  reads: Record<string, number>; // userId -> last read message id (0 when receipts are off for either side)
  unread: number;
  pinned: boolean; // these three are per-viewer
  muted: boolean;
  archived: boolean;
  streak: number; // consecutive days both people wrote (DMs)
  last: Message | null;
  updatedAt: number;
};

export type Post = {
  id: number;
  userId: string;
  kind: "post" | "story";
  body: string;
  image: string | null;
  tone: number; // gradient preset for text stories
  createdAt: number;
  likes: string[];
  commentCount: number;
};
export type PostComment = { id: number; postId: number; userId: string; body: string; createdAt: number };

export type FriendInfo = { user: User; since: number; convId: string | null };
export type InviteRow = {
  code: string; createdAt: number; expiresAt: number;
  status: "pending" | "used" | "expired";
  usedBy: { displayName: string; username: string } | null;
};

export type StoryView = { user: User; at: number };
export type Bootstrap = { me: Me; users: User[]; conversations: Conversation[]; nicknames: Record<string, string> };

export type ServerEvent =
  | { type: "message"; message: Message }
  | { type: "message_update"; message: Message }
  | { type: "read"; convId: string; userId: string; lastReadId: number }
  | { type: "typing"; convId: string; userId: string }
  | { type: "presence"; userId: string; online: boolean; lastSeen: number | null }
  | { type: "user"; user: User }
  | { type: "me"; me: Me }
  | { type: "conversation_removed"; convId: string }
  | { type: "conversation"; conversation: Conversation; users: User[]; celebrate?: string }
  | { type: "post"; post: Post }
  | { type: "post_update"; post: Post }
  | { type: "post_removed"; id: number }
  | { type: "friend_removed"; userId: string; convId: string };
