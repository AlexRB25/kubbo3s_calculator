// Same file in the calculator app (mobile/src/lib) and in kubbo3d-tools/src/lib: keep them identical.

/** How to take the photos or video so KIRI can rebuild the object. */
export const SCAN_TIPS = [
  'Pon el objeto sobre una superficie con textura (periódico, mantel con dibujo), no sobre un fondo liso o brillante.',
  'Luz pareja y sin sombras duras: cerca de una ventana con el día nublado es ideal.',
  'Fotos: de 20 a 300, unas 40–80 es lo normal. Rodea el objeto en 2 o 3 alturas y que cada foto comparta la mitad con la anterior.',
  'Video: de 30 segundos a 3 minutos, en 1080p como máximo, rodeando el objeto despacio y sin que se salga del cuadro.',
  'Evita objetos transparentes, muy brillantes o negros lisos: salen mal en fotogrametría.',
];

export const SCAN_FORMATS = [
  { value: 'stl', label: 'STL (para imprimir)' },
  { value: 'obj', label: 'OBJ (con textura de color)' },
  { value: 'glb', label: 'GLB (para web y realidad aumentada)' },
];

export const SCAN_STATUS: Record<string, { label: string; tone: 'warn' | 'good' | 'bad' | 'muted' }> = {
  uploading: { label: 'Subiendo', tone: 'warn' },
  queued: { label: 'En fila', tone: 'warn' },
  processing: { label: 'Procesando', tone: 'warn' },
  done: { label: 'Listo', tone: 'good' },
  failed: { label: 'Falló (no se cobró)', tone: 'bad' },
  expired: { label: 'Venció', tone: 'muted' },
};

/** What scan_balance() answers. */
export type ScanBalance = { plan: string; active: boolean; enabled: boolean; plan_scans: number; plan_left: number; pack_left: number; price_usd: number };

/** A scan as /api/escaner/estado lists it (url: download link of the finished model, valid one hour). */
export type ScanItem = { id: string; name: string; kind: 'photos' | 'video'; file_format: string; status: string; error: string; created_at: string; url: string | null; source: string };

/** Files a scan may take: 250 MB in all (the server sends them to KIRI in one go). */
export const SCAN_MAX_BYTES = 250 * 1024 * 1024;
