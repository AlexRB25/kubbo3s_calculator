/** Hands the photos of the guided camera back to the scanner screen. */
export type ScanPhoto = { uri: string; name: string; size: number; mime: string };

let photos: ScanPhoto[] | null = null;

export const setScanPhotos = (list: ScanPhoto[]) => {
  photos = list;
};

export const takeScanPhotos = () => {
  const list = photos;
  photos = null;
  return list;
};
