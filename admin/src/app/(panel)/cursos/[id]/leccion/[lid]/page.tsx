import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteLesson, saveLesson } from "@/app/actions";
import { admin, must } from "@/lib/supabase/admin";
import type { AdminLesson } from "../../../page";

export default async function LessonPage({ params }: { params: Promise<{ id: string; lid: string }> }) {
  const { id, lid } = await params;
  const lesson = lid === "nueva" ? null : (must(await admin().from("course_lessons").select("*").eq("id", lid).maybeSingle()) as AdminLesson | null);
  if (lid !== "nueva" && !lesson) notFound();
  const count = lesson ? 0 : ((must(await admin().from("course_lessons").select("id").eq("course_id", id)) as { id: string }[]).length);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1>{lesson ? lesson.title : "Nueva lección"}</h1>
        <Link href={`/cursos/${id}`} className="btn">
          Volver al curso
        </Link>
      </header>

      <form action={saveLesson} className="card grid max-w-3xl gap-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={lesson?.id ?? ""} />
        <input type="hidden" name="course_id" value={id} />
        <label className="label sm:col-span-2">
          Título
          <input name="title" defaultValue={lesson?.title} className="input" required placeholder="Altura de capa: cuándo bajarla y cuándo subirla" />
        </label>
        <label className="label">
          Tipo
          <select name="kind" defaultValue={lesson?.kind ?? "video"} className="input">
            <option value="video">Video</option>
            <option value="article">Lectura</option>
            <option value="link">Enlace</option>
          </select>
        </label>
        <label className="label">
          Duración (minutos)
          <input name="minutes" type="number" min={0} step={1} defaultValue={lesson?.minutes ?? 0} className="input" />
        </label>
        <label className="label sm:col-span-2">
          Video (enlace de YouTube u otro)
          <input name="video_url" type="url" defaultValue={lesson?.video_url ?? ""} className="input" placeholder="https://youtu.be/…" />
          <span className="font-normal">Los de YouTube se ven dentro de la página; los demás abren el enlace.</span>
        </label>
        <label className="label sm:col-span-2">
          Texto de la lección
          <textarea name="body" defaultValue={lesson?.body} className="input" rows={10} placeholder="Explicación, pasos, valores… Deja una línea en blanco entre párrafos." />
        </label>
        <label className="label sm:col-span-2">
          Enlace extra (archivo, guía, perfil del laminador…)
          <input name="link_url" type="url" defaultValue={lesson?.link_url ?? ""} className="input" placeholder="https://…" />
        </label>
        <label className="label">
          Orden
          <input name="sort" type="number" step={1} defaultValue={lesson?.sort ?? count + 1} className="input" />
        </label>
        <label className="flex items-center gap-2 self-end text-sm">
          <input name="published" type="checkbox" defaultChecked={lesson?.published ?? true} />
          Visible
        </label>
        <div className="sm:col-span-2">
          <button className="btn btn-primary">Guardar lección</button>
        </div>
      </form>

      {lesson && (
        <form action={deleteLesson} className="max-w-3xl">
          <input type="hidden" name="id" value={lesson.id} />
          <input type="hidden" name="course_id" value={id} />
          <button className="btn text-bad">Eliminar lección</button>
        </form>
      )}
    </>
  );
}
