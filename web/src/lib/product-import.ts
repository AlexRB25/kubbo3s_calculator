// Same file in web/src/lib and mobile/src/lib: keep them identical.
import type { Sheet } from './xlsx';

/** Basic data of a product, read from one row of the quick-load spreadsheet. Empty cells stay undefined. */
export type ImportRow = {
  /** Row number in the spreadsheet, as the user sees it. */
  line: number;
  name?: string;
  sku?: string;
  description?: string;
  categories?: string[];
  /** File names (picked with the spreadsheet) or web links. */
  photos: string[];
  stock?: number;
  extraCost?: number;
  /** Price by channel id. */
  prices: Record<string, number>;
  inCatalog?: boolean;
  /** The product it updates (same SKU, or same name when there is no SKU). */
  existingId?: string;
  error?: string;
};

type Named = { id: string; name: string };
type Existing = Named & { sku: string };

/** Lower case without accents or extra spaces, to match headers and names. */
const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** "1,234.50", "$85", "85.5" → number; undefined when it is not one. */
function amount(text: string) {
  const clean = text.replace(/[$\s]/g, '');
  const value = Number(/,\d{1,2}$/.test(clean) && !clean.includes('.') ? clean.replace(',', '.') : clean.replace(/,/g, ''));
  return Number.isFinite(value) ? value : undefined;
}

const COLUMNS = {
  name: ['nombre', 'nombre del producto', 'producto'],
  sku: ['sku', 'sku o clave', 'clave', 'codigo'],
  description: ['descripcion'],
  categories: ['categorias', 'categoria'],
  photos: ['fotos', 'foto', 'imagenes', 'imagen'],
  stock: ['stock inicial', 'stock', 'existencia', 'productos que ya tienes'],
  extraCost: ['costo extra', 'posprocesado', 'posprocesado y otros costos', 'otros costos'],
  inCatalog: ['mostrar en catalogo', 'catalogo', 'en catalogo'],
} as const;

/** The quick-load template: a sheet to fill (with one example row) and a sheet of instructions. */
export function templateSheets(channels: Named[]): Sheet[] {
  const header = ['Nombre', 'SKU', 'Descripción', 'Categorías', 'Fotos', 'Stock inicial', 'Costo extra', ...channels.map((channel) => `Precio ${channel.name}`), 'Mostrar en catálogo'];
  const example = ['Maceta geométrica', 'MAC-001', 'Maceta de 10 cm con plato', 'Macetas, Decoración', 'maceta-1.jpg, maceta-2.jpg', 5, 12, ...channels.map(() => 150), 'sí'];
  return [
    { name: 'Productos', rows: [header, example], widths: [28, 14, 40, 26, 30, 12, 12, ...channels.map(() => 16), 18] },
    {
      name: 'Instrucciones',
      widths: [24, 90],
      rows: [
        ['Columna', 'Qué va'],
        ['Nombre', 'Obligatorio. Un producto por fila; borra la fila de ejemplo.'],
        ['SKU', 'Opcional. Si ya tienes un producto con ese SKU (o con ese nombre, si no pones SKU), se actualiza en vez de crear otro.'],
        ['Descripción', 'Se muestra en tu catálogo.'],
        ['Categorías', 'Varias separadas por coma: Macetas, Decoración.'],
        ['Fotos', 'Nombres de archivo separados por coma (maceta-1.jpg) y al importar eliges esas fotos; o enlaces https:// a la imagen. La primera es la portada.'],
        ['Stock inicial', 'Solo para productos nuevos. El de los que ya existen se corrige con «Arquear» en Inventario.'],
        ['Costo extra', 'Posprocesado y otros costos por producto ($).'],
        ['Precio …', 'Una columna por canal de venta. Vacío = usa el precio sugerido.'],
        ['Mostrar en catálogo', 'sí o no (vacío = sí).'],
        ['', 'Las celdas vacías no cambian nada en los productos que ya existen. Filamentos, impresoras y placas se agregan después en cada producto (pestaña Impresión) para calcular su costo.'],
      ],
    },
  ];
}

/** Reads the rows of the spreadsheet: which column is which, and whether each row creates or updates a product. */
export function parseImport(table: string[][], channels: Named[], products: Existing[]): { rows: ImportRow[]; error?: string } {
  const headerIndex = table.findIndex((row) => row.some((cell) => COLUMNS.name.includes(plain(cell) as never)));
  if (headerIndex < 0) return { rows: [], error: 'No encontré la columna «Nombre». Usa la plantilla (la primera fila son los títulos).' };
  const header = table[headerIndex].map(plain);
  const find = (names: readonly string[]) => header.findIndex((cell) => names.includes(cell));
  const at = Object.fromEntries(Object.entries(COLUMNS).map(([key, names]) => [key, find(names)])) as Record<keyof typeof COLUMNS, number>;
  const priceColumns = channels.flatMap((channel) => {
    const index = header.findIndex((cell) => cell === plain(`precio ${channel.name}`) || cell === plain(channel.name));
    return index >= 0 ? [{ channel: channel.id, index }] : [];
  });
  const seen = new Map<string, number>();
  const rows: ImportRow[] = [];
  table.slice(headerIndex + 1).forEach((cells, offset) => {
    if (!cells.some(Boolean)) return;
    const cell = (index: number) => (index >= 0 && cells[index] ? cells[index] : undefined);
    const line = headerIndex + offset + 2;
    const row: ImportRow = { line, photos: [], prices: {} };
    row.name = cell(at.name);
    row.sku = cell(at.sku);
    row.description = cell(at.description);
    const categories = cell(at.categories);
    if (categories) row.categories = [...new Set(categories.split(/[,;]/).map((name) => name.trim()).filter(Boolean))];
    row.photos = (cell(at.photos) ?? '').split(/[,;\n]/).map((name) => name.trim()).filter(Boolean);
    const problems: string[] = [];
    const number = (index: number, label: string) => {
      const text = cell(index);
      if (text === undefined) return undefined;
      const value = amount(text);
      if (value === undefined || value < 0) problems.push(`${label} no es un número`);
      return value !== undefined && value >= 0 ? value : undefined;
    };
    const stock = number(at.stock, 'Stock inicial');
    if (stock !== undefined) row.stock = Math.round(stock);
    row.extraCost = number(at.extraCost, 'Costo extra');
    for (const { channel, index } of priceColumns) {
      const price = number(index, `Precio ${channels.find((item) => item.id === channel)?.name}`);
      if (price !== undefined && price > 0) row.prices[channel] = price;
    }
    const catalog = cell(at.inCatalog);
    if (catalog) row.inCatalog = !['no', 'n', 'false', 'falso', '0'].includes(plain(catalog));
    const existing = row.sku
      ? products.find((product) => product.sku && plain(product.sku) === plain(row.sku!))
      : row.name
        ? products.find((product) => plain(product.name) === plain(row.name!))
        : undefined;
    row.existingId = existing?.id;
    if (!row.name && !existing) problems.push('falta el nombre');
    const key = plain(row.sku || row.name || '');
    if (key && seen.has(key)) problems.push(`repite el producto de la fila ${seen.get(key)}`);
    else if (key) seen.set(key, line);
    if (problems.length) row.error = problems.join(', ');
    rows.push(row);
  });
  if (!rows.length) return { rows, error: 'La hoja no tiene productos debajo de los títulos.' };
  return { rows };
}

/** Whether a photo entry is a web link (otherwise it is a file name). */
export const isLink = (photo: string) => /^https?:\/\//i.test(photo);

/** The file name of a photo entry, to match it with the picked files ("fotos/Maceta 1.JPG" → "maceta 1.jpg"). */
export const photoKey = (name: string) => plain(name.split(/[\\/]/).pop() ?? name);

/**
 * The fields to write for one row: a new product gets everything, an existing one only what the row has
 * (stock and photos it already has are kept; new photos go after them).
 */
export function productFields(
  row: ImportRow,
  photoPaths: string[],
  existing?: { image_path: string | null; image_paths?: string[] | null; prices?: Record<string, number> | null },
) {
  const fields: Record<string, unknown> = {};
  if (row.name) fields.name = row.name;
  if (row.sku) fields.sku = row.sku;
  if (row.description !== undefined) fields.description = row.description;
  if (row.categories) fields.categories = row.categories;
  if (row.extraCost !== undefined) fields.extra_cost = row.extraCost;
  if (row.inCatalog !== undefined) fields.in_catalog = row.inCatalog;
  if (existing) {
    if (Object.keys(row.prices).length) fields.prices = { ...(existing.prices ?? {}), ...row.prices };
    if (photoPaths.length) {
      const all = [existing.image_path, ...(existing.image_paths ?? []), ...photoPaths].filter((path): path is string => Boolean(path));
      fields.image_path = all[0];
      fields.image_paths = all.slice(1);
    }
  } else {
    fields.prices = row.prices;
    fields.stock = row.stock ?? 0;
    fields.image_path = photoPaths[0] ?? null;
    fields.image_paths = photoPaths.slice(1);
    if (row.inCatalog === undefined) fields.in_catalog = true;
  }
  return fields;
}
