"use client";

import { pieceName, type SliceReport } from "./slice";

// Browser only: a picture of every piece of a sliced Bambu/Orca 3MF, cut out of the plate seen from above.
// The file also carries the same view with every object painted in a colour that is its id (R + G·256 +
// B·65536), so the pixels of one object say exactly where it is.

async function pixels(png: Uint8Array) {
  const bitmap = await createImageBitmap(new Blob([png.slice()], { type: "image/png" }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d")!;
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, bitmap.width, bitmap.height);
}

/** One object cut out of the top view (everything else transparent), as a PNG data URL; null if it is not drawn. */
async function cutOut(top: ImageData, pick: ImageData, id: number): Promise<string | null> {
  const { width, height } = pick;
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  const mine = (index: number) => pick.data[index + 3] > 0 && pick.data[index] + pick.data[index + 1] * 256 + pick.data[index + 2] * 65536 === id;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mine((y * width + x) * 4)) continue;
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
  }
  if (x1 < 0) return null;
  // A little margin, so the outline is not cut.
  [x0, y0, x1, y1] = [Math.max(0, x0 - 2), Math.max(0, y0 - 2), Math.min(width - 1, x1 + 2), Math.min(height - 1, y1 + 2)];
  const [w, h] = [x1 - x0 + 1, y1 - y0 + 1];
  const out = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const from = ((y0 + y) * width + x0 + x) * 4;
      // The top view is the same size as the pick view; its object pixels are kept, a ring around them too (edges).
      const near = mine(from) || (x > 0 && mine(from - 4)) || (x < w - 1 && mine(from + 4)) || (y > 0 && mine(from - width * 4)) || (y < h - 1 && mine(from + width * 4));
      if (!near || top.width !== width) continue;
      const to = (y * w + x) * 4;
      out.data.set(top.data.subarray(from, from + 4), to);
    }
  }
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d")!.putImageData(out, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/** A picture of each piece (by its piece name, see pieceName), from the first plate that shows it. */
export async function pieceThumbnails(report: SliceReport): Promise<Record<string, string>> {
  const thumbnails: Record<string, string> = {};
  for (const plate of report.plates) {
    if (!plate.top || !plate.pick || !plate.objectIds?.length) continue;
    try {
      const [top, pick] = await Promise.all([pixels(plate.top), pixels(plate.pick)]);
      for (const [index, object] of plate.objects.entries()) {
        const name = pieceName(object);
        const id = plate.objectIds[index];
        if (thumbnails[name] || !id) continue;
        const picture = await cutOut(top, pick, id);
        if (picture) thumbnails[name] = picture;
      }
    } catch {
      // A plate whose pictures cannot be read: its pieces just go without one.
    }
  }
  return thumbnails;
}
