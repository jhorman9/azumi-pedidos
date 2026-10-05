import type { Point } from "./azumi-types";

export type LocationResult = { id: string; label: string; point: Point; building?: string };
export function geoapifyResults(data: unknown): LocationResult[] {
  if (!data || typeof data !== "object" || !("results" in data) || !Array.isArray(data.results)) throw new Error("Invalid geocoder response");
  return data.results.flatMap((row: unknown) => {
    if (!row || typeof row !== "object") return [];
    const value = row as Record<string, unknown>;
    if (typeof value.formatted !== "string" || typeof value.lon !== "number" || typeof value.lat !== "number" || !Number.isFinite(value.lon) || !Number.isFinite(value.lat) || Math.abs(value.lon) > 180 || Math.abs(value.lat) > 90) return [];
    const name = typeof value.name === "string" ? value.name : "";
    const building = name && (value.result_type === "building" || value.result_type === "amenity" || /\bP[.\s]*H\b/i.test(name)) ? name.slice(0, 150) : "";
    return [{ id: typeof value.place_id === "string" ? value.place_id : `${value.lon},${value.lat}:${value.formatted}`, label: value.formatted.slice(0, 250), point: [value.lon, value.lat] as Point, building }];
  }).slice(0, 5);
}
