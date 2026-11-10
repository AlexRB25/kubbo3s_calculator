/** Sender of the panel's emails; the domain is verified in Resend (DNS of kubbo3d.com). */
const FROM = process.env.EMAIL_FROM || "Kubbo3D <soporte@kubbo3d.com>";

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** Sends one email through Resend's API. Returns an error message, or null when it was accepted. */
export async function sendEmail(to: string, subject: string, paragraphs: string[], button?: { label: string; url: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "Falta RESEND_API_KEY en Vercel.";
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d2125;max-width:520px">
${paragraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`).join("\n")}
${button ? `<p style="margin:24px 0"><a href="${escape(button.url)}" style="background:#22c3e6;color:#0b1114;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${escape(button.label)}</a></p>` : ""}
<p style="color:#6b7480;font-size:13px">Kubbo3D · kubbo3d.com</p>
</div>`;
  const text = [...paragraphs, button ? `${button.label}: ${button.url}` : "", "Kubbo3D · kubbo3d.com"].filter(Boolean).join("\n\n");
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
    });
    if (response.ok) return null;
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    return body?.message ?? `Resend respondió ${response.status}.`;
  } catch {
    return "No se pudo conectar con Resend.";
  }
}
