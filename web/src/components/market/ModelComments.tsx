"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { day } from "@/lib/format";
import { makerName, type Comment } from "@/lib/market";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

const COLUMNS = "id, user_id, parent_id, body, created_at, makers(handle, name)";

/** Comments of a model, with one level of replies. The author of a comment and the model's owner can delete it. */
export function ModelComments({ modelId, ownerId, initial }: { modelId: string; ownerId: string; initial: Comment[] }) {
  const { session } = useSession();
  const [comments, setComments] = useState(initial);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const userId = session?.user.id;
  const roots = comments.filter((comment) => !comment.parent_id);

  async function post(body: string, parentId: string | null) {
    const { data, error } = await supabase().from("model_comments").insert({ model_id: modelId, parent_id: parentId, body }).select(COLUMNS).single();
    if (error) return error.message;
    setComments((list) => [...list, data as unknown as Comment]);
    setReplyTo(null);
    return "";
  }

  async function remove(id: string) {
    if (!window.confirm("¿Borrar este comentario?")) return;
    const { error } = await supabase().from("model_comments").delete().eq("id", id);
    if (!error) setComments((list) => list.filter((comment) => comment.id !== id && comment.parent_id !== id));
  }

  const item = (comment: Comment) => (
    <div className="flex flex-col gap-1">
      <p className="text-sm">
        {comment.makers ? (
          <Link href={`/modelos/u/${comment.makers.handle}`} className="font-medium hover:text-brand">
            {makerName(comment.makers)}
          </Link>
        ) : (
          <span className="font-medium">Anónimo</span>
        )}
        {comment.user_id === ownerId && <span className="ml-2 rounded bg-brand/15 px-1.5 text-xs text-brand">Autor</span>}
        <span className="ml-2 text-xs text-muted">{day(comment.created_at)}</span>
      </p>
      <p className="whitespace-pre-line text-sm text-muted">{comment.body}</p>
      <p className="flex gap-3 text-xs">
        {session && !comment.parent_id && (
          <button className="text-muted hover:text-white" onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}>
            Responder
          </button>
        )}
        {(comment.user_id === userId || ownerId === userId) && (
          <button className="text-muted hover:text-bad" onClick={() => remove(comment.id)}>
            Borrar
          </button>
        )}
      </p>
    </div>
  );

  return (
    <section className="mt-12 flex max-w-3xl flex-col gap-5">
      <h2 className="text-xl">Comentarios ({comments.length})</h2>
      {session ? (
        <CommentForm onSend={(body) => post(body, null)} placeholder="Pregunta algo o cuenta cómo te quedó la impresión" />
      ) : (
        <p className="text-sm text-muted">
          <Link href={`/entrar?next=${encodeURIComponent(`/modelos/${modelId}`)}`} className="text-brand hover:underline">
            Entra
          </Link>{" "}
          para comentar.
        </p>
      )}
      {roots.length === 0 && <p className="text-sm text-muted">Nadie ha comentado todavía.</p>}
      <ul className="flex flex-col gap-5">
        {roots.map((root) => (
          <li key={root.id} className="flex flex-col gap-3">
            {item(root)}
            <ul className="ml-5 flex flex-col gap-3 border-l border-line pl-4">
              {comments
                .filter((reply) => reply.parent_id === root.id)
                .map((reply) => (
                  <li key={reply.id}>{item(reply)}</li>
                ))}
              {replyTo === root.id && (
                <li>
                  <CommentForm onSend={(body) => post(body, root.id)} placeholder="Tu respuesta" autoFocus />
                </li>
              )}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CommentForm({ onSend, placeholder, autoFocus }: { onSend: (body: string) => Promise<string>; placeholder: string; autoFocus?: boolean }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const failed = await onSend(body.trim());
    setBusy(false);
    setError(failed);
    if (!failed) setBody("");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <textarea className="input" rows={3} maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} placeholder={placeholder} autoFocus={autoFocus} />
      <button className="btn btn-primary self-start" disabled={busy || !body.trim()}>
        {busy ? "Enviando…" : "Comentar"}
      </button>
      {error && <p className="text-sm text-bad">{error}</p>}
    </form>
  );
}
