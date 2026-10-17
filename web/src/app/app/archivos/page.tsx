"use client";

import { useEffect, useState } from "react";
import { Empty, PageHeader, TableCard } from "@/components/app/ui";
import { deleteFile, fileSize, listFiles, openStoredFile, saveFile, type UserFile } from "@/lib/files";
import { useSession } from "@/lib/session";

const KIND_LABELS: Record<UserFile["kind"], string> = { model: "Modelo 3D", image: "Imagen", other: "Otro" };

/** "Mis archivos": the same library the 3D tools use. */
export default function FilesPage() {
  const { session } = useSession();
  const [files, setFiles] = useState<UserFile[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    listFiles()
      .then((list) => current && setFiles(list))
      .catch((reason: Error) => current && setError(reason.message));
    return () => {
      current = false;
    };
  }, []);

  async function upload(list: FileList | null) {
    if (!list?.length || !session) return;
    setError("");
    try {
      for (const file of Array.from(list)) {
        setBusy(`Subiendo ${file.name}…`);
        await saveFile(file, session.user.id);
      }
      setFiles(await listFiles());
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function download(file: UserFile) {
    setError("");
    try {
      const opened = await openStoredFile(file);
      const url = URL.createObjectURL(opened);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function remove(file: UserFile) {
    if (!window.confirm(`¿Borrar "${file.name}"? También desaparece de las herramientas 3D.`)) return;
    setError("");
    try {
      await deleteFile(file);
      setFiles((list) => list?.filter((item) => item.id !== file.id) ?? null);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  return (
    <>
      <PageHeader title="Mis archivos">
        <label className="btn btn-primary">
          {busy || "Subir archivos"}
          <input
            type="file"
            multiple
            accept=".stl,.obj,.3mf,.png,.jpg,.jpeg,.webp"
            className="sr-only"
            disabled={Boolean(busy)}
            onChange={(event) => {
              upload(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </PageHeader>
      <p className="text-sm text-muted">
        Tus modelos 3D e imágenes, guardados en tu cuenta. Son los mismos que abres en las herramientas 3D; solo tú puedes verlos.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {files === null ? (
        !error && <p className="text-sm text-muted">Cargando…</p>
      ) : files.length === 0 ? (
        <Empty>Todavía no hay archivos. Súbelos aquí o desde las herramientas 3D.</Empty>
      ) : (
        <TableCard>
          <table className="table">
            <thead>
              <tr>
                <th>Archivo</th>
                <th>Tipo</th>
                <th>Subido desde</th>
                <th className="num">Tamaño</th>
                <th>Fecha</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id}>
                  <td className="max-w-72 truncate">{file.name}</td>
                  <td className="text-muted">{KIND_LABELS[file.kind]}</td>
                  <td className="text-muted">{file.app === "tools" ? "Herramientas 3D" : "Calculadora"}</td>
                  <td className="num">{fileSize(file.size)}</td>
                  <td className="whitespace-nowrap text-muted">{new Date(file.created_at).toLocaleDateString("es-MX")}</td>
                  <td className="num">
                    <div className="flex justify-end gap-2">
                      <button className="btn" onClick={() => download(file)}>
                        Descargar
                      </button>
                      <button className="btn btn-danger" onClick={() => remove(file)}>
                        Borrar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </>
  );
}
