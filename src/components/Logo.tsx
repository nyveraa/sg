/** The name, typed out — no symbol. Cormorant Garamond, semibold, tightly set. */
export function Wordmark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`font-wordmark leading-none ${className}`} style={{ fontSize: size, fontWeight: 600, letterSpacing: "0.005em" }}>
      Whisper
    </span>
  );
}
