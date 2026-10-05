import { NextRequest, NextResponse } from "next/server";
import { customerSession } from "@/lib/customer-store";
import { geoapifyResults, type LocationResult } from "@/lib/location-results";

export const runtime = "nodejs";
type Result = LocationResult;
const cache = new Map<string, { expires: number; results: Result[] }>();
let nextRequest = 0;
const attempts = new Map<string, number>();

export async function GET(request: NextRequest) {
  const customer = await customerSession(request.cookies.get("azumi_customer")?.value);
  if (!customer) return NextResponse.json({ error: "Inicia sesión para buscar direcciones." }, { status: 401 });
  const apiKey = process.env.AZUMI_GEOAPIFY_API_KEY;
  const mode = request.nextUrl.searchParams.get("mode") || "search", provider = apiKey ? "geoapify" : "nominatim";
  const reply = (data: unknown) => NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  if (mode === "config") return reply({ provider, autocomplete: !!apiKey });
  if (!["search", "autocomplete"].includes(mode)) return NextResponse.json({ error: "Búsqueda inválida." }, { status: 400 });
  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (query.length < 3 || query.length > 150) return NextResponse.json({ error: "Escribe una calle o lugar válido." }, { status: 400 });
  if (!apiKey && mode === "autocomplete") return reply({ results: [], provider });
  const key = `${provider}:${mode}:${query.toLowerCase()}`, cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return reply({ results: cached.results, provider });
  const limited = apiKey ? Date.now() - (attempts.get(customer.owner) || 0) < 450 : Date.now() < nextRequest;
  if (limited) return NextResponse.json({ error: "Espera un momento antes de buscar de nuevo." }, { status: 429, headers: { "Retry-After": "1" } });
  if (apiKey) {
    if (attempts.size >= 1000) for (const [owner, time] of attempts) if (Date.now() - time > 60000) attempts.delete(owner);
    attempts.set(customer.owner, Date.now());
  } else nextRequest = Date.now() + 1100;
  try {
    if (apiKey) {
      const url = new URL(`https://api.geoapify.com/v1/geocode/${mode === "autocomplete" ? "autocomplete" : "search"}`);
      url.search = new URLSearchParams({ text: query, apiKey, format: "json", lang: "es", limit: "5", filter: "countrycode:pa", bias: "proximity:-79.5,9.0" }).toString();
      const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (!response.ok) throw new Error("Geocoder unavailable");
      const results = geoapifyResults(await response.json());
      if (cache.size >= 250) cache.clear();
      cache.set(key, { expires: Date.now() + 3600000, results });
      return reply({ results, provider });
    }
    const url = new URL(process.env.AZUMI_GEOCODER_URL || "https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({ q: query, format: "jsonv2", countrycodes: "pa", viewbox: "-79.65,9.12,-79.35,8.85", limit: "5", "accept-language": "es" }).toString();
    const response = await fetch(url, { headers: { "User-Agent": "AzumiDelivery/1.0", Referer: request.nextUrl.origin }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Geocoder unavailable");
    const rows = await response.json() as { display_name: string; lon: string; lat: string }[];
    const results: Result[] = rows.filter(row => Number.isFinite(Number(row.lon)) && Number.isFinite(Number(row.lat))).map(row => ({ id: `${row.lon},${row.lat}:${row.display_name}`, label: row.display_name.slice(0,250), point: [Number(row.lon), Number(row.lat)] }));
    if (cache.size >= 250) cache.clear();
    cache.set(key, { expires: Date.now() + 86400000, results });
    return reply({ results, provider });
  } catch { return NextResponse.json({ error: "La búsqueda no está disponible. Puedes seleccionar el punto en el mapa." }, { status: 503 }); }
}
