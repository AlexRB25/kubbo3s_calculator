// The 3D scanner page lives on the tools site (tools.kubbo3d.com) but its API stays here, next to the
// Stripe and KIRI keys. These helpers let that site (and only it) call /api/escaner/*.

const allowed = () => [process.env.PB_TOOLS_URL, "http://localhost:3002"].filter(Boolean).map((url) => new URL(url!).origin);

/** The request's Origin when it is the tools site, else null. */
export function toolsOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin && allowed().includes(origin) ? origin : null;
}

function headers(request: Request): Record<string, string> {
  const origin = toolsOrigin(request);
  return origin
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", Vary: "Origin" }
    : {};
}

/** Answer to the browser's preflight. */
export const preflight = (request: Request) => new Response(null, { status: 204, headers: headers(request) });

/** The same response with the CORS headers for the tools site. */
export function withCors(request: Request, response: Response) {
  for (const [key, value] of Object.entries(headers(request))) response.headers.set(key, value);
  return response;
}
