"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

/** Popup: a gradient-hairline slab that tips up into view on a 3D axis. Esc / backdrop closes. */
export function Modal({
  open, onClose, title, eyebrow, children, width = 460,
}: { open: boolean; onClose: () => void; title?: string; eyebrow?: string; children: ReactNode; width?: number }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[100] grid place-items-center p-4 [perspective:1400px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
          <motion.div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
            className="card relative w-full shadow-[0_50px_140px_-30px_#000] outline-none" style={{ maxWidth: width, transformOrigin: "50% 100%", borderRadius: 28 }}
            initial={{ opacity: 0, rotateX: -24, y: 40, scale: 0.97 }} animate={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }} exit={{ opacity: 0, rotateX: 10, y: 18 }}
            transition={{ type: "spring", stiffness: 240, damping: 26 }}>
            <div className="max-h-[92dvh] overflow-y-auto p-7">
              {title && (
                <div className="mb-7 flex items-start justify-between gap-4">
                  <div>
                    {eyebrow && <div className="label mb-2">{eyebrow}</div>}
                    <h2 className="display text-[34px]">{title}</h2>
                  </div>
                  <button onClick={onClose} aria-label="Close" className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/14 text-mute transition hover:border-white hover:text-white"><X size={15} /></button>
                </div>
              )}
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
