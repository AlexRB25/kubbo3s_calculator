"use client";

import Link from "next/link";
import { useState } from "react";
import { addToCart, useCart } from "@/lib/cart";

export function AddToCart({ productId, stock }: { productId: string; stock: number }) {
  const [quantity, setQuantity] = useState(1);
  const inCart = useCart().find((line) => line.id === productId)?.quantity ?? 0;

  if (stock <= 0) return <p className="card text-muted">Agotado por ahora.</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="label">
          Cantidad
          <input
            type="number"
            min={1}
            max={stock}
            value={quantity}
            onChange={(event) => setQuantity(Math.max(1, Math.min(stock, Math.round(Number(event.target.value)) || 1)))}
            className="input w-24"
          />
        </label>
        <button className="btn btn-primary btn-lg" disabled={inCart >= stock} onClick={() => addToCart(productId, quantity, stock)}>
          Agregar al carrito
        </button>
      </div>
      <p className="text-sm text-muted" role="status">
        {stock} disponibles
        {inCart > 0 && (
          <>
            {" · "}
            <Link href="/carrito" className="font-medium text-brand hover:underline">
              Tienes {inCart} en tu carrito →
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
