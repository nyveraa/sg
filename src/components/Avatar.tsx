import { Users } from "lucide-react";
import type { User } from "@/lib/types";

/** Round monogram in a thin ring. Tone derives from the name so people stay distinguishable without colour. */
export function Avatar({
  user, size = 40, online, group, className = "", ring = true,
}: { user?: Pick<User, "displayName">; size?: number; /** presence dot shows only when passed */ online?: boolean; group?: boolean; className?: string; ring?: boolean }) {
  const name = user?.displayName ?? "?";
  const tone = 11 + ([...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 10);
  return (
    <span className={`relative inline-grid shrink-0 place-items-center rounded-full text-white select-none ${className}`}
      style={{ width: size, height: size, background: `radial-gradient(circle at 30% 22%, hsl(0 0% ${tone + 16}%), hsl(0 0% ${tone - 6}%) 75%)`,
        boxShadow: ring ? "0 0 0 1px rgb(255 255 255 / .2) inset, 0 6px 18px -8px #000" : undefined, fontFamily: "var(--font-display)", fontSize: size * 0.44, fontWeight: 500 }}>
      {group ? <Users size={size * 0.42} strokeWidth={1.5} /> : name.trim().slice(0, 1).toUpperCase()}
      {online !== undefined && (
        <span className="absolute right-0 bottom-0 rounded-full border-2 border-black"
          style={{ width: Math.max(9, size * 0.27), height: Math.max(9, size * 0.27), background: online ? "#fff" : "#2b2b2f",
            animation: online ? "pulse-ring 2s infinite" : undefined }} />
      )}
    </span>
  );
}
