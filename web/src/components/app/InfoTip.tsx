"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const WIDTH = 288;

/**
 * An (i) that shows a small card with details while the pointer is over it (tap to open on a phone).
 * The card is drawn over the page, so tables that scroll do not cut it.
 */
export function InfoTip({ children, label = "Ver detalle" }: { children: ReactNode; label?: string }) {
  const icon = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  const show = () => icon.current && setBox(icon.current.getBoundingClientRect());
  const hide = () => setBox(null);

  // Below the icon, or above it when there is no room; never off the sides of the window.
  const below = box ? box.bottom + 280 < window.innerHeight : true;
  const left = box ? Math.max(8, Math.min(window.innerWidth - WIDTH - 8, box.right - WIDTH)) : 0;

  return (
    <>
      <button
        ref={icon}
        type="button"
        aria-label={label}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => (box ? hide() : show())}
        className="ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-line align-middle text-[11px] font-bold text-muted hover:border-brand hover:text-brand"
      >
        i
      </button>
      {box &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-50 flex flex-col gap-1 rounded-lg border border-line bg-panel p-3 text-left text-xs text-white shadow-xl"
            style={{ width: WIDTH, left, ...(below ? { top: box.bottom + 6 } : { top: box.top - 6, transform: "translateY(-100%)" }) }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

/** A label and its value on one line of an InfoTip. */
export function TipLine({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <p className={`flex justify-between gap-3 ${strong ? "border-t border-line pt-1 font-semibold" : ""} ${tone ?? ""}`}>
      <span className={strong ? "" : "text-muted"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </p>
  );
}
