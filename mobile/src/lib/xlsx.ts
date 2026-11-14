// Same file in web/src/lib and mobile/src/lib: keep them identical.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/** A sheet to write: its rows of cells and, optionally, each column's width in characters. */
export type Sheet = { name: string; rows: (string | number)[][]; widths?: number[] };

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const unescape = (text: string) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/_x000D_/g, '');

/** "A" → 0, "AB" → 27. */
const columnIndex = (letters: string) => [...letters.toUpperCase()].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
const columnName = (index: number): string => (index < 26 ? '' : columnName(Math.floor(index / 26) - 1)) + String.fromCharCode(65 + (index % 26));

/** A small .xlsx book (text and numbers; the first row of each sheet in bold) that Excel, Google Sheets and Numbers open. */
export function writeXlsx(sheets: Sheet[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const add = (path: string, xml: string) => (files[path] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xml}`));
  add(
    '[Content_Types].xml',
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
      .map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join('')}</Types>`,
  );
  add(
    '_rels/.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  add(
    'xl/workbook.xml',
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
      .map((sheet, index) => `<sheet name="${escape(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
      .join('')}</sheets></workbook>`,
  );
  add(
    'xl/_rels/workbook.xml.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)
      .join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  add(
    'xl/styles.xml',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  );
  sheets.forEach((sheet, index) => {
    const cols = sheet.widths?.length ? `<cols>${sheet.widths.map((width, column) => `<col min="${column + 1}" max="${column + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>` : '';
    const rows = sheet.rows
      .map(
        (row, rowIndex) =>
          `<row r="${rowIndex + 1}">${row
            .map((value, column) => {
              const ref = `${columnName(column)}${rowIndex + 1}`;
              const style = rowIndex === 0 ? ' s="1"' : ' s="2"';
              if (typeof value === 'number') return `<c r="${ref}"${style}><v>${value}</v></c>`;
              return value === '' ? '' : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
            })
            .join('')}</row>`,
      )
      .join('');
    add(`xl/worksheets/sheet${index + 1}.xml`, `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>`);
  });
  return zipSync(files);
}

/** The texts of a shared-strings or inline cell, leaving out phonetic hints. */
const textsOf = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => unescape(match[1])).join('');

const attr = (attrs: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1];

/** The first sheet of an .xlsx book as rows of text. */
function readXlsx(bytes: Uint8Array): string[][] {
  const zip = unzipSync(bytes);
  const text = (path: string) => (zip[path] ? strFromU8(zip[path]) : '');
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => textsOf(match[1]));
  // The first sheet of the book, wherever the workbook says it lives.
  const firstId = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(text('xl/workbook.xml'))?.[1];
  const target = firstId ? new RegExp(`<Relationship\\b[^>]*\\bId="${firstId}"[^>]*\\bTarget="([^"]+)"`).exec(text('xl/_rels/workbook.xml.rels'))?.[1] : undefined;
  const path = target ? (target.startsWith('/') ? target.slice(1) : `xl/${target}`) : 'xl/worksheets/sheet1.xml';
  const sheet = text(path) || text('xl/worksheets/sheet1.xml');
  const rows: string[][] = [];
  let nextRow = 0;
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(attr(rowMatch[1], 'r') ?? nextRow + 1) - 1;
    nextRow = rowNumber + 1;
    const row: string[] = [];
    let nextColumn = 0;
    for (const cell of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cell[1], 'r');
      const column = ref ? columnIndex(ref.replace(/\d+/g, '')) : nextColumn;
      nextColumn = column + 1;
      const type = attr(cell[1], 't');
      const body = cell[2] ?? '';
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = textsOf(body);
      else if (type === 'b') value = raw === '1' ? 'sí' : 'no';
      else if (raw !== undefined) value = unescape(raw);
      row[column] = value;
    }
    rows[rowNumber] = Array.from(row, (value) => value ?? '');
  }
  return Array.from(rows, (row) => row ?? []);
}

/** A CSV file (comma or semicolon, quotes allowed) as rows of text. */
function readCsv(content: string): string[][] {
  const text = content.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const separator = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

/** Rows of text from an .xlsx book (its first sheet) or a .csv file. */
export function readTable(bytes: Uint8Array): string[][] {
  const zipped = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const rows = zipped ? readXlsx(bytes) : readCsv(strFromU8(bytes));
  return rows.map((row) => row.map((value) => value.trim()));
}
