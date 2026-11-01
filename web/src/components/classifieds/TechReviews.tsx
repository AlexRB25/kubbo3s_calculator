"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { stars, type TechReview } from "@/lib/classifieds";
import { day } from "@/lib/format";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

/**
 * Ratings of a technician: 1 to 5 stars with a comment, one per person (they can change or delete it).
 * The technician cannot rate themself, but answers each rating.
 */
export function TechReviews({ providerId, initial }: { providerId: string; initial: TechReview[] }) {
  const { session } = useSession();
  const router = useRouter();
  const [reviews, setReviews] = useState(initial);
  const userId = session?.user.id;
  const mine = reviews.find((review) => review.user_id === userId);
  const isProvider = userId === providerId;

  // The average at the top is worked out by the database: read the page again after a change.
  const changed = (list: TechReview[]) => {
    setReviews(list);
    router.refresh();
  };

  async function remove(review: TechReview) {
    if (!window.confirm("¿Borrar tu calificación?")) return;
    const { error } = await supabase().from("tech_reviews").delete().eq("id", review.id);
    if (!error) changed(reviews.filter((item) => item.id !== review.id));
  }

  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-xl">Calificaciones y comentarios ({reviews.length})</h2>
      {!session ? (
        <p className="text-sm text-muted">
          <Link href={`/entrar?next=${encodeURIComponent(`/servicio-tecnico/${providerId}`)}`} className="text-brand hover:underline">
            Entra
          </Link>{" "}
          para calificar a este técnico.
        </p>
      ) : isProvider ? (
        <p className="text-sm text-muted">Este es tu perfil: puedes responder cada calificación.</p>
      ) : (
        <ReviewForm
          key={mine?.id ?? "new"}
          providerId={providerId}
          mine={mine}
          onSaved={(review) => changed(mine ? reviews.map((item) => (item.id === review.id ? review : item)) : [review, ...reviews])}
        />
      )}
      {reviews.length === 0 && <p className="text-sm text-muted">Nadie lo ha calificado todavía.</p>}
      <ul className="flex flex-col gap-5">
        {reviews.map((review) => (
          <li key={review.id} className="flex flex-col gap-1 border-b border-line pb-4">
            <p className="text-sm">
              <span className="text-warn" aria-label={`${review.stars} de 5 estrellas`}>
                {stars(review.stars)}
              </span>
              <span className="ml-2 font-medium">{review.author_name}</span>
              <span className="ml-2 text-xs text-muted">{day(review.created_at)}</span>
            </p>
            {review.comment && <p className="whitespace-pre-line text-sm text-muted">{review.comment}</p>}
            {review.reply && (
              <p className="ml-4 border-l border-line pl-3 text-sm">
                <span className="font-medium">Respuesta del técnico: </span>
                <span className="whitespace-pre-line text-muted">{review.reply}</span>
              </p>
            )}
            {isProvider && <ReplyForm review={review} onSaved={(reply) => setReviews((list) => list.map((item) => (item.id === review.id ? { ...item, reply } : item)))} />}
            {review.user_id === userId && (
              <button className="self-start text-xs text-muted hover:text-bad" onClick={() => remove(review)}>
                Borrar mi calificación
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReviewForm({ providerId, mine, onSaved }: { providerId: string; mine?: TechReview; onSaved: (review: TechReview) => void }) {
  const [rating, setRating] = useState(mine?.stars ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!rating) return setError("Elige de 1 a 5 estrellas.");
    setBusy(true);
    setError("");
    const result = mine
      ? await supabase().from("tech_reviews").update({ stars: rating, comment: comment.trim(), updated_at: new Date().toISOString() }).eq("id", mine.id).select("*").single()
      : await supabase().from("tech_reviews").insert({ provider_id: providerId, stars: rating, comment: comment.trim() }).select("*").single();
    setBusy(false);
    if (result.error) return setError(result.error.code === "23505" ? "Ya calificaste a este técnico." : result.error.message);
    onSaved(result.data as TechReview);
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <p className="text-sm font-medium">{mine ? "Tu calificación (puedes cambiarla)" : "¿Te atendió? Califícalo"}</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Estrellas">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} ${value === 1 ? "estrella" : "estrellas"}`}
            onClick={() => setRating(value)}
            className={`text-3xl leading-none ${value <= rating ? "text-warn" : "text-muted"} hover:scale-110`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        className="input"
        rows={3}
        maxLength={1000}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Qué te reparó, si cumplió tiempos y precio, cómo te trató…"
      />
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className="btn btn-primary self-start" disabled={busy}>
        {busy ? "Guardando…" : mine ? "Guardar cambios" : "Publicar calificación"}
      </button>
    </form>
  );
}

function ReplyForm({ review, onSaved }: { review: TechReview; onSaved: (reply: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState(review.reply);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const { error: failed } = await supabase().rpc("reply_tech_review", { p_review: review.id, p_reply: reply });
    if (failed) return setError(failed.message);
    onSaved(reply.trim());
    setOpen(false);
  }

  if (!open) {
    return (
      <button className="self-start text-xs text-brand hover:underline" onClick={() => setOpen(true)}>
        {review.reply ? "Editar respuesta" : "Responder"}
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="ml-4 flex flex-col gap-2">
      <textarea className="input" rows={2} maxLength={1000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Gracias por tu comentario…" autoFocus />
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary">Guardar respuesta</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
