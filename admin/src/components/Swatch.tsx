import type { CSSProperties, ReactNode } from "react";

/** One colour fills it; more go in diagonal bands: half and half for a bicolor, thirds for a tricolor… */
export function swatchBackground(colors: string[]) {
  if (colors.length < 2) return colors[0] ?? "transparent";
  const step = 100 / colors.length;
  const bands = colors.map((color, index) => `${color} ${(index * step).toFixed(2)}% ${((index + 1) * step).toFixed(2)}%`);
  return `linear-gradient(135deg, ${bands.join(", ")})`;
}

/** The colour of a filament: its bands and, when it glows in the dark, a soft pulsing glow. */
export function Swatch({ colors, glow = false, className = "", children }: { colors: string[]; glow?: boolean; className?: string; children?: ReactNode }) {
  return (
    <span
      className={`${className} ${glow ? "swatch-glow" : ""}`}
      style={{ background: swatchBackground(colors), "--glow": colors[0] } as CSSProperties}
      title={glow ? "Fosforescente" : undefined}
    >
      {children}
    </span>
  );
}
