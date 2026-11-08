"use client";

import { useState } from "react";
import { Courses, Docs } from "@/components/app/Learn";
import { PageHeader } from "@/components/app/ui";
import { GUIDES, MATERIALS, type Guide } from "@/lib/guides";

const CATEGORIES = ["Todas", ...new Set(GUIDES.map((guide) => guide.category))] as const;

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h4>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function GuideCard({ guide }: { guide: Guide }) {
  return (
    <details className="card group">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <span className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-brand">{guide.category}</span>
          <span className="font-semibold">{guide.title}</span>
          <span className="text-sm text-muted">{guide.summary}</span>
        </span>
        <span className="mt-1 text-muted transition group-open:rotate-90" aria-hidden>
          ›
        </span>
      </summary>
      <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
        <List title="Cuándo hacerla" items={guide.when} />
        <List title="Cómo hacerla" items={guide.steps} />
        <List title="Cómo leer el resultado" items={guide.read} />
        {guide.tip && <p className="rounded-lg bg-brand/10 p-3 text-sm">💡 {guide.tip}</p>}
      </div>
    </details>
  );
}

const TABS = [
  { value: "cursos", label: "Cursos" },
  { value: "guias", label: "Guías" },
  { value: "calibracion", label: "Calibración" },
  { value: "materiales", label: "Materiales" },
] as const;

export default function LearnPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("cursos");
  return (
    <>
      <PageHeader title="Aprende" />
      <p className="text-sm text-muted">Cursos, guías de parámetros y diseño, pruebas de calibración y valores por material para imprimir mejor.</p>
      <div className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((item) => (
          <button
            key={item.value}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${tab === item.value ? "border-brand text-brand" : "border-transparent text-muted hover:text-white"}`}
            onClick={() => setTab(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "cursos" && <Courses />}
      {tab === "guias" && <Docs />}
      {tab === "calibracion" && <Calibration />}
      {tab === "materiales" && <Materials />}
    </>
  );
}

function Calibration() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Todas");
  const shown = category === "Todas" ? GUIDES : GUIDES.filter((guide) => guide.category === category);

  return (
    <>
      <p className="text-sm text-muted">
        Pruebas de calibración para sacarle la mejor calidad a tu impresora y a cada filamento. Haz primero las básicas y repite las de material con cada
        carrete de marca nueva.
      </p>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((item) => (
          <button key={item} className={`btn ${category === item ? "border-brand text-brand" : ""}`} onClick={() => setCategory(item)}>
            {item}
          </button>
        ))}
      </div>

      <section className="grid gap-3 lg:grid-cols-2">
        {shown.map((guide) => (
          <GuideCard key={guide.id} guide={guide} />
        ))}
      </section>
    </>
  );
}

function Materials() {
  return (
    <>
      <section className="card flex flex-col gap-3">
        <div>
          <h2>Valores de inicio por material</h2>
          <p className="text-sm text-muted">Son un punto de partida: lo que diga el carrete de tu marca va primero, y la torre de temperatura decide.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="table table-scroll">
            <thead>
              <tr>
                <th>Material</th>
                <th>Boquilla</th>
                <th>Cama</th>
                <th>Ventilador</th>
                <th>Secado</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {MATERIALS.map((item) => (
                <tr key={item.material}>
                  <td className="font-semibold whitespace-nowrap">{item.material}</td>
                  <td className="whitespace-nowrap">{item.nozzle}</td>
                  <td className="whitespace-nowrap">{item.bed}</td>
                  <td className="whitespace-nowrap">{item.fan}</td>
                  <td className="whitespace-nowrap">{item.dry}</td>
                  <td className="min-w-64 text-muted">{item.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
