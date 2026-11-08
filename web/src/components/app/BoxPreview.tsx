"use client";

import { useEffect, useRef, useState } from "react";
import { BOX_COLORS, boxFaces } from "@/lib/box3d";
import type { BoxMaterial, BoxStyle } from "@/lib/types";

type Props = { length_mm: number; width_mm: number; height_mm: number; style?: BoxStyle; material?: BoxMaterial; size?: number; controls?: boolean };

const cm = (mm: number) => `${Math.round(Number(mm)) / 10}`.replace(/\.0$/, "");

/** The box in 3D at its real proportions: it turns by itself and opens or closes with a tap. */
export function BoxPreview({ length_mm, width_mm, height_mm, style = "rsc", material = "kraft", size = 220, controls = true }: Props) {
  const [yaw, setYaw] = useState(0.6);
  const [open, setOpen] = useState(0);
  const [opened, setOpened] = useState(false);
  const [spinning, setSpinning] = useState(true);
  const target = useRef(0);

  useEffect(() => {
    target.current = opened ? 1 : 0;
  }, [opened]);

  useEffect(() => {
    // Respect "reduce motion": the box stays still unless the user turns it on.
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (spinning && !still) setYaw((value) => value + dt * 0.7);
      setOpen((value) => {
        const goal = target.current;
        if (Math.abs(goal - value) < 0.01) return goal;
        return value + Math.sign(goal - value) * Math.min(Math.abs(goal - value), dt * 1.8);
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [spinning]);

  const colors = BOX_COLORS[material] ?? BOX_COLORS.kraft;
  const faces = boxFaces({ length: Number(length_mm), width: Number(width_mm), height: Number(height_mm) }, style, yaw, open, size, colors);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Caja de ${cm(length_mm)} × ${cm(width_mm)} × ${cm(height_mm)} cm`}
        className="cursor-pointer rounded-2xl bg-raised/40"
        onClick={() => setOpened((value) => !value)}
      >
        {faces.map((face, index) => (
          <polygon key={index} points={face.points} fill={face.fill} stroke={colors.edge} strokeWidth={1} strokeLinejoin="round" />
        ))}
      </svg>
      <p className="text-sm font-semibold tabular-nums">
        {cm(length_mm)} × {cm(width_mm)} × {cm(height_mm)} cm
        <span className="ml-1 font-normal text-muted">(largo × ancho × alto)</span>
      </p>
      {controls && (
        <div className="flex gap-2">
          <button type="button" className="btn py-1 text-xs" onClick={() => setOpened((value) => !value)}>
            {opened ? "Cerrar" : "Abrir"}
          </button>
          <button type="button" className="btn py-1 text-xs" onClick={() => setSpinning((value) => !value)}>
            {spinning ? "Detener" : "Girar"}
          </button>
        </div>
      )}
    </div>
  );
}
