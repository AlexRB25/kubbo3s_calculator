import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteCourse, saveCourse } from "@/app/actions";
import { admin, must } from "@/lib/supabase/admin";
import { LEVELS } from "@/lib/courses";
import type { AdminCourse } from "../page";

const KINDS = { video: "Video", article: "Lectura", link: "Enlace" } as const;

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = id === "nuevo" ? null : (must(await admin().from("courses").select("*, course_lessons(*)").eq("id", id).maybeSingle()) as AdminCourse | null);
  if (id !== "nuevo" && !course) notFound();
  const lessons = [...(course?.course_lessons ?? [])].sort((a, b) => a.sort - b.sort);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1>{course ? course.title : "Nuevo curso"}</h1>
        <Link href="/cursos" className="btn">
          Volver
        </Link>
      </header>

      <form action={saveCourse} className="card grid max-w-3xl gap-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={course?.id ?? ""} />
        <label className="label sm:col-span-2">
          Título
          <input name="title" defaultValue={course?.title} className="input" required placeholder="Domina OrcaSlicer desde cero" />
        </label>
        <label className="label sm:col-span-2">
          Resumen
          <textarea name="summary" defaultValue={course?.summary} className="input" rows={3} placeholder="Qué vas a aprender y para quién es" />
        </label>
        <label className="label">
          Nivel
          <select name="level" defaultValue={course?.level ?? "basico"} className="input">
            {Object.entries(LEVELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Orden
          <input name="sort" type="number" step={1} defaultValue={course?.sort ?? 0} className="input" />
        </label>
        <label className="label sm:col-span-2">
          Imagen de portada (URL)
          <input name="cover_url" type="url" defaultValue={course?.cover_url ?? ""} className="input" placeholder="https://…" />
          <span className="font-normal">Opcional. Proporción 16:9.</span>
        </label>
        <label className="label">
          Dirección (slug)
          <input name="slug" defaultValue={course?.slug} className="input" placeholder="Se genera del título" />
        </label>
        <label className="flex items-center gap-2 self-end text-sm">
          <input name="published" type="checkbox" defaultChecked={course?.published ?? false} />
          Publicado (visible para los usuarios)
        </label>
        <div className="sm:col-span-2">
          <button className="btn btn-primary">{course ? "Guardar curso" : "Crear curso"}</button>
        </div>
      </form>

      {course && (
        <>
          <section className="card flex max-w-3xl flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2>Lecciones</h2>
              <Link href={`/cursos/${course.id}/leccion/nueva`} className="btn btn-primary">
                Nueva lección
              </Link>
            </div>
            {lessons.length === 0 ? (
              <p className="text-sm text-muted">Agrega la primera: un video de YouTube, un texto o un enlace.</p>
            ) : (
              <ol className="flex flex-col gap-1">
                {lessons.map((lesson, index) => (
                  <li key={lesson.id} className="flex items-center gap-3 rounded-lg border border-line p-2.5">
                    <span className="w-6 text-muted">{index + 1}.</span>
                    <span className="flex-1">
                      <span className="font-semibold">{lesson.title}</span>
                      <span className="block text-xs text-muted">
                        {KINDS[lesson.kind]}
                        {lesson.minutes ? ` · ${lesson.minutes} min` : ""}
                        {!lesson.published && " · oculta"}
                      </span>
                    </span>
                    <Link href={`/cursos/${course.id}/leccion/${lesson.id}`} className="btn">
                      Editar
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <form action={deleteCourse} className="max-w-3xl">
            <input type="hidden" name="id" value={course.id} />
            <button className="btn text-bad">Eliminar curso y sus lecciones</button>
          </form>
        </>
      )}
    </>
  );
}
