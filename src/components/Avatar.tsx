import { Users } from "lucide-react";
import type { User } from "@/lib/types";

/** A profile photo when there is one, otherwise a monogram. Tone derives from the name so people stay distinguishable. */
export function Avatar({
  user, size = 40, online, group, className = "", ring = true,
}: {
  user?: Pick<User, "displayName"> & { avatar?: string | null };
  size?: number; /** presence dot shows only when passed */ online?: boolean; group?: boolean; className?: string; ring?: boolean;
}) {
  const name = user?.displayName ?? "?";
  const tone = 11 + ([...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 10);
  const photo = !group && user?.avatar;
  return (
    <span className={`relative inline-grid shrink-0 place-items-center rounded-full text-white select-none ${className}`}
      style={{ width: size, height: size, background: `radial-gradient(circle at 30% 22%, hsl(0 0% ${tone + 16}%), hsl(0 0% ${tone - 6}%) 75%)`,
        boxShadow: ring ? "0 0 0 1px rgb(255 255 255 / .2) inset, 0 6px 18px -8px #000" : undefined, fontFamily: "var(--font-display)", fontSize: size * 0.44, fontWeight: 500 }}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" draggable={false} className="absolute inset-0 h-full w-full rounded-full object-cover" />
      ) : group ? <Users size={size * 0.42} strokeWidth={1.5} /> : name.trim().slice(0, 1).toUpperCase()}
      {photo && ring && <span className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_1px_rgb(255_255_255/.2)_inset]" />}
      {online !== undefined && (
        <span className="absolute right-0 bottom-0 rounded-full border-2 border-black"
          style={{ width: Math.max(9, size * 0.27), height: Math.max(9, size * 0.27), background: online ? "#fff" : "#2b2b2f",
            animation: online ? "pulse-ring 2s infinite" : undefined }} />
      )}
    </span>
  );
}
