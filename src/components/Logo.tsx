/** The onyx symbol: a cut black stone drawn as hairline facets. Monochrome; inherits currentColor. */
export function Mark({ size = 28, draw = false, className = "" }: { size?: number; draw?: boolean; className?: string }) {
  const p = draw ? { pathLength: 1, style: { strokeDasharray: 1, strokeDashoffset: 1, animation: "draw 1.8s cubic-bezier(.6,0,.2,1) forwards" } } : {};
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="miter" aria-hidden className={className}>
      <path d="M15 8h18l10 11-19 21L5 19z" {...p} />
      <path d="M5 19h38" {...p} />
      <path d="M15 8l5 11 4 21M33 8l-5 11-4 21M20 19l4-11 4 11" {...p} />
    </svg>
  );
}

/** Lowercase serif wordmark with a full stop: "onyx." */
export function Wordmark({ size = 26, mark = true, className = "" }: { size?: number; mark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {mark && <Mark size={size * 1.05} />}
      <span className="font-display leading-none" style={{ fontSize: size, letterSpacing: "-0.02em", fontWeight: 500 }}>onyx<span className="opacity-60">.</span></span>
    </span>
  );
}
