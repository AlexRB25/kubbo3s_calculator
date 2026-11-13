// Same file in the calculator app (mobile/src/lib) and in kubbo3d-tools/src/lib: keep them identical.

/**
 * Kubbo3D's printing guides: what each slicer setting does, what it is called in each slicer, the filament types,
 * design rules for printed parts and how to fix common problems. Blocks are plain data so web and app draw them
 * their own way. Values are starting points for a 0.4 mm nozzle; a calibration print decides the final ones.
 */
export type DocBlock =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'tip'; text: string };

export type DocSection = { title: string; blocks: DocBlock[] };

export type Doc = { id: string; title: string; summary: string; sections: DocSection[] };

export const DOCS: Doc[] = [
  {
    id: 'parametros',
    title: 'Parámetros del laminador',
    summary: 'Qué hace cada ajuste, cuándo moverlo y valores para empezar con boquilla de 0.4 mm.',
    sections: [
      {
        title: 'Altura de capa',
        blocks: [
          { type: 'p', text: 'Es el grosor de cada capa. Capas finas dan mejor acabado en curvas y detalles; capas gruesas imprimen más rápido y dan piezas un poco más resistentes entre capas.' },
          {
            type: 'table',
            head: ['Altura', 'Para qué', 'Tiempo'],
            rows: [
              ['0.08–0.12 mm', 'Figuras, miniaturas, detalle fino', 'Muy lento'],
              ['0.16 mm', 'Piezas de exhibición, buen acabado', 'Lento'],
              ['0.20 mm', 'Uso general (la de casi todos los perfiles)', 'Normal'],
              ['0.24–0.28 mm', 'Piezas funcionales, prototipos, grandes', 'Rápido'],
            ],
          },
          { type: 'tip', text: 'Regla: la altura de capa va del 25 % al 75 % del diámetro de la boquilla. Con 0.4 mm: de 0.10 a 0.30 mm.' },
        ],
      },
      {
        title: 'Paredes (perímetros)',
        blocks: [
          { type: 'p', text: 'Son las líneas del contorno de cada capa. Dan casi toda la resistencia de la pieza: subir paredes refuerza más que subir el relleno.' },
          {
            type: 'list',
            items: [
              '2 paredes: piezas decorativas y figuras.',
              '3 paredes: uso general.',
              '4–6 paredes: piezas que llevan carga, tornillos o roscas.',
              'Grosor de pared ≈ número de paredes × ancho de línea (con 0.4 mm, unos 0.45 mm por línea).',
            ],
          },
        ],
      },
      {
        title: 'Capas superiores e inferiores',
        blocks: [
          { type: 'p', text: 'Las capas sólidas que cierran la pieza arriba y abajo. Pocas dejan ver el relleno (agujeritos arriba, efecto almohada).' },
          { type: 'list', items: ['Busca unos 0.8–1.0 mm de grosor sólido: con capa de 0.2 mm, 4–5 capas arriba y 3–4 abajo.', 'Si arriba se ve el relleno, sube capas superiores o el relleno.'] },
        ],
      },
      {
        title: 'Relleno',
        blocks: [
          {
            type: 'table',
            head: ['Densidad', 'Uso'],
            rows: [
              ['0–10 %', 'Figuras y decoración (macetas en modo jarrón: 0 %)'],
              ['15–20 %', 'Uso general'],
              ['25–40 %', 'Piezas funcionales'],
              ['50 % o más', 'Piezas muy cargadas (mejor sube paredes primero)'],
            ],
          },
          {
            type: 'table',
            head: ['Patrón', 'Ventaja'],
            rows: [
              ['Rejilla / Grid', 'Rápido y simple'],
              ['Giroide / Gyroid', 'Resistente en todas direcciones, no choca con la boquilla; el más usado'],
              ['Cúbico / Cubic', 'Buena resistencia 3D, rápido'],
              ['Panal / Honeycomb', 'Rígido pero lento'],
              ['Rayo / Lightning', 'Mínimo material, solo sostiene la tapa (solo decoración)'],
            ],
          },
        ],
      },
      {
        title: 'Velocidades',
        blocks: [
          { type: 'p', text: 'Las impresoras modernas (Bambu, Creality K1, Prusa MK4) imprimen a 200–300 mm/s, pero el límite real lo pone el filamento: cuánto plástico puede fundir el hotend por segundo (velocidad volumétrica).' },
          {
            type: 'list',
            items: [
              'Pared exterior más lenta que las interiores: mejora el acabado.',
              'Primera capa lenta (20–50 mm/s) para que pegue bien.',
              'TPU y filamentos flexibles: 15–40 mm/s.',
              'Si las paredes salen rugosas o con huecos al ir rápido, baja la velocidad volumétrica máxima del filamento.',
            ],
          },
        ],
      },
      {
        title: 'Soportes',
        blocks: [
          {
            type: 'list',
            items: [
              'Hacen falta en voladizos de más de unos 45–55° y en puentes muy largos.',
              'Árbol (tree): menos material, fácil de quitar, mejor para figuras.',
              'Normal (grid): mejor para superficies planas grandes.',
              'Distancia Z superior de 0.2 mm (una capa) para que se despeguen fácil.',
              'Primero intenta girar la pieza: muchas veces no los necesita.',
            ],
          },
        ],
      },
      {
        title: 'Adherencia: brim, faldón y balsa',
        blocks: [
          {
            type: 'table',
            head: ['Opción', 'Cuándo'],
            rows: [
              ['Faldón (skirt)', 'Solo purga la boquilla antes de imprimir'],
              ['Brim de 3–8 mm', 'Piezas con poca base, esquinas que se levantan, ABS/ASA/nylon'],
              ['Balsa (raft)', 'Casi nunca; camas muy disparejas'],
            ],
          },
        ],
      },
      {
        title: 'Costura, planchado y otros',
        blocks: [
          {
            type: 'list',
            items: [
              'Costura (seam): donde empieza y termina cada capa. «Alineada» o «trasera» la esconde en una línea; «aleatoria» la reparte en granitos.',
              'Planchado (ironing): pasa la boquilla caliente sobre la capa superior para dejarla lisa. Sube mucho el tiempo; úsalo en tapas planas visibles.',
              'Modo jarrón (spiral vase): una sola pared en espiral, sin tapa ni relleno. Ideal para macetas y lámparas.',
              'Altura de primera capa: 0.2–0.25 mm aunque el resto sea más fino; perdona pequeñas diferencias de la cama.',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'laminadores',
    title: 'El mismo ajuste en cada laminador',
    summary: 'Cómo se llama cada parámetro en Bambu Studio / OrcaSlicer, PrusaSlicer y Cura (los nombres en inglés que verás en la interfaz).',
    sections: [
      {
        title: 'Tabla de equivalencias',
        blocks: [
          {
            type: 'table',
            head: ['Ajuste', 'Bambu Studio / OrcaSlicer', 'PrusaSlicer', 'Cura'],
            rows: [
              ['Altura de capa', 'Layer height', 'Layer height', 'Layer Height'],
              ['Altura de primera capa', 'Initial layer height', 'First layer height', 'Initial Layer Height'],
              ['Paredes', 'Wall loops', 'Perimeters', 'Wall Line Count'],
              ['Capas superiores', 'Top shell layers', 'Solid layers: Top', 'Top Layers'],
              ['Capas inferiores', 'Bottom shell layers', 'Solid layers: Bottom', 'Bottom Layers'],
              ['Densidad de relleno', 'Sparse infill density', 'Fill density', 'Infill Density'],
              ['Patrón de relleno', 'Sparse infill pattern', 'Fill pattern', 'Infill Pattern'],
              ['Velocidad pared exterior', 'Outer wall speed', 'External perimeters', 'Outer Wall Speed'],
              ['Temperatura de boquilla', 'Nozzle temperature (filamento)', 'Temperature: Extruder', 'Printing Temperature'],
              ['Temperatura de cama', 'Bed temperature (por tipo de placa)', 'Temperature: Bed', 'Build Plate Temperature'],
              ['Ventilador de capa', 'Fan speed (Cooling)', 'Fan speed (Cooling)', 'Fan Speed'],
              ['Flujo', 'Flow ratio', 'Extrusion multiplier', 'Flow'],
              ['Retracción', 'Retraction length', 'Retraction: Length', 'Retraction Distance'],
              ['Soportes', 'Enable support (Normal / Tree)', 'Generate support material', 'Generate Support'],
              ['Brim', 'Brim type / Brim width', 'Brim width (Skirt and brim)', 'Build Plate Adhesion Type: Brim'],
              ['Costura', 'Seam position', 'Seam position', 'Z Seam Alignment'],
              ['Planchado', 'Ironing type', 'Ironing', 'Enable Ironing'],
              ['Compensación de agujeros', 'X-Y hole compensation', 'XY Size Compensation', 'Hole Horizontal Expansion'],
              ['Modo jarrón', 'Spiral vase', 'Spiral vase', 'Spiralize Outer Contour'],
            ],
          },
          { type: 'tip', text: 'En Bambu Studio y OrcaSlicer muchos ajustes solo aparecen al activar el modo «Avanzado» (o «Experto») arriba de la lista de parámetros. En Cura, cambia la visibilidad a «Expert».' },
        ],
      },
      {
        title: 'Dónde vive cada cosa',
        blocks: [
          {
            type: 'list',
            items: [
              'Bambu Studio / OrcaSlicer: el proceso (capas, paredes, relleno, velocidad) por un lado; el filamento (temperaturas, ventilador, flujo, pressure advance) por otro; la impresora (retracción, G-code inicial) en el tercero.',
              'PrusaSlicer: tres pestañas — Print Settings (proceso), Filament Settings y Printer Settings.',
              'Cura: casi todo en un solo perfil de impresión; el material solo pone temperaturas base.',
              'Guarda tus ajustes como perfil propio por material y marca: así no repites la calibración.',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'filamentos',
    title: 'Tipos de filamento',
    summary: 'Qué material conviene para cada trabajo, con sus ventajas y cuidados.',
    sections: [
      {
        title: 'Comparativa',
        blocks: [
          {
            type: 'table',
            head: ['Material', 'Fácil', 'Resistencia', 'Calor', 'Para'],
            rows: [
              ['PLA', '★★★★★', '★★☆☆☆', '~55 °C', 'Figuras, decoración, prototipos'],
              ['PLA+ / Tough', '★★★★★', '★★★☆☆', '~55 °C', 'Piezas de uso diario'],
              ['PLA Silk', '★★★★☆', '★☆☆☆☆', '~55 °C', 'Acabado brillante, decoración'],
              ['PLA Mate', '★★★★★', '★★☆☆☆', '~55 °C', 'Oculta las capas, figuras'],
              ['PETG', '★★★★☆', '★★★★☆', '~75 °C', 'Piezas funcionales, exteriores, contacto con agua'],
              ['ABS', '★★☆☆☆', '★★★★☆', '~95 °C', 'Piezas para auto, se lija y pinta'],
              ['ASA', '★★☆☆☆', '★★★★☆', '~95 °C', 'Exteriores: resiste el sol'],
              ['TPU 95A', '★★☆☆☆', 'Flexible', '~80 °C', 'Fundas, sellos, ruedas, amortiguadores'],
              ['Nylon (PA)', '★☆☆☆☆', '★★★★★', '~120 °C', 'Engranes, bisagras, piezas de desgaste'],
              ['PC', '★☆☆☆☆', '★★★★★', '~115 °C', 'Piezas técnicas con calor y golpes'],
              ['Con fibra de carbono (CF)', '★★★☆☆', 'Muy rígido', 'Según base', 'Piezas rígidas y ligeras (requiere boquilla endurecida)'],
            ],
          },
        ],
      },
      {
        title: 'Cuidados',
        blocks: [
          {
            type: 'list',
            items: [
              'Seca y guarda: PETG, TPU, nylon y PC absorben humedad en días u horas. Húmedos hacen hilos, burbujas y piezas débiles.',
              'Abrasivos (fibra de carbono, vidrio, brilla en la oscuridad, madera): gastan boquillas de latón; usa acero endurecido.',
              'ABS y ASA sueltan olor y partículas: impresora cerrada y cuarto ventilado.',
              'Las temperaturas cambian por marca y color: haz una torre de temperatura con cada carrete nuevo.',
            ],
          },
          { type: 'tip', text: 'Kubbo3D calcula el costo por gramo de cada filamento con lo que realmente pagaste en tus compras: regístralas en Filamento.' },
        ],
      },
    ],
  },
  {
    id: 'diseno',
    title: 'Diseña piezas que salgan bien',
    summary: 'Medidas mínimas, holguras para encajes, agujeros, roscas y orientación (impresión FDM con boquilla de 0.4 mm).',
    sections: [
      {
        title: 'Medidas mínimas',
        blocks: [
          {
            type: 'table',
            head: ['Elemento', 'Mínimo', 'Recomendado'],
            rows: [
              ['Pared vertical', '0.8 mm (2 líneas)', '1.2–2.0 mm'],
              ['Piso o techo', '0.6 mm', '1.0 mm o más'],
              ['Detalle en relieve', '0.4 mm', '0.6 mm o más'],
              ['Texto en relieve: alto de letra', '3 mm', '5 mm o más, letra gruesa'],
              ['Texto grabado: profundidad', '0.4 mm', '0.6–1.0 mm'],
              ['Poste o pin vertical', '2 mm de diámetro', '3 mm o más'],
              ['Hueco entre piezas impresas juntas', '0.3 mm', '0.4–0.5 mm'],
            ],
          },
          { type: 'tip', text: 'Diseña paredes en múltiplos del ancho de línea (0.8, 1.2, 1.6 mm…): el laminador las llena sin huecos ni rellenos raros.' },
        ],
      },
      {
        title: 'Holguras por tipo de ajuste',
        blocks: [
          { type: 'p', text: 'Diferencia total entre el agujero y la pieza que entra (en el diámetro o ancho). Son puntos de partida: imprime una prueba de tolerancias con tu impresora y material.' },
          {
            type: 'table',
            head: ['Ajuste', 'Holgura total', 'Ejemplo'],
            rows: [
              ['A presión (no se suelta)', '0.0–0.1 mm', 'Imanes, pernos que no deben salir'],
              ['Firme (entra con fuerza)', '0.1–0.2 mm', 'Tapas que no se caen, uniones de piezas'],
              ['Deslizante', '0.2–0.3 mm', 'Cajones, tapas corredizas'],
              ['Holgado / gira', '0.3–0.5 mm', 'Ejes, ruedas, bisagras armadas'],
              ['Impreso en su lugar (print-in-place)', '0.4–0.6 mm', 'Bisagras y articulaciones que salen armadas'],
            ],
          },
          { type: 'tip', text: 'Los agujeros verticales salen 0.1–0.2 mm más chicos que en el diseño. Corrígelo en el modelo o con la compensación de agujeros del laminador.' },
        ],
      },
      {
        title: 'Agujeros, roscas y tornillos',
        blocks: [
          {
            type: 'list',
            items: [
              'Agujeros horizontales salen ovalados arriba: dales forma de gota o un techo en punta de 45°.',
              'Roscas impresas: funcionan bien de M8 en adelante. Para M3–M5 usa insertos de latón con calor o tuercas cautivas.',
              'Inserto de calor M3 típico: agujero de 4.0–4.2 mm (revisa la ficha del inserto).',
              'Tornillo que pasa libre: agujero 0.3–0.5 mm más grande que el tornillo (M3 → 3.4 mm).',
              'Tornillo que se atornilla al plástico (autorroscante): agujero 0.3–0.5 mm más chico que el tornillo.',
              'Tuerca M3 cautiva: hexágono de 5.5 mm entre caras + 0.2–0.3 mm de holgura.',
              'Pon 3 o más paredes alrededor de cualquier agujero que lleve tornillo.',
            ],
          },
        ],
      },
      {
        title: 'Voladizos, puentes y bordes',
        blocks: [
          {
            type: 'list',
            items: [
              'Voladizos hasta 45° salen sin soporte; con buen enfriamiento, hasta 55–60°.',
              'Puentes rectos de hasta 20–30 mm salen bien; más largos necesitan soporte o rediseño.',
              'En bordes de abajo usa chaflán a 45° en lugar de redondeo: el redondeo genera un voladizo plano.',
              'Arriba sí redondea: los filetes superiores salen perfectos.',
              'Un chaflán de 0.3–0.5 mm en la base evita la «pata de elefante» en piezas que deben encajar.',
            ],
          },
        ],
      },
      {
        title: 'Orientación y resistencia',
        blocks: [
          {
            type: 'list',
            items: [
              'La pieza es más débil entre capas (en el eje Z): orienta para que la fuerza no las separe.',
              'Ganchos y soportes de repisa: imprímelos acostados, no de pie.',
              'Encajes a presión (snap-fit): la pestaña debe ser larga (5 veces su grosor o más) e imprimirse en el plano XY. PETG y nylon aguantan más dobleces que PLA.',
              'Pon la cara más visible arriba o de lado, nunca sobre soportes.',
              'Superficies planas grandes en la cama tienden a levantarse: redondea esquinas o usa brim.',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'problemas',
    title: 'Problemas comunes y cómo arreglarlos',
    summary: 'Lo que ves en la pieza, por qué pasa y qué mover primero.',
    sections: [
      {
        title: 'Diagnóstico rápido',
        blocks: [
          {
            type: 'table',
            head: ['Lo que ves', 'Causa probable', 'Qué hacer'],
            rows: [
              ['No pega la primera capa', 'Boquilla alta, cama sucia o fría', 'Limpia con alcohol, ajusta Z-offset, sube 5 °C la cama'],
              ['Esquinas levantadas (warping)', 'El plástico se encoge al enfriar', 'Brim, cama más caliente, sin corrientes de aire, impresora cerrada'],
              ['Hilos entre partes', 'Filamento húmedo o muy caliente', 'Seca el filamento, baja 5–10 °C, revisa retracción'],
              ['Huecos o capas delgadas', 'Poca extrusión', 'Revisa flujo, boquilla tapada, velocidad volumétrica'],
              ['Capas desplazadas', 'El cabezal chocó o se saltó pasos', 'Revisa bandas, baja aceleración, evita piezas que se levantan'],
              ['Base ensanchada (pata de elefante)', 'Primera capa aplastada o cama muy caliente', 'Sube un poco el Z-offset, chaflán en la base'],
              ['Granitos en la superficie', 'Costura o retracción', 'Costura alineada, ajusta retracción y «wipe»'],
              ['Rayas horizontales', 'Eje Z, temperatura o filamento disparejo', 'Lubrica el eje Z, revisa que la temperatura no oscile'],
              ['Puntas derretidas', 'Poco enfriamiento', 'Ventilador al 100 % en PLA, tiempo mínimo por capa'],
              ['Pieza que se rompe entre capas', 'Temperatura baja o mucho ventilador', 'Sube 5–10 °C, baja ventilador (PETG, ABS)'],
            ],
          },
          { type: 'tip', text: 'Cambia una sola cosa a la vez y vuelve a imprimir la misma pieza: así sabes qué la arregló.' },
        ],
      },
    ],
  },
];

/** "https://youtu.be/abc", ".../watch?v=abc", ".../shorts/abc" or ".../embed/abc" -> "abc"; null when it is not YouTube. */
export function youtubeId(url: string | null | undefined) {
  if (!url) return null;
  const match = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/i.exec(url.trim());
  return match?.[1] ?? null;
}

/** How hard a course is, as shown to users. */
export const COURSE_LEVELS: Record<'basico' | 'intermedio' | 'avanzado', string> = { basico: 'Básico', intermedio: 'Intermedio', avanzado: 'Avanzado' };
