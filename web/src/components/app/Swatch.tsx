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

/** Edits the colours of a filament (at least one, the main one first) and whether it glows in the dark. */
export function ColorsField({
  colors,
  onColors,
  glow,
  onGlow,
}: {
  colors: string[];
  onColors: (colors: string[]) => void;
  glow: boolean;
  onGlow: (glow: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {colors.map((color, index) => (
          <span key={index} className="flex items-center gap-1">
            <input
              className="input h-11 w-14 p-1"
              type="color"
              value={color}
              aria-label={index === 0 ? "Color principal" : `Color ${index + 1}`}
              onChange={(event) => onColors(colors.map((item, at) => (at === index ? event.target.value : item)))}
            />
            {colors.length > 1 && (
              <button
                type="button"
                className="btn size-7 p-0 text-xs"
                aria-label={`Quitar color ${index + 1}`}
                onClick={() => onColors(colors.filter((_, at) => at !== index))}
              >
                ✕
              </button>
            )}
          </span>
        ))}
        {colors.length < 12 && (
          <button type="button" className="btn px-3 py-2 text-xs" onClick={() => onColors([...colors, colors[colors.length - 1]])}>
            + Color
          </button>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm font-normal">
        <input type="checkbox" checked={glow} onChange={(event) => onGlow(event.target.checked)} />
        Fosforescente (brilla en la oscuridad)
      </label>
    </div>
  );
}
