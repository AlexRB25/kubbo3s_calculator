// Same file in the calculator app (mobile/src/lib) and in kubbo3d-tools/src/lib: keep them identical.

/** A calibration test: what it is for, when to run it, how, and how to read what comes out. */
export type Guide = {
  id: string;
  title: string;
  category: 'Básicas' | 'Calidad' | 'Medidas y encajes' | 'Material';
  summary: string;
  when: string[];
  steps: string[];
  read: string[];
  tip?: string;
};

export const GUIDES: Guide[] = [
  {
    id: 'primera-capa',
    title: 'Primera capa y nivelación',
    category: 'Básicas',
    summary: 'Revisa que la boquilla esté a la altura correcta de la cama en toda su superficie. Casi todos los fallos empiezan aquí.',
    when: ['Al estrenar impresora o cama', 'Después de cambiar la boquilla', 'Si las piezas se despegan o la primera capa sale rugosa'],
    steps: [
      'Limpia la cama con alcohol isopropílico (sin tocarla con los dedos después).',
      'Imprime un cuadro delgado de una sola capa en cada esquina y en el centro, o un patrón de primera capa de tu laminador.',
      'Ajusta el Z-offset (o las perillas de la cama) mientras imprime, poco a poco: 0.02 mm por paso.',
    ],
    read: [
      'Bien: líneas aplanadas que se tocan entre sí, superficie lisa y uniforme.',
      'Muy alta: líneas redondas y separadas que se despegan con la uña. Baja la boquilla.',
      'Muy baja: superficie transparente o con crestas y raspones; el extrusor puede tronar. Sube la boquilla.',
    ],
    tip: 'Si una zona sale bien y otra no, el problema es la nivelación de la cama, no el Z-offset.',
  },
  {
    id: 'temperatura',
    title: 'Torre de temperatura',
    category: 'Material',
    summary: 'Imprime una torre en la que cada tramo usa una temperatura distinta para encontrar la mejor de cada filamento.',
    when: ['Con cada marca o tipo de filamento nuevo', 'Si cambias de boquilla (tamaño o material)', 'Si ves hilos, capas débiles o mal acabado'],
    steps: [
      'Descarga o genera una torre de temperatura (OrcaSlicer y otros laminadores la traen en el menú de calibración).',
      'Configura el rango que recomienda el fabricante, de 5 en 5 °C, de la más alta abajo a la más baja arriba.',
      'Imprímela con tu perfil normal de velocidad y ventilador.',
    ],
    read: [
      'Elige el tramo con mejor superficie, puentes limpios, voladizos sin caídas y sin hilos.',
      'Muy caliente: hilos, superficie brillante y blanda, puentes caídos.',
      'Muy fría: capas mal pegadas (se rompen con la mano), superficie opaca o rugosa.',
      'Rompe la torre con la mano: si se parte fácil entre capas, sube la temperatura aunque se vea bien.',
    ],
    tip: 'La misma temperatura no sirve para otra marca ni para otro color del mismo material: repítela.',
  },
  {
    id: 'flujo',
    title: 'Flujo (multiplicador de extrusión)',
    category: 'Calidad',
    summary: 'Ajusta cuánto plástico sale realmente contra lo que el laminador pide. Corrige huecos o exceso de material en superficies.',
    when: ['Con cada filamento nuevo', 'Si la capa superior sale con huecos o con crestas', 'Si las piezas salen más gruesas de lo esperado'],
    steps: [
      'Usa la prueba de flujo de tu laminador: imprime varios cuadros con flujos distintos (por ejemplo de −10 % a +10 %).',
      'Mira la capa superior de cada cuadro con buena luz y tócala con el dedo.',
      'Afina con una segunda prueba de pasos pequeños alrededor del mejor resultado.',
    ],
    read: [
      'Bien: superficie superior lisa y continua, sin huecos ni crestas.',
      'Poco flujo: líneas separadas, huecos entre ellas, capa superior que se ve "rayada".',
      'Mucho flujo: crestas, bordes abultados, la boquilla arrastra material.',
    ],
  },
  {
    id: 'pressure-advance',
    title: 'Pressure advance / Linear advance',
    category: 'Calidad',
    summary: 'Compensa la presión dentro de la boquilla al acelerar y frenar. Mejora esquinas y evita líneas abultadas al inicio y delgadas al final.',
    when: ['Con cada filamento nuevo', 'Si las esquinas salen redondeadas o abultadas', 'Después de cambiar velocidades o aceleraciones'],
    steps: [
      'Usa la prueba de pressure advance de tu laminador (patrón de líneas o torre).',
      'Imprime el rango sugerido para tu tipo de extrusor (directo usa valores bajos; bowden, más altos).',
      'Guarda el valor ganador en el perfil del filamento, no en el de la impresora.',
    ],
    read: [
      'Elige la línea con el ancho más parejo de principio a fin, o el tramo de la torre con esquinas más nítidas.',
      'Valor bajo: líneas más gruesas al final y esquinas abultadas.',
      'Valor alto: huecos al inicio de las líneas y esquinas con faltante.',
    ],
  },
  {
    id: 'retraccion',
    title: 'Retracción (hilos)',
    category: 'Calidad',
    summary: 'Encuentra cuánto y qué tan rápido debe retraer el extrusor para que no queden hilos entre partes de la pieza.',
    when: ['Si ves hilos o "telarañas" entre columnas', 'Con filamentos que tienden a hilar, como PETG o TPU', 'Al cambiar de extrusor'],
    steps: [
      'Primero calibra temperatura y flujo: la mayoría de los hilos vienen de temperatura alta o filamento húmedo.',
      'Imprime una torre de retracción que cambie la distancia por tramos (por ejemplo de 0.2 en 0.2 mm en extrusor directo).',
      'Con la mejor distancia, prueba la velocidad de retracción si aún quedan hilos.',
    ],
    read: [
      'Elige el tramo más bajo sin hilos: más retracción de la necesaria puede tapar la boquilla.',
      'Si ningún tramo queda limpio, seca el filamento y baja 5 °C antes de subir la retracción.',
    ],
    tip: 'Extrusor directo: suele bastar con 0.4 a 1.5 mm. Bowden: de 2 a 6 mm.',
  },
  {
    id: 'enfriamiento',
    title: 'Prueba de enfriamiento',
    category: 'Calidad',
    summary: 'Revisa si el ventilador de capa enfría lo suficiente: puntas finas, detalles pequeños y voladizos lo delatan.',
    when: ['Con cada tipo de material', 'Si las puntas se derriten o los detalles pequeños salen deformes', 'Después de cambiar el ducto del ventilador'],
    steps: [
      'Imprime una pieza con puntas delgadas o torres finas (por ejemplo dos picos separados).',
      'Prueba el ventilador al 100 %, al 70 % y al 40 % en piezas iguales.',
      'Si tu laminador lo permite, ajusta el tiempo mínimo por capa para que las capas pequeñas tengan tiempo de enfriar.',
    ],
    read: [
      'Bien: puntas afiladas y sin gotas, superficie pareja por todos lados.',
      'Poco enfriamiento: puntas derretidas, curvadas o con gotas; un lado peor que otro indica que el aire no llega parejo.',
      'Demasiado (en PETG, ABS, ASA): capas débiles o grietas. Esos materiales usan poco ventilador.',
    ],
  },
  {
    id: 'voladizos',
    title: 'Ángulo de voladizo',
    category: 'Calidad',
    summary: 'Encuentra el ángulo máximo que tu impresora y filamento sostienen sin soportes.',
    when: ['Para decidir cuándo una pieza necesita soportes', 'Al probar un filamento o un ducto nuevo'],
    steps: [
      'Imprime una prueba de voladizos con escalones de 20° a 80° (de 5 en 5 o de 10 en 10).',
      'Mira la parte de abajo de cada escalón con luz rasante.',
    ],
    read: [
      'El último ángulo que sale limpio es tu límite. Arriba de ese, pon soportes o gira la pieza.',
      'La mayoría de las impresoras bien calibradas sostienen de 45° a 60° con PLA.',
    ],
  },
  {
    id: 'puentes',
    title: 'Puentes',
    category: 'Calidad',
    summary: 'Mide qué tan largo puede ser un tramo horizontal sin apoyo antes de colgarse.',
    when: ['Si las piezas tienen huecos, ventanas o tapas planas', 'Al ajustar velocidad y ventilador de puentes'],
    steps: [
      'Imprime una prueba de puentes con claros de 10 a 60 mm.',
      'Si cuelgan, baja la velocidad de puentes y sube el ventilador en esa parte.',
    ],
    read: [
      'Bien: hilos tensos y rectos que no cuelgan ni se rompen.',
      'Cuelgan: falta enfriamiento, sobra temperatura o la velocidad es muy alta.',
    ],
  },
  {
    id: 'tolerancias',
    title: 'Tolerancias y encajes',
    category: 'Medidas y encajes',
    summary: 'Averigua cuánta holgura necesitan dos piezas para encajar: tapas, pernos, piezas a presión o articuladas.',
    when: ['Antes de diseñar piezas que encajan entre sí', 'Si las tapas no entran o quedan flojas'],
    steps: [
      'Imprime una prueba de tolerancias: pernos en agujeros con holguras de 0.1, 0.2, 0.3, 0.4 y 0.5 mm.',
      'Intenta sacar o girar cada perno con la mano.',
    ],
    read: [
      'La holgura más pequeña que se mueve libremente es la de piezas que giran.',
      'Una o dos décimas menos es la de piezas a presión.',
      'Usa esos valores en tus diseños y en las herramientas 3D de Kubbo.',
    ],
    tip: 'La holgura cambia con el material y la orientación: un agujero vertical sale más chico que uno horizontal.',
  },
  {
    id: 'cubo',
    title: 'Cubo de calibración XYZ',
    category: 'Medidas y encajes',
    summary: 'Comprueba que las piezas midan lo que deben en cada eje.',
    when: ['Al estrenar impresora', 'Si las piezas salen más grandes o más chicas de lo diseñado'],
    steps: [
      'Imprime un cubo de 20 mm con dos paredes y relleno normal.',
      'Mide cada eje con un calibrador (vernier) en tres puntos y promedia.',
    ],
    read: [
      'Diferencias de ±0.1 mm son normales.',
      'Si X y Y salen grandes por igual, suele ser exceso de flujo, no los pasos del motor.',
      'Si solo Z está mal, revisa la altura de la primera capa (pandeo "pata de elefante").',
    ],
  },
  {
    id: 'volumetrica',
    title: 'Velocidad volumétrica máxima',
    category: 'Material',
    summary: 'Encuentra cuántos mm³ por segundo puede fundir tu hotend con cada filamento. Arriba de eso, la pieza sale con huecos.',
    when: ['Antes de imprimir más rápido', 'Si las piezas grandes salen con capas débiles o huecos a alta velocidad'],
    steps: [
      'Usa la prueba de flujo volumétrico de tu laminador: una pieza que aumenta la velocidad conforme sube.',
      'Mide la altura donde empieza a fallar y calcula el flujo con la fórmula del laminador.',
      'Pon en el perfil un valor 10 a 20 % menor que el límite.',
    ],
    read: ['El punto donde la pared se vuelve rugosa o con huecos es tu límite.'],
  },
  {
    id: 'humedad',
    title: 'Filamento húmedo',
    category: 'Material',
    summary: 'Muchos filamentos absorben humedad del aire. Húmedos, hacen hilos, burbujas y piezas débiles.',
    when: ['Si escuchas chasquidos o ves vapor al imprimir', 'Si el filamento se vuelve quebradizo (PLA) o hace muchos hilos (PETG, TPU, nylon)'],
    steps: [
      'Seca el carrete en secadora de filamento o en horno a baja temperatura con termómetro (ver tabla de materiales).',
      'Guárdalo en una bolsa o caja hermética con desecante.',
      'Vuelve a imprimir la misma pieza y compara.',
    ],
    read: ['Si los hilos, las burbujas o la superficie áspera desaparecen después de secarlo, era humedad.'],
    tip: 'Nylon y TPU se humedecen en horas; conviene imprimirlos directo desde la secadora.',
  },
  {
    id: 'warping',
    title: 'Adherencia y warping',
    category: 'Básicas',
    summary: 'Evita que las esquinas se levanten de la cama mientras la pieza se enfría.',
    when: ['Con ABS, ASA, nylon y piezas grandes de PETG', 'Si las esquinas se despegan a media impresión'],
    steps: [
      'Verifica la primera capa y limpia la cama.',
      'Sube la temperatura de la cama 5 °C y apaga el ventilador en las primeras capas.',
      'Agrega brim de 5 a 8 mm y, para ABS o ASA, imprime con la impresora cerrada y sin corrientes de aire.',
    ],
    read: ['Si la pieza sale plana y el brim se quita fácil, deja esa configuración en el perfil del material.'],
  },
];

/** Starting values per material; each brand states its own on the spool, and that comes first. */
export type MaterialReference = { material: string; nozzle: string; bed: string; fan: string; dry: string; notes: string };

export const MATERIALS: MaterialReference[] = [
  { material: 'PLA', nozzle: '190–220 °C', bed: '50–60 °C', fan: '100 %', dry: '45–50 °C · 4–6 h', notes: 'El más fácil. Se ablanda al sol o dentro de un auto.' },
  { material: 'PETG', nozzle: '230–250 °C', bed: '70–85 °C', fan: '30–60 %', dry: '60–65 °C · 4–6 h', notes: 'Resistente y flexible. Tiende a hacer hilos; usa poca retracción y seca el carrete.' },
  { material: 'ABS', nozzle: '240–260 °C', bed: '95–110 °C', fan: '0–20 %', dry: '70–80 °C · 4 h', notes: 'Necesita impresora cerrada. Desprende olor: ventila el cuarto.' },
  { material: 'ASA', nozzle: '240–260 °C', bed: '90–110 °C', fan: '0–30 %', dry: '70–80 °C · 4 h', notes: 'Como ABS pero resiste el sol. Para piezas de exterior.' },
  { material: 'TPU', nozzle: '210–230 °C', bed: '30–60 °C', fan: '50–100 %', dry: '50–55 °C · 4–6 h', notes: 'Flexible. Imprime lento (15–30 mm/s) y con poca retracción; mejor con extrusor directo.' },
  { material: 'Nylon (PA)', nozzle: '250–280 °C', bed: '70–90 °C', fan: '0–30 %', dry: '70–80 °C · 8–12 h', notes: 'Muy resistente y muy higroscópico: imprímelo desde la secadora.' },
  { material: 'PC', nozzle: '260–300 °C', bed: '100–120 °C', fan: '0–20 %', dry: '80–90 °C · 6–8 h', notes: 'Resiste calor y golpes. Requiere hotend de alta temperatura y cámara cerrada.' },
];
