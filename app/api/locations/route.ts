import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
type Result = { label: string; point: [number, number] };
const cache = new Map<string, { expires: number; results: Result[] }>();
let nextRequest = 0;

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (query.length < 3 || query.length > 150) return NextResponse.json({ error: "Escribe una calle o lugar válido." }, { status: 400 });
  const key = query.toLowerCase(), cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return NextResponse.json({ results: cached.results });
  if (Date.now() < nextRequest) return NextResponse.json({ error: "Espera un momento antes de buscar de nuevo." }, { status: 429, headers: { "Retry-After": "1" } });
  nextRequest = Date.now() + 1100;
  try {
    const url = new URL(process.env.AZUMI_GEOCODER_URL || "https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({ q: query, format: "jsonv2", countrycodes: "pa", viewbox: "-79.65,9.12,-79.35,8.85", limit: "5", "accept-language": "es" }).toString();
    const response = await fetch(url, { headers: { "User-Agent": "AzumiDelivery/1.0", Referer: request.nextUrl.origin }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Geocoder unavailable");
    const rows = await response.json() as { display_name: string; lon: string; lat: string }[];
    const results: Result[] = rows.filter(row => Number.isFinite(Number(row.lon)) && Number.isFinite(Number(row.lat))).map(row => ({ label: row.display_name, point: [Number(row.lon), Number(row.lat)] }));
    if (cache.size >= 250) cache.clear();
    cache.set(key, { expires: Date.now() + 86400000, results });
    return NextResponse.json({ results });
  } catch { return NextResponse.json({ error: "La búsqueda no está disponible. Puedes seleccionar el punto en el mapa." }, { status: 503 }); }
}
