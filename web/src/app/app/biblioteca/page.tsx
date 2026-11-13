"use client";

import { useEffect } from "react";

/** Aprende moved to the tools site; old links go on there. */
export default function LearnMoved() {
  useEffect(() => {
    window.location.replace(`${process.env.PB_TOOLS_URL}/aprende`);
  }, []);
  return <p className="text-sm text-muted">Aprende ahora está en Herramientas 3D. Abriéndolo…</p>;
}
