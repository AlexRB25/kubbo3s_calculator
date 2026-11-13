"use client";

import { useEffect } from "react";

/** The 3D scanner moved to the tools site; old links (and Stripe's return with ?session_id) go on there. */
export default function ScannerMoved() {
  useEffect(() => {
    window.location.replace(`${process.env.PB_TOOLS_URL}/escaner${window.location.search}`);
  }, []);
  return <p className="text-sm text-muted">El Escáner 3D ahora está en Herramientas 3D. Abriéndolo…</p>;
}
