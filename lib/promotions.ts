import type { Catalog, Product, Promotion } from "./azumi-types";

export function promoActive(p: Promotion, now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Panama", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  return p.active && date >= p.start && date <= p.end && p.days.split(",").includes(String(day)) && (p.from <= p.to ? time >= p.from && time <= p.to : time >= p.from || time <= p.to);
}
export function promotionPrice(product: Product, catalog: Catalog, now = new Date()) {
  const prices = catalog.promotions.filter(p => p.product === product.id && promoActive(p, now)).map(p => p.price);
  return Math.min(product.price, ...prices);
}
