import { deleteTechReview, setProviderBlocked } from "@/app/actions";
import { dateTime } from "@/lib/format";
import { admin, must } from "@/lib/supabase/admin";

type Provider = {
  user_id: string;
  name: string;
  services: string[];
  city: string;
  state: string;
  whatsapp: string;
  active: boolean;
  blocked: boolean;
  rating_avg: number;
  rating_count: number;
  created_at: string;
};

type Review = { id: string; provider_id: string; author_name: string; user_id: string; stars: number; comment: string; reply: string; created_at: string };

/** Technicians who offer their services, and their ratings: the admin hides a technician or deletes a rating. */
export default async function TechniciansPage() {
  const providers = must(await admin().from("tech_providers").select("*").order("created_at", { ascending: false }).limit(200)) as Provider[];
  const reviews = must(await admin().from("tech_reviews").select("*").order("created_at", { ascending: false }).limit(500)) as Review[];

  return (
    <>
      <h1>Servicio técnico</h1>
      {providers.length === 0 && <p className="card text-muted">Nadie se ha dado de alta como técnico.</p>}
      {providers.map((provider) => {
        const own = reviews.filter((review) => review.provider_id === provider.user_id);
        return (
          <article key={provider.user_id} className="card flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="font-semibold">
                  {provider.name}
                  {provider.blocked && <span className="ml-2 rounded bg-bad/20 px-1.5 text-xs text-bad">Oculto por admin</span>}
                  {!provider.active && <span className="ml-2 rounded bg-raised px-1.5 text-xs text-muted">Pausado por él</span>}
                </p>
                <p className="text-muted">
                  {Number(provider.rating_avg).toFixed(1)} ★ ({provider.rating_count}) · {provider.services.join(", ")}
                </p>
                <p className="text-xs text-muted">
                  WhatsApp {provider.whatsapp} · {[provider.city, provider.state].filter(Boolean).join(", ")} · alta {dateTime(provider.created_at)}
                </p>
              </div>
              <form action={setProviderBlocked}>
                <input type="hidden" name="id" value={provider.user_id} />
                <input type="hidden" name="blocked" value={String(!provider.blocked)} />
                <button className="btn">{provider.blocked ? "Volver a mostrar" : "Ocultar"}</button>
              </form>
            </div>
            {own.length > 0 && (
              <details>
                <summary className="cursor-pointer text-muted">Calificaciones ({own.length})</summary>
                <ul className="mt-2 flex flex-col gap-2">
                  {own.map((review) => (
                    <li key={review.id} className="flex flex-wrap items-start gap-3 border-t border-line pt-2">
                      <div className="min-w-0 flex-1">
                        <p>
                          {"★".repeat(review.stars)} · {review.author_name} · <span className="text-xs text-muted">{dateTime(review.created_at)}</span>
                        </p>
                        {review.comment && <p className="whitespace-pre-line text-muted">{review.comment}</p>}
                        {review.reply && <p className="text-xs text-muted">Respuesta: {review.reply}</p>}
                      </div>
                      <form action={deleteTechReview}>
                        <input type="hidden" name="id" value={review.id} />
                        <button className="btn btn-danger">Borrar</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        );
      })}
    </>
  );
}
