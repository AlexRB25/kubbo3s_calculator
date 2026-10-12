"use client";

import Image from "next/image";
import { useState } from "react";

export function Gallery({ images, name }: { images: string[]; name: string }) {
  const [current, setCurrent] = useState(0);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-xl border border-line bg-raised">
        {images[current] && (
          <Image src={images[current]} alt={name} fill priority sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
        )}
      </div>
      {images.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              aria-label={`Foto ${index + 1}`}
              aria-current={index === current}
              onClick={() => setCurrent(index)}
              className="relative size-16 overflow-hidden rounded-lg border border-line aria-[current=true]:border-brand"
            >
              <Image src={image} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
