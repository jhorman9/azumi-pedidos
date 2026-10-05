import type { Catalog, Choice, Customer, Item, Point, Product, Order } from "./azumi-types";
import { geographicPoint } from "./delivery-geo";
import { promotionPrice } from "./promotions";
export { promoActive } from "./promotions";

export type CartItem = Item & { unavailable?: boolean };
export type Address = { id: string; label: string; address: string; point: Point };
export type Personal = { cart: CartItem[]; favorites: string[]; addresses: Address[]; profile: Partial<Customer>; coupon: string; deliveryPoint: Point | null; deliveryPointSystem: "wgs84"; deliveryAddress: string; fulfillment: "pickup" | "delivery" };
export type Snapshot = Catalog & { revision: number; orders: Order[]; adminOrders?: Order[]; admin: boolean; customerAuthenticated: boolean; development: boolean; serverTime: string };
export const emptyPersonal: Personal = { cart: [], favorites: [], addresses: [], profile: {}, coupon: "", deliveryPoint: null, deliveryPointSystem: "wgs84", deliveryAddress: "", fulfillment: "delivery" };
export const emptyCatalog: Catalog = { products: [], categories: [], zones: [], promotions: [], coupons: [], settings: { restaurantOpen: false, deliveryOpen: false, whatsapp: false } };
export const money = (n: number) => new Intl.NumberFormat("es-PA", { style: "currency", currency: "USD" }).format(n);
export const dayKey = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
export const dateLabel = (value: string) => new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
export const options = (value: string): Choice[] => value.split(",").filter(Boolean).map(entry => { const [name, cost] = entry.split(":"); return { name: name.trim(), cost: Number(cost) || 0 }; });
export const availableProducts = (catalog: Catalog) => catalog.products.filter(p => p.active && catalog.categories.some(c => c.active && c.name === p.category)).map(p => {
  const price = promotionPrice(p, catalog);
  return price < p.price ? { ...p, originalPrice: p.price, price } : p;
});
export const subtotal = (items: Item[]) => items.reduce((sum, i) => sum + Math.round(i.unit * 100) * i.qty, 0) / 100;
export function pointInPolygon(point: Point, vertices: Point[]) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [xi, yi] = vertices[i], [xj, yj] = vertices[j];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function coverage(catalog: Catalog, items: Item[], point: Point | null) {
  if (!catalog.settings.deliveryOpen) return { ok: false, message: "El delivery está pausado. Puedes pedir para retirar." };
  if (!point) return { ok: false, message: "Selecciona una zona o un punto en el mapa." };
  const matches = catalog.zones.filter(z => z.active && pointInPolygon(point, z.points));
  if (matches.some(z => z.type === "restricted")) return { ok: false, message: "No realizamos delivery en esta ubicación." };
  const zone = matches.filter(z => z.type === "allowed").sort((a, b) => b.priority - a.priority)[0];
  if (!zone) return { ok: false, message: "Esta ubicación está fuera de nuestra cobertura." };
  if (subtotal(items) < zone.min) return { ok: false, zone, message: `Pedido mínimo en ${zone.name}: ${money(zone.min)}. Agrega ${money(zone.min - subtotal(items))}.` };
  return { ok: true, zone, message: `${zone.name} · ${money(zone.fee)} · ${zone.minutesMin}–${zone.minutesMax} min` };
}
export function cartTotals(catalog: Catalog, personal: Personal, items = personal.cart) {
  const sub = subtotal(items), coupon = catalog.coupons.find(c => c.active && c.code === personal.coupon && sub >= c.min);
  const discount = coupon ? Math.round(Math.round(sub * 100) * coupon.percent / 100) / 100 : 0;
  const cov = coverage(catalog, items, personal.deliveryPoint);
  const delivery = personal.fulfillment === "delivery" && cov.ok ? cov.zone!.fee : 0;
  return { subtotal: sub, discount, delivery, total: Math.round((sub - discount + delivery) * 100) / 100 };
}
export function createItem(product: Product, variant: string, selectedExtras: string[], qty: number, notes: string): CartItem {
  const choice = options(product.options).find(v => v.name === variant), extras = options(product.extras).filter(e => selectedExtras.includes(e.name));
  const unit = (Math.round(product.price * 100) + Math.round((choice?.cost || 0) * 100) + extras.reduce((sum, e) => sum + Math.round(e.cost * 100), 0)) / 100;
  return { productId: product.id, name: product.name, image: product.image, qty, variant, extras, unit, notes: notes.trim().slice(0, 200) };
}
export function reconcileCart(items: CartItem[], catalog: Catalog): CartItem[] {
  return items.map(item => {
    const p = availableProducts(catalog).find(p => p.id === item.productId);
    if (!p || (options(p.options).length && !options(p.options).some(v => v.name === item.variant)) || item.extras.some(e => !options(p.extras).some(x => x.name === e.name))) return { ...item, unavailable: true };
    return createItem(p, item.variant, item.extras.map(e => e.name), item.qty, item.notes);
  });
}
export { statusOptions } from "./order-status";
export function readPersonal(): Personal {
  try {
    const raw = JSON.parse(localStorage.getItem("azumi-customer-v2") || "null");
    if (!raw || typeof raw !== "object") return structuredClone(emptyPersonal);
    const result = { ...structuredClone(emptyPersonal), ...raw } as Personal;
    result.cart = Array.isArray(raw.cart) ? raw.cart.filter((i: CartItem) => i && typeof i.productId === "string" && Number.isInteger(i.qty) && i.qty > 0 && i.qty <= 99 && Array.isArray(i.extras) && typeof i.notes === "string") : [];
    result.favorites = Array.isArray(raw.favorites) ? raw.favorites.filter((s: unknown) => typeof s === "string") : [];
    result.addresses = Array.isArray(raw.addresses) ? raw.addresses.filter((a: Address) => a && typeof a.label === "string" && typeof a.address === "string" && Array.isArray(a.point)).map((a: Address, i: number) => ({ ...a, id: a.id || `saved-${i}` })) : [];
    result.profile = raw.profile && typeof raw.profile === "object" ? raw.profile : {};
    result.coupon = typeof raw.coupon === "string" ? raw.coupon : "";
    result.deliveryAddress = typeof raw.deliveryAddress === "string" ? raw.deliveryAddress : "";
    result.deliveryPoint = Array.isArray(raw.deliveryPoint) && raw.deliveryPoint.length === 2 && raw.deliveryPoint.every(Number.isFinite) ? geographicPoint(raw.deliveryPoint, raw.deliveryPointSystem !== "wgs84") : null;
    result.deliveryPointSystem = "wgs84";
    if (raw.deliveryPointSystem !== "wgs84") result.addresses = result.addresses.map(address => ({ ...address, point: geographicPoint(address.point) }));
    result.fulfillment = raw.fulfillment === "pickup" ? "pickup" : "delivery";
    return result;
  } catch { return structuredClone(emptyPersonal); }
}
