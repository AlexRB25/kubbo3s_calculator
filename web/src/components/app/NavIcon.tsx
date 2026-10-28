/** A circle as path data, so every icon is a single stroked path. */
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** Line icons of the panel's pages (24×24, stroked). */
const PATHS = {
  resumen: "M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z",
  inventario: "M9 3h6v4H9z M9 5H6a1 1 0 0 0-1 1v15h14V6a1 1 0 0 0-1-1h-3 M9 12h6 M9 16h6",
  productos: "M12 2l9 5v10l-9 5-9-5V7z M3 7l9 5 9-5 M12 12v10",
  catalogo: "M3 9l1.5-5h15L21 9 M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3 M5 12v9h14v-9 M10 21v-5h4v5",
  filamento: `${circle(12, 12, 9)} ${circle(12, 12, 3)} M12 3v6 M12 15v6`,
  insumos: "M12 2l10 5-10 5L2 7z M2 12l10 5 10-5 M2 17l10 5 10-5",
  impresiones: "M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z",
  ventas: "M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  gastos: "M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2z M9 7h6 M9 11h6 M9 15h4",
  embalaje: "M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10 M7.5 5l9 4",
  paqueterias: `M1 4h14v12H1z M15 8h4l4 4v4h-8 ${circle(5.5, 18.5, 2)} ${circle(18.5, 18.5, 2)}`,
  archivos: "M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  impresoras: "M4 3h16v18H4z M4 8h16 M10 8v5l2 2 2-2V8 M8 18h8",
  proveedores: "M3 21h18 M5 21V7l7-4 7 4v14 M9 21v-6h6v6 M9 10h.01 M15 10h.01",
  canales: "M3 11l18-8v18L3 13z M7 12.5V18a2 2 0 0 0 4 0v-3.5",
  equipo: `M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 ${circle(9, 7, 4)} M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8`,
  ajustes: "M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6",
  herramientas: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z",
  modelos: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M12 11l4 2v4l-4 2-4-2v-4z M8 13l4 2 4-2 M12 15v4",
  tienda: "M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  cerrar: "M18 6L6 18 M6 6l12 12",
  salir: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
} as const;

export type NavIconName = keyof typeof PATHS;

export function NavIcon({ name, size = 20, className }: { name: NavIconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
