"use client";

import { useState } from "react";
import { Empty, FieldsForm, Modal, PageHeader, TableCard, type FieldDef } from "@/components/app/ui";
import { useData, useSave } from "@/lib/data";
import { day, isoDay, money, weight } from "@/lib/format";
import { EXPENSE_CATEGORIES, EXPENSE_LABELS } from "@/lib/labels";
import { supabase } from "@/lib/supabase";
import type { Expense } from "@/lib/types";

export default function ExpensesPage() {
  const { expenses, suppliers, printers } = useData();
  const { error, save } = useSave();
  const [adding, setAdding] = useState(false);

  const fields: FieldDef[] = [
    { name: "category", label: "Categoría", type: "select", required: true, options: EXPENSE_CATEGORIES },
    { name: "amount", label: "Monto ($)", type: "number", required: true },
    { name: "note", label: "Concepto", placeholder: "Boquillas, cajas, recibo de luz…" },
    { name: "spent_at", label: "Fecha", type: "date", required: true },
    { name: "supplier_id", label: "Proveedor", type: "select", none: "Sin proveedor", options: suppliers.map((item) => ({ value: item.id, label: item.name })) },
    { name: "printer_id", label: "Impresora", type: "select", none: "Ninguna en particular", options: printers.map((item) => ({ value: item.id, label: item.name })) },
  ];

  function remove(expense: Expense) {
    // The maintenance record owns its expense; deleting it there removes both.
    if (expense.maintenance_id) {
      if (window.confirm("Este gasto viene de un mantenimiento. Se eliminará también del historial de la impresora. ¿Eliminar?")) {
        save(() => supabase().from("maintenance").delete().eq("id", expense.maintenance_id!));
      }
      return;
    }
    const warning = expense.grams ? `Se descontarán ${weight(expense.grams)} de ese filamento. ¿Eliminar?` : "¿Eliminar este gasto?";
    if (window.confirm(warning)) save(() => supabase().from("expenses").delete().eq("id", expense.id));
  }

  return (
    <>
      <PageHeader title="Gastos">
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          Nuevo gasto
        </button>
      </PageHeader>
      <p className="text-sm text-muted">
        Las compras de filamento se registran desde Filamento y los mantenimientos desde Impresoras; ambos aparecen aquí solos.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {expenses.length === 0 ? (
        <Empty>Aquí aparecen tus compras de filamento, mantenimientos y cualquier otro gasto que registres.</Empty>
      ) : (
        <TableCard>
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto</th>
                <th>Categoría</th>
                <th>Proveedor</th>
                <th className="num">Monto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td className="whitespace-nowrap text-muted">{day(expense.spent_at)}</td>
                  <td>{expense.note || "—"}</td>
                  <td className="text-muted">{EXPENSE_LABELS[expense.category]}</td>
                  <td className="text-muted">{suppliers.find((item) => item.id === expense.supplier_id)?.name ?? "—"}</td>
                  <td className="num">{money(expense.amount)}</td>
                  <td className="num">
                    <button className="btn btn-danger" onClick={() => remove(expense)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {adding && (
        <Modal title="Nuevo gasto" onClose={() => setAdding(false)}>
          <FieldsForm
            fields={fields}
            initial={{ category: "parts", spent_at: isoDay() }}
            submitLabel="Registrar gasto"
            onDone={() => setAdding(false)}
            onSubmit={(values) => supabase().from("expenses").insert(values)}
          />
        </Modal>
      )}
    </>
  );
}
