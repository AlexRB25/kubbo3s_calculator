"use client";

import { useEffect, useState } from "react";
import { DOCS, youtubeId, type Doc, type DocBlock } from "@/lib/docs";
import { supabase } from "@/lib/supabase";
import type { Course, CourseLesson } from "@/lib/types";

const LEVELS: Record<Course["level"], string> = { basico: "Básico", intermedio: "Intermedio", avanzado: "Avanzado" };

/** A guide block: paragraph, list, table or tip. */
function Block({ block }: { block: DocBlock }) {
  if (block.type === "p") return <p className="text-sm leading-relaxed">{block.text}</p>;
  if (block.type === "tip") return <p className="rounded-lg bg-brand/10 p-3 text-sm">💡 {block.text}</p>;
  if (block.type === "list")
    return (
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="table table-scroll text-sm">
        <thead>
          <tr>
            {block.head.map((cell) => (
              <th key={cell}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell, index) => (
                <td key={index} className={index === 0 ? "font-semibold whitespace-nowrap" : ""}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Kubbo3D's printing guides: a list, and the one opened. */
export function Docs() {
  const [open, setOpen] = useState<Doc | null>(null);
  if (open) {
    return (
      <div className="flex flex-col gap-5">
        <button className="self-start text-sm text-muted hover:text-white" onClick={() => setOpen(null)}>
          ← Todas las guías
        </button>
        <div>
          <h2 className="text-2xl font-bold">{open.title}</h2>
          <p className="text-sm text-muted">{open.summary}</p>
        </div>
        <nav className="flex flex-wrap gap-2 text-xs">
          {open.sections.map((section) => (
            <a key={section.title} href={`#${encodeURIComponent(section.title)}`} className="rounded-full border border-line px-3 py-1 hover:border-brand">
              {section.title}
            </a>
          ))}
        </nav>
        {open.sections.map((section) => (
          <section key={section.title} id={encodeURIComponent(section.title)} className="card flex flex-col gap-3">
            <h3 className="text-lg font-semibold">{section.title}</h3>
            {section.blocks.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </section>
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {DOCS.map((doc) => (
        <button key={doc.id} className="card flex flex-col gap-1 text-left transition hover:border-brand/60" onClick={() => setOpen(doc)}>
          <span className="font-semibold">{doc.title}</span>
          <span className="text-sm text-muted">{doc.summary}</span>
          <span className="mt-1 text-xs text-brand">{doc.sections.length} temas →</span>
        </button>
      ))}
    </div>
  );
}

/** The lesson: the YouTube video inside the page, the text, or a button to the outside link. */
function LessonView({ lesson }: { lesson: CourseLesson }) {
  const video = youtubeId(lesson.video_url);
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">{lesson.title}</h3>
      {lesson.kind === "video" &&
        (video ? (
          <div className="aspect-video overflow-hidden rounded-xl bg-black">
            <iframe
              className="size-full"
              src={`https://www.youtube-nocookie.com/embed/${video}?rel=0`}
              title={lesson.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : lesson.video_url ? (
          <a className="btn btn-primary self-start" href={lesson.video_url} target="_blank" rel="noreferrer">
            Ver el video →
          </a>
        ) : null)}
      {lesson.body
        .split(/\n{2,}/)
        .filter((paragraph) => paragraph.trim())
        .map((paragraph, index) => (
          <p key={index} className="text-sm leading-relaxed whitespace-pre-line">
            {paragraph}
          </p>
        ))}
      {lesson.link_url && (
        <a className="btn self-start" href={lesson.link_url} target="_blank" rel="noreferrer">
          Abrir el enlace →
        </a>
      )}
    </div>
  );
}

/** Published courses with their lessons; the chosen lesson plays beside the list. */
export function Courses() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState("");
  const [course, setCourse] = useState<Course | null>(null);
  const [lesson, setLesson] = useState<CourseLesson | null>(null);

  useEffect(() => {
    let current = true;
    supabase()
      .from("courses")
      .select("*, course_lessons(*)")
      .order("sort")
      .then(({ data, error: failed }) => {
        if (!current) return;
        if (failed) setError(failed.code === "42P01" ? "Falta actualizar la base de datos (supabase/schema.sql) para ver los cursos." : failed.message);
        else setCourses(((data ?? []) as Course[]).map((item) => ({ ...item, course_lessons: [...(item.course_lessons ?? [])].sort((a, b) => a.sort - b.sort) })));
      });
    return () => {
      current = false;
    };
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!courses) return <p className="text-muted">Cargando cursos…</p>;
  if (!courses.length) return <p className="card text-muted">Pronto: cursos de parámetros, laminadores, filamentos y diseño para impresión 3D.</p>;

  if (course) {
    const lessons = course.course_lessons ?? [];
    const playing = lesson ?? lessons[0] ?? null;
    return (
      <div className="flex flex-col gap-4">
        <button className="self-start text-sm text-muted hover:text-white" onClick={() => (setCourse(null), setLesson(null))}>
          ← Todos los cursos
        </button>
        <div>
          <span className="text-xs font-semibold text-brand">{LEVELS[course.level]}</span>
          <h2 className="text-2xl font-bold">{course.title}</h2>
          {course.summary && <p className="text-sm text-muted">{course.summary}</p>}
        </div>
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div className="card">{playing ? <LessonView lesson={playing} /> : <p className="text-muted">Este curso todavía no tiene lecciones.</p>}</div>
          <ol className="flex flex-col gap-1">
            {lessons.map((item, index) => (
              <li key={item.id}>
                <button
                  className={`flex w-full items-start gap-3 rounded-lg p-2.5 text-left text-sm transition hover:bg-raised ${item.id === playing?.id ? "bg-brand/15 text-brand" : ""}`}
                  onClick={() => setLesson(item)}
                >
                  <span className="w-5 shrink-0 text-muted">{index + 1}.</span>
                  <span className="flex-1">
                    {item.title}
                    <span className="block text-xs text-muted">
                      {item.kind === "video" ? "Video" : item.kind === "article" ? "Lectura" : "Enlace"}
                      {item.minutes ? ` · ${item.minutes} min` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((item) => {
        const minutes = (item.course_lessons ?? []).reduce((total, lesson) => total + lesson.minutes, 0);
        return (
          <button key={item.id} className="card flex flex-col gap-2 overflow-hidden p-0 text-left transition hover:border-brand/60" onClick={() => setCourse(item)}>
            {item.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- course covers come from any host the admin sets
              <img src={item.cover_url} alt="" className="aspect-video w-full object-cover" />
            ) : (
              <div className="grid aspect-video w-full place-items-center bg-brand/10 text-4xl">🎓</div>
            )}
            <div className="flex flex-col gap-1 p-4 pt-1">
              <span className="text-xs font-semibold text-brand">{LEVELS[item.level]}</span>
              <span className="font-semibold">{item.title}</span>
              {item.summary && <span className="line-clamp-2 text-sm text-muted">{item.summary}</span>}
              <span className="text-xs text-muted">
                {(item.course_lessons ?? []).length} lecciones{minutes ? ` · ${minutes} min` : ""}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
