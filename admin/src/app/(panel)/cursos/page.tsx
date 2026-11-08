import Link from "next/link";
import { LEVELS } from "@/lib/courses";
import { admin, must } from "@/lib/supabase/admin";

export type AdminLesson = {
  id: string;
  course_id: string;
  title: string;
  kind: "video" | "article" | "link";
  video_url: string | null;
  link_url: string | null;
  body: string;
  minutes: number;
  sort: number;
  published: boolean;
};

export type AdminCourse = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  level: "basico" | "intermedio" | "avanzado";
  cover_url: string | null;
  published: boolean;
  sort: number;
  course_lessons?: AdminLesson[];
};

/** Courses of the Aprende section of the calculator (web and app). */
export default async function CoursesPage() {
  const courses = must(await admin().from("courses").select("*, course_lessons(id, minutes, published)").order("sort").order("title")) as AdminCourse[];

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Cursos</h1>
          <p className="text-sm text-muted">Salen en Aprende (calculadora web y app). Solo los publicados son visibles; cada lección puede ser video de YouTube, texto o enlace.</p>
        </div>
        <Link href="/cursos/nuevo" className="btn btn-primary">
          Nuevo curso
        </Link>
      </header>

      {courses.length === 0 ? (
        <p className="card text-muted">Todavía no hay cursos. ¿Ya se ejecutó la última parte de supabase/schema.sql?</p>
      ) : (
        <section className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Curso</th>
                <th>Nivel</th>
                <th className="num">Lecciones</th>
                <th className="num">Minutos</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => {
                const lessons = course.course_lessons ?? [];
                return (
                  <tr key={course.id}>
                    <td>
                      <span className="font-semibold">{course.title}</span>
                      <span className="block text-xs text-muted">{course.slug}</span>
                    </td>
                    <td>{LEVELS[course.level]}</td>
                    <td className="num">{lessons.length}</td>
                    <td className="num">{lessons.reduce((total, lesson) => total + lesson.minutes, 0)}</td>
                    <td>{course.published ? "Publicado" : <span className="text-muted">Borrador</span>}</td>
                    <td className="num">
                      <Link href={`/cursos/${course.id}`} className="btn">
                        Editar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
