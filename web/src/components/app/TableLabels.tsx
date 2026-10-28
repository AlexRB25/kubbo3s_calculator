"use client";

import { useEffect } from "react";

/** Copies each table's header text to its cells as data-label, so on phones a row reads as "Costo · $35.12" (see globals.css). */
function label(root: ParentNode) {
  for (const table of root.querySelectorAll<HTMLTableElement>("table.table:not(.table-scroll)")) {
    const headers: string[] = [];
    for (const th of table.querySelectorAll<HTMLTableCellElement>("thead tr:first-child th")) {
      for (let span = 0; span < th.colSpan; span++) headers.push(th.textContent?.trim() ?? "");
    }
    for (const row of table.querySelectorAll<HTMLTableRowElement>("tbody tr")) {
      let column = 0;
      for (const cell of row.cells) {
        const text = headers[column] ?? "";
        if (cell.dataset.label !== text) cell.dataset.label = text;
        column += cell.colSpan;
      }
    }
  }
}

export function TableLabels() {
  useEffect(() => {
    label(document);
    // Tables render after their data loads and change with filters: label them again on every change of the page.
    const observer = new MutationObserver(() => label(document));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
