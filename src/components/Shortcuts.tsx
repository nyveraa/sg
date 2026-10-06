"use client";

import { Modal } from "./Modal";

const KEYS: [string, string][] = [
  ["Ctrl / ⌘ + K", "Command palette — jump anywhere"],
  ["Alt + 1 / 2 / 3", "Chats · Moments · Friends"],
  ["Alt + ↑ / ↓", "Previous / next conversation"],
  ["?", "This list"],
  ["/", "Slash commands in the message box"],
  ["Enter", "Send (Shift + Enter for a new line)"],
  ["Esc", "Close a popup, search, or story"],
  ["← / →", "Previous / next story"],
  ["Space", "Pause a story"],
];

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Shortcuts" eyebrow="Keyboard" width={460}>
      <dl className="divide-y divide-white/[0.07]">
        {KEYS.map(([k, d]) => (
          <div key={k} className="flex items-center justify-between gap-6 py-3.5">
            <dt className="text-[14px] text-white/80">{d}</dt>
            <dd><kbd className="whitespace-nowrap rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 font-mono text-[11.5px]">{k}</kbd></dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
