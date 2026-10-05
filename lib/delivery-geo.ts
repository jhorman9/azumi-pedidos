import type { Catalog, Point } from "./azumi-types";

// Preserve existing coverage while converting the old 600x340 editor to WGS84.
// These inherited boundaries must be reviewed against actual streets by the owner.
export function geographicPoint(point: Point, legacy = true): Point {
  if (legacy && point[0] >= 0 && point[0] <= 600 && point[1] >= 0 && point[1] <= 340) {
    return [-79.55 + point[0] / 600 * 0.11, 9.045 - point[1] / 340 * 0.085];
  }
  return point;
}

export const restaurantPoint: Point = geographicPoint([260, 180]);
export const latLng = (point: Point): [number, number] => {
  const [longitude, latitude] = point;
  return [latitude, longitude];
};

export function geographicCatalog(catalog: Catalog): Catalog {
  return { ...catalog, zones: catalog.zones.map(zone => ({ ...zone, coordinateSystem: "wgs84", points: zone.points.map(p => geographicPoint(p, zone.coordinateSystem !== "wgs84")) })) };
}
