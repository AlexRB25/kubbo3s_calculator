/** Country calling codes offered next to phone fields, most used first. */
export const DIAL_CODES: { code: string; label: string }[] = [
  { code: "+52", label: "🇲🇽 +52 México" },
  { code: "+1", label: "🇺🇸 +1 EE. UU. / Canadá" },
  { code: "+34", label: "🇪🇸 +34 España" },
  { code: "+54", label: "🇦🇷 +54 Argentina" },
  { code: "+591", label: "🇧🇴 +591 Bolivia" },
  { code: "+55", label: "🇧🇷 +55 Brasil" },
  { code: "+56", label: "🇨🇱 +56 Chile" },
  { code: "+57", label: "🇨🇴 +57 Colombia" },
  { code: "+506", label: "🇨🇷 +506 Costa Rica" },
  { code: "+53", label: "🇨🇺 +53 Cuba" },
  { code: "+593", label: "🇪🇨 +593 Ecuador" },
  { code: "+503", label: "🇸🇻 +503 El Salvador" },
  { code: "+502", label: "🇬🇹 +502 Guatemala" },
  { code: "+504", label: "🇭🇳 +504 Honduras" },
  { code: "+505", label: "🇳🇮 +505 Nicaragua" },
  { code: "+507", label: "🇵🇦 +507 Panamá" },
  { code: "+595", label: "🇵🇾 +595 Paraguay" },
  { code: "+51", label: "🇵🇪 +51 Perú" },
  { code: "+1 787", label: "🇵🇷 +1 787 Puerto Rico" },
  { code: "+1 809", label: "🇩🇴 +1 809 Rep. Dominicana" },
  { code: "+598", label: "🇺🇾 +598 Uruguay" },
  { code: "+58", label: "🇻🇪 +58 Venezuela" },
  { code: "+44", label: "🇬🇧 +44 Reino Unido" },
  { code: "+49", label: "🇩🇪 +49 Alemania" },
  { code: "+33", label: "🇫🇷 +33 Francia" },
  { code: "+39", label: "🇮🇹 +39 Italia" },
];

/** The code a workshop most likely uses, from its currency. */
const BY_CURRENCY: Record<string, string> = {
  MXN: "+52", USD: "+1", CAD: "+1", EUR: "+34", ARS: "+54", BOB: "+591", BRL: "+55", CLP: "+56", COP: "+57", CRC: "+506",
  GTQ: "+502", HNL: "+504", NIO: "+505", PAB: "+507", PYG: "+595", PEN: "+51", DOP: "+1 809", UYU: "+598", VES: "+58", GBP: "+44",
};
export const defaultDialCode = (currency?: string) => BY_CURRENCY[currency ?? ""] ?? "+52";

/** Splits "+52 33 2708 1391" into code and number. A number saved without a code keeps `fallback`. */
export function splitPhone(value: string, fallback: string) {
  const text = value.trim();
  if (!text.startsWith("+")) return { code: fallback, number: text };
  // Longest code first, so "+1 787" wins over "+1".
  const match = [...DIAL_CODES].sort((a, b) => b.code.length - a.code.length).find((item) => text.startsWith(item.code));
  if (match) return { code: match.code, number: text.slice(match.code.length).trim() };
  const [code, ...rest] = text.split(/\s+/);
  return { code, number: rest.join(" ") };
}

/** "+52" + "3327081391" -> "+52 3327081391"; empty when there is no number. */
export const joinPhone = (code: string, number: string) => (number.trim() ? `${code} ${number.trim()}` : "");
