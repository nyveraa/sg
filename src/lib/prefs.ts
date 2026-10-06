/** User preferences, shared by server (validation, privacy) and client (appearance). */

export const ACCENTS = ["pearl", "ice", "rose", "amber", "mint", "violet"] as const;
export const WALLPAPERS = ["void", "aurora", "grid", "dots", "stars", "silk"] as const;
export const BUBBLES = ["gradient", "solid", "outline"] as const;
export const TEXT_SIZES = ["sm", "md", "lg"] as const;
export const EFFECT_LEVELS = ["full", "lite", "off"] as const;
export const SOUND_PACKS = ["chime", "pop", "bell", "silent"] as const;

export type Prefs = {
  // privacy (enforced by the server)
  readReceipts: boolean;
  showLastSeen: boolean;
  showOnline: boolean;
  typingIndicator: boolean;
  // appearance & behaviour (synced across devices)
  accent: (typeof ACCENTS)[number];
  wallpaper: (typeof WALLPAPERS)[number];
  bubbles: (typeof BUBBLES)[number];
  textSize: (typeof TEXT_SIZES)[number];
  effects: (typeof EFFECT_LEVELS)[number];
  compact: boolean;
  sounds: boolean;
  soundPack: (typeof SOUND_PACKS)[number];
  notifications: boolean;
  enterToSend: boolean;
};

export const DEFAULT_PREFS: Prefs = {
  readReceipts: true, showLastSeen: true, showOnline: true, typingIndicator: true,
  accent: "pearl", wallpaper: "void", bubbles: "gradient", textSize: "md", effects: "full", compact: false,
  sounds: true, soundPack: "chime", notifications: false, enterToSend: true,
};

const oneOf = <T extends readonly string[]>(list: T, v: unknown, fallback: T[number]): T[number] =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? v : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/** Keeps only known keys with valid values; anything missing or malformed falls back to `base`. */
export function sanitizePrefs(input: unknown, base: Prefs = DEFAULT_PREFS): Prefs {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    readReceipts: bool(i.readReceipts, base.readReceipts),
    showLastSeen: bool(i.showLastSeen, base.showLastSeen),
    showOnline: bool(i.showOnline, base.showOnline),
    typingIndicator: bool(i.typingIndicator, base.typingIndicator),
    accent: oneOf(ACCENTS, i.accent, base.accent),
    wallpaper: oneOf(WALLPAPERS, i.wallpaper, base.wallpaper),
    bubbles: oneOf(BUBBLES, i.bubbles, base.bubbles),
    textSize: oneOf(TEXT_SIZES, i.textSize, base.textSize),
    effects: oneOf(EFFECT_LEVELS, i.effects, base.effects),
    compact: bool(i.compact, base.compact),
    sounds: bool(i.sounds, base.sounds),
    soundPack: oneOf(SOUND_PACKS, i.soundPack, base.soundPack),
    notifications: bool(i.notifications, base.notifications),
    enterToSend: bool(i.enterToSend, base.enterToSend),
  };
}
