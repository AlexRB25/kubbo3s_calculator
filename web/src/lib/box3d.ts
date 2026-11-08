// Same file in web/src/lib and mobile/src/lib: keep them identical.

/**
 * A cardboard box drawn in 3D as flat polygons, so web (SVG) and app (react-native-svg) draw the same:
 * the box at its real proportions, turned `yaw` around its vertical axis and seen from a little above, with
 * its flaps or lid open by `open` (0 closed … 1 open). Faces come sorted from the farthest to the nearest.
 */

import type { BoxStyle } from './types';

/** "rsc": shipping box with four top flaps. "mailer": box with a lid hinged at the back (maletín, pizza). */
export type { BoxStyle };

export type BoxFace = { points: string; fill: string };

type Vec = [number, number, number];

/** Colours of the cardboard: outside, inside and the edges. */
export const BOX_COLORS: Record<string, { outside: string; inside: string; edge: string }> = {
  kraft: { outside: '#C49A6C', inside: '#E3C9A3', edge: '#7A5A38' },
  blanca: { outside: '#F1EEE6', inside: '#D9CDB8', edge: '#8F8576' },
  negra: { outside: '#2B2B2E', inside: '#C49A6C', edge: '#111113' },
};

const ELEVATION = (28 * Math.PI) / 180;

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Darkens (k < 1) or lightens (k > 1) a #rrggbb colour. */
function shade(hex: string, k: number) {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) * k)));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

/**
 * The polygons of the box in a `size` × `size` square. `dims` in any unit (length, width, height); the box
 * fills about 70 % of the square whatever its size, so a 10 cm cube and a 60 cm one look alike but a 30×30×4
 * pizza box looks flat.
 */
export function boxFaces({ length, width, height }: { length: number; width: number; height: number }, style: BoxStyle, yaw: number, open: number, size: number, colors = BOX_COLORS.kraft): BoxFace[] {
  const biggest = Math.max(length, width, height, 1e-6);
  const l = Math.max(length, 0.05 * biggest) / biggest;
  const w = Math.max(width, 0.05 * biggest) / biggest;
  const h = Math.max(height, 0.05 * biggest) / biggest;
  const quads = boxQuads(l, w, h, style, open);
  // Scaled so the box fits open or closed and does not zoom while the lid moves.
  const radius = Math.max(reach(quads, h), reach(boxQuads(l, w, h, style, 1), h), reach(boxQuads(l, w, h, style, 0), h));
  // Nearly closed, the flaps lie on one plane: they go last, in the order they overlap.
  const flaps = open < 0.25 ? (style === 'mailer' ? 2 : 4) : 0;
  return project(quads, h, yaw, size, (size * 0.46) / radius, colors, flaps);
}

/** Farthest corner from the centre of the box. */
const reach = (quads: Vec[][], h: number) => Math.max(...quads.flat().map((p) => Math.hypot(p[0], p[1], p[2] - h / 2)));

function boxQuads(l: number, w: number, h: number, style: BoxStyle, open: number): Vec[][] {
  const x0 = -l / 2;
  const x1 = l / 2;
  const y0 = -w / 2;
  const y1 = w / 2;

  // Quads in 3D, each with the point order that makes its normal face outwards (or up, for a closed flap).
  const quads: Vec[][] = [
    [[x0, y0, 0], [x0, y1, 0], [x1, y1, 0], [x1, y0, 0]], // bottom
    [[x0, y0, 0], [x1, y0, 0], [x1, y0, h], [x0, y0, h]], // front
    [[x1, y1, 0], [x0, y1, 0], [x0, y1, h], [x1, y1, h]], // back
    [[x0, y1, 0], [x0, y0, 0], [x0, y0, h], [x0, y1, h]], // left
    [[x1, y0, 0], [x1, y1, 0], [x1, y1, h], [x1, y0, h]], // right
  ];

  const angle = Math.max(0, Math.min(1, open));
  if (style === 'mailer') {
    // The lid turns about the back top edge, up to a bit past vertical; its front lip hangs from it.
    const theta = angle * ((105 * Math.PI) / 180);
    const along: Vec = [0, -Math.cos(theta), Math.sin(theta)];
    const hinge0: Vec = [x0, y1, h];
    const hinge1: Vec = [x1, y1, h];
    const far0 = add(hinge0, scale(along, w));
    const far1 = add(hinge1, scale(along, w));
    const down = cross(along, [1, 0, 0]);
    const lip = Math.min(h * 0.6, w * 0.25);
    quads.push([far0, add(far0, scale(down, -lip)), add(far1, scale(down, -lip)), far1]);
    quads.push([hinge0, far0, far1, hinge1]);
  } else {
    // Four flaps of half the width, folded flat when closed and turned out past vertical when open.
    const theta = angle * ((118 * Math.PI) / 180);
    const depth = w / 2;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const flap = (a: Vec, b: Vec, inward: Vec) => {
      const d: Vec = [inward[0] * c, inward[1] * c, s];
      return [a, b, add(b, scale(d, depth)), add(a, scale(d, depth))];
    };
    quads.push(flap([x0, y1, h], [x0, y0, h], [1, 0, 0])); // left (short)
    quads.push(flap([x1, y0, h], [x1, y1, h], [-1, 0, 0])); // right (short)
    // Closed, the long flaps lie on top of the short ones.
    quads.push(flap([x1, y0, h], [x0, y0, h], [0, 1, 0])); // front (long)
    quads.push(flap([x0, y1, h], [x1, y1, h], [0, -1, 0])); // back (long)
  }
  return quads;
}

function project(quads: Vec[][], h: number, yaw: number, size: number, k: number, colors: { outside: string; inside: string; edge: string }, last: number): BoxFace[] {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const ce = Math.cos(ELEVATION);
  const se = Math.sin(ELEVATION);
  // Turned about the vertical axis; the camera looks from -y, from above.
  const turn = (p: Vec): Vec => [p[0] * cy - p[1] * sy, p[0] * sy + p[1] * cy, p[2] - h / 2];
  const toCamera: Vec = [0, -ce, se];

  const faces = quads.map((quad) => {
      const points = quad.map(turn);
      const normal = cross([points[1][0] - points[0][0], points[1][1] - points[0][1], points[1][2] - points[0][2]], [points[3][0] - points[0][0], points[3][1] - points[0][1], points[3][2] - points[0][2]]);
      const length2 = Math.hypot(...normal) || 1;
      const facing = (normal[0] * toCamera[0] + normal[1] * toCamera[1] + normal[2] * toCamera[2]) / length2;
      // Light from the upper left: faces turned to it are brighter.
      const light = 0.78 + 0.22 * ((-normal[0] * 0.5 + normal[2] * 0.8 - normal[1] * 0.3) / length2);
      const base = facing >= 0 ? colors.outside : colors.inside;
      const depth = points.reduce((total, p) => total + p[1] * ce - p[2] * se, 0) / points.length;
      const screen = points.map((p) => `${(size / 2 + p[0] * k).toFixed(1)},${(size / 2 - (p[2] * ce + p[1] * se) * k).toFixed(1)}`).join(' ');
      return { points: screen, fill: shade(base.startsWith('#') ? base : '#C49A6C', facing >= 0 ? light : light * 0.92), depth };
  });
  const body = faces.slice(0, faces.length - last).sort((a, b) => b.depth - a.depth);
  return [...body, ...faces.slice(faces.length - last)].map(({ points, fill }) => ({ points, fill }));
}
