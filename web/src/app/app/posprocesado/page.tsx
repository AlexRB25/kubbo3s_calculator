"use client";

import { useState } from "react";
import { Empty, FieldsForm, Modal, PageHeader, TableCard, type FieldDef } from "@/components/app/ui";
import { useData } from "@/lib/data";
import { money } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { PostProcess } from "@/lib/types";

const FIELDS: FieldDef[] = [
  { name: "name", label: "Proceso", required: true, placeholder: "Lijado, pintado, pegado, armado…" },
  { name: "cost_per_hour", label: "Costo por hora ($)", type: "number", required: true, hint: "Lo que vale una hora de este trabajo: tu mano de obra y lo que gastas en él." },
  { name: "notes", label: "Notas", type: "textarea", placeholder: "Lija 220 y 400, primer, barniz…" },
];

/**
 * Hand jobs after printing (sanding, painting, gluing…) with what one hour of each costs. Each product
 * says how many minutes of each it takes and its cost adds up by itself.
 */
export default function PostProcessesPage() {
  const { postProcesses, products } = useData();
  const [editing, setEditing] = useState<PostProcess | "new" | null>(null);
  const current = editing === "new" ? undefined : (editing ?? undefined);
  const usedIn = (process: PostProcess) => products.filter((product) => product.processes?.some((use) => use.process_id === process.id));

  return (
    <>
      <PageHeader title="Posprocesado">
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          Nuevo proceso
        </button>
      </PageHeader>

      {postProcesses.length === 0 ? (
        <Empty>
          Da de alta los trabajos que haces a mano después de imprimir y lo que vale la hora de cada uno: lijado $100 por hora, pintado, pegado… Luego en cada
          producto (pestaña Costos) eliges el proceso y cuántos minutos lleva, y su costo se suma solo.
        </Empty>
      ) : (
        <TableCard>
          <table className="table">
            <thead>
              <tr>
                <th>Proceso</th>
                <th className="num">Por hora</th>
                <th className="num">Por minuto</th>
                <th>Se usa en</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {postProcesses.map((process) => {
                const used = usedIn(process);
                return (
                  <tr key={process.id}>
                    <td>
                      {process.name}
                      {process.notes && <span className="block text-xs text-muted">{process.notes}</span>}
                    </td>
                    <td className="num">{money(Number(process.cost_per_hour))}</td>
                    <td className="num text-muted">{money(Number(process.cost_per_hour) / 60)}</td>
                    <td className="text-sm text-muted">{used.length ? used.map((product) => product.name).join(", ") : "—"}</td>
                    <td className="num">
                      <button className="btn" onClick={() => setEditing(process)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}

      {editing && (
        <Modal title={current?.name ?? "Nuevo proceso"} onClose={() => setEditing(null)}>
          <FieldsForm
            fields={FIELDS}
            initial={current ?? { cost_per_hour: 0 }}
            onDone={() => setEditing(null)}
            onSubmit={(values) =>
              current ? supabase().from("post_processes").update(values).eq("id", current.id) : supabase().from("post_processes").insert(values)
            }
            onDelete={current ? () => supabase().from("post_processes").delete().eq("id", current.id) : undefined}
            deleteConfirm="Los productos que lo usan dejarán de sumar su costo. ¿Eliminar este proceso?"
          />
        </Modal>
      )}
    </>
  );
}
