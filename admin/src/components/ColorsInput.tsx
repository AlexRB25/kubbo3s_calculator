"use client";

import { useState } from "react";
import { Swatch } from "./Swatch";

/**
 * Colours of a catalog filament: the main one first and as many more as a bicolor, tricolor or
 * rainbow needs, plus whether it glows in the dark. They travel with the form as repeated `colors`
 * fields and a `glow` checkbox.
 */
export function ColorsInput({ defaultColors, defaultGlow }: { defaultColors: string[]; defaultGlow: boolean }) {
  const [colors, setColors] = useState(defaultColors.length ? defaultColors : ["#9a9aa8"]);
  const [glow, setGlow] = useState(defaultGlow);

  return (
    <div className="label">
      Colores (para las listas)
      <div className="flex flex-wrap items-center gap-2">
        <Swatch colors={colors} glow={glow} className="size-11 shrink-0 rounded-lg border border-line" />
        {colors.map((color, index) => (
          <span key={index} className="flex items-center gap-1">
            <input
              name="colors"
              type="color"
              value={color}
              aria-label={index === 0 ? "Color principal" : `Color ${index + 1}`}
              className="input h-11 w-14 p-1"
              onChange={(event) => setColors(colors.map((item, at) => (at === index ? event.target.value : item)))}
            />
            {colors.length > 1 && (
              <button
                type="button"
                className="btn size-7 p-0 text-xs"
                aria-label={`Quitar color ${index + 1}`}
                onClick={() => setColors(colors.filter((_, at) => at !== index))}
              >
                ✕
              </button>
            )}
          </span>
        ))}
        {colors.length < 12 && (
          <button type="button" className="btn px-3 py-2 text-xs" onClick={() => setColors([...colors, colors[colors.length - 1]])}>
            + Color
          </button>
        )}
      </div>
      <label className="flex items-center gap-2 font-normal">
        <input name="glow" type="checkbox" checked={glow} onChange={(event) => setGlow(event.target.checked)} />
        Fosforescente (brilla en la oscuridad)
      </label>
      {colors.length > 1 && <span className="font-normal">El primero es el principal: con él se compara el color que trae el archivo laminado.</span>}
    </div>
  );
}
