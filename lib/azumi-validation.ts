import type { Catalog, Choice, Customer, Item, Order, Point, Totals, Zone } from "./azumi-types";

export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppError("Datos inválidos.");
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, max = 200, required = false): string {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string" || value.length > max) throw new AppError(`${label}: texto inválido o demasiado largo.`);
  const result = (value as string).trim();
  if (required && !result) throw new AppError(`${label} es obligatorio.`);
  return result;
}
export function number(value: unknown, label: string, max = 100000): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) throw new AppError(`${label}: número inválido.`);
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new AppError("Estado inválido.");
  return value;
}
export const cents = (value: number) => Math.round(value * 100);
function price(value: unknown, label: string): number { return cents(number(value, label, 10000)) / 100; }
export function choices(value: unknown): Choice[] {
  const raw = text(value, "Opciones", 1000);
  if (!raw) return [];
  const result = raw.split(",").map(entry => {
    const parts = entry.split(":");
    if (parts.length !== 2 || !parts[1].trim()) throw new AppError("Las opciones deben usar Nombre:precio.");
    return { name: text(parts[0], "Opción", 80, true), cost: price(Number(parts[1]), "Precio de opción") };
  });
  if (result.length > 30 || new Set(result.map(c => c.name)).size !== result.length) throw new AppError("Opciones repetidas o demasiadas opciones.");
  return result;
}
export function point(value: unknown): Point {
  if (!Array.isArray(value) || value.length !== 2) throw new AppError("Ubicación inválida.");
  return [number(value[0], "Coordenada", 600), number(value[1], "Coordenada", 340)];
}
export function pointInPolygon(p: Point, vertices: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [xi, yi] = vertices[i], [xj, yj] = vertices[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polygon(value: unknown): Point[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > 100) throw new AppError("La zona necesita entre 3 y 100 vértices.");
  const pts = value.map(point);
  if (new Set(pts.map(p => p.join(","))).size !== pts.length) throw new AppError("El polígono tiene vértices repetidos.");
  const area = Math.abs(pts.reduce((sum, p, i) => { const q = pts[(i + 1) % pts.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  if (area < 50) throw new AppError("El polígono es demasiado pequeño.");
  const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const onSegment = (a: Point, b: Point, p: Point) => cross(a,b,p) === 0 && p[0] >= Math.min(a[0],b[0]) && p[0] <= Math.max(a[0],b[0]) && p[1] >= Math.min(a[1],b[1]) && p[1] <= Math.max(a[1],b[1]);
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    if (j === i + 1 || (i === 0 && j === pts.length - 1)) continue;
    const a = pts[i], b = pts[(i+1)%pts.length], c = pts[j], d = pts[(j+1)%pts.length];
    if ((cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) || onSegment(a,b,c) || onSegment(a,b,d) || onSegment(c,d,a) || onSegment(c,d,b)) throw new AppError("El polígono tiene líneas que se cruzan.");
  }
  return pts;
}
const images = ["sushi", "arroz", "nigiri", "ceviche", "padthai", "pasta", ""];
function image(value: unknown): string { const name = text(value, "Imagen", 30); if (!images.includes(name)) throw new AppError("Imagen inválida."); return name; }
function id(value: unknown): string { const result = text(value, "Identificador", 80, true); if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw new AppError("Identificador inválido."); return result; }
function rows(value: unknown): Record<string, unknown>[] { if (!Array.isArray(value) || value.length > 1000) throw new AppError("Lista inválida."); const result = value.map(object); if (new Set(result.map(r => id(r.id))).size !== result.length) throw new AppError("Identificadores repetidos."); return result; }

export function validateCatalog(input: unknown): Catalog {
  const d = object(input);
  const categories = rows(d.categories).map(c => ({ id: id(c.id), name: text(c.name,"Categoría",80,true), order: number(c.order,"Orden",1000), active: bool(c.active) }));
  if (new Set(categories.map(c=>c.name.toLowerCase())).size !== categories.length) throw new AppError("Categorías repetidas.");
  const products = rows(d.products).map(p => {
    const category = text(p.category,"Categoría",80,true);
    if (!categories.some(c=>c.name === category)) throw new AppError("La categoría del producto no existe.");
    choices(p.options); choices(p.extras);
    return { id:id(p.id), name:text(p.name,"Nombre",120,true), description:text(p.description,"Descripción",1000,true), category, price:price(p.price,"Precio"), originalPrice:p.originalPrice == null ? null : price(p.originalPrice,"Precio anterior"), image:image(p.image), options:text(p.options,"Variantes",1000), extras:text(p.extras,"Extras",1000), active:bool(p.active), featured:bool(p.featured) };
  });
  const zones: Zone[] = rows(d.zones).map(z => {
    if (z.type !== "allowed" && z.type !== "restricted") throw new AppError("Tipo de zona inválido.");
    const minutesMin = number(z.minutesMin,"Tiempo",240), minutesMax = number(z.minutesMax,"Tiempo",240);
    if (minutesMax < minutesMin) throw new AppError("Revisa los tiempos estimados.");
    return { id:id(z.id), name:text(z.name,"Zona",120,true), type:z.type, fee:price(z.fee,"Tarifa"), min:price(z.min,"Pedido mínimo"), minutesMin, minutesMax, active:bool(z.active), priority:number(z.priority,"Prioridad",1000), points:polygon(z.points) };
  });
  const coupons = rows(d.coupons).map(c=>({id:id(c.id), code:text(c.code,"Código",40,true).toUpperCase(), percent:number(c.percent,"Porcentaje",100), min:price(c.min,"Mínimo"), active:bool(c.active)}));
  if (new Set(coupons.map(c=>c.code)).size !== coupons.length) throw new AppError("Cupones repetidos.");
  const promotions = rows(d.promotions).map(p=> {
    const start = text(p.start,"Inicio",10,true), end = text(p.end,"Fin",10,true), from = text(p.from,"Hora",5,true), to = text(p.to,"Hora",5,true), days = text(p.days,"Días",30,true);
    const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
    if (!validDate(start) || !validDate(end) || end < start || !/^([0-6],)*[0-6]$/.test(days) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(from) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(to)) throw new AppError("Vigencia de promoción inválida.");
    const product = id(p.product);
    if (!products.some(item=>item.id===product)) throw new AppError("Producto de promoción inválido.");
    return {id:id(p.id),name:text(p.name,"Promoción",120,true),description:text(p.description,"Descripción",1000),image:image(p.image),price:price(p.price,"Precio"),product,start,end,from,to,days,active:bool(p.active)};
  });
  const settings = object(d.settings);
  return { products, categories, zones, coupons, promotions, settings:{restaurantOpen:bool(settings.restaurantOpen),deliveryOpen:bool(settings.deliveryOpen),whatsapp:false} };
}

export function buildOrder(input: unknown, catalog: Catalog): Omit<Order,"id"|"date"> {
  const d = object(input);
  if (!catalog.settings.restaurantOpen) throw new AppError("Azumi no acepta pedidos en este momento.",409);
  if (!Array.isArray(d.items) || !d.items.length || d.items.length > 50) throw new AppError("El carrito debe contener entre 1 y 50 productos.");
  const items: Item[] = d.items.map(raw=> {
    const item=object(raw), p=catalog.products.find(p=>p.id===item.productId && p.active && catalog.categories.some(c=>c.active && c.name===p.category));
    if (!p) throw new AppError("Un producto ya no está disponible. Revisa tu carrito.",409);
    const qty=number(item.qty,"Cantidad",99);
    if (!Number.isInteger(qty) || qty < 1) throw new AppError("Cantidad inválida.");
    const opts=choices(p.options), variant=text(item.variant,"Variante",80), selected=opts.find(o=>o.name===variant);
    if (opts.length ? !selected : Boolean(variant)) throw new AppError("La variante ya no está disponible.",409);
    if (!Array.isArray(item.extras) || item.extras.length>30) throw new AppError("Extras inválidos.");
    const extras=item.extras.map(raw=> { const name=text(object(raw).name,"Extra",80,true), extra=choices(p.extras).find(e=>e.name===name); if (!extra) throw new AppError("Un extra ya no está disponible.",409); return extra; });
    if (new Set(extras.map(e=>e.name)).size!==extras.length) throw new AppError("Extras repetidos.");
    const unit=(cents(p.price)+cents(selected?.cost||0)+extras.reduce((a,e)=>a+cents(e.cost),0))/100;
    return {productId:p.id,name:p.name,image:p.image,qty,unit,variant,extras,notes:text(item.notes,"Observaciones",200)};
  });
  const subtotalCents=items.reduce((sum,i)=>sum+cents(i.unit)*i.qty,0);
  if (d.fulfillment !== "pickup" && d.fulfillment !== "delivery") throw new AppError("Modalidad inválida.");
  const fulfillment=d.fulfillment, deliveryPoint=fulfillment==="delivery"?point(d.point):null;
  let zone;
  if (deliveryPoint) {
    if (!catalog.settings.deliveryOpen) throw new AppError("El delivery está pausado.",409);
    const matches=catalog.zones.filter(z=>z.active && pointInPolygon(deliveryPoint,z.points));
    if (matches.some(z=>z.type==="restricted")) throw new AppError("No realizamos delivery en esta ubicación.",409);
    zone=matches.filter(z=>z.type==="allowed").sort((a,b)=>b.priority-a.priority)[0];
    if (!zone) throw new AppError("La ubicación está fuera de cobertura.",409);
    if (subtotalCents<cents(zone.min)) throw new AppError(`Pedido mínimo en ${zone.name}: $${zone.min.toFixed(2)}.`,409);
  }
  const code=text(d.coupon,"Cupón",40).toUpperCase(), coupon=code?catalog.coupons.find(c=>c.active && c.code===code):null;
  if (code && (!coupon || subtotalCents<cents(coupon.min))) throw new AppError("El cupón ya no es válido para este pedido.",409);
  const discountCents=coupon?Math.round(subtotalCents*coupon.percent/100):0, deliveryCents=zone?cents(zone.fee):0;
  const totals: Totals={subtotal:subtotalCents/100,discount:discountCents/100,delivery:deliveryCents/100,total:(subtotalCents-discountCents+deliveryCents)/100};
  if (cents(number(d.expectedTotal,"Total esperado"))!==cents(totals.total)) throw new AppError("El precio cambió. Revisa el total actualizado antes de confirmar.",409);
  const c=object(d.customer), payment=text(c.payment,"Método de pago",40,true);
  if (!["Efectivo","Punto de venta al recibir"].includes(payment)) throw new AppError("Selecciona un método de pago al recibir.");
  const phone=text(c.phone,"Teléfono",30,true).replace(/[^\d]/g,"");
  if (phone.length<8 || phone.length>15) throw new AppError("Teléfono inválido.");
  const email=text(c.email,"Correo",150);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("Correo inválido.");
  const cash=payment==="Efectivo"?price(Number(c.cash),"Efectivo"):0;
  if (payment==="Efectivo" && cents(cash)<cents(totals.total)) throw new AppError("El efectivo debe cubrir el total.");
  const customer: Customer={name:text(c.name,"Nombre",80,true),lastName:text(c.lastName,"Apellido",80),phone,email,building:text(c.building,"Casa o apartamento",150,fulfillment==="delivery"),floor:text(c.floor,"Piso",30),reference:text(c.reference,"Referencia",200),instructions:text(c.instructions,"Instrucciones",500),payment,cash};
  return {items,customer,fulfillment,address:fulfillment==="delivery"?text(d.address,"Dirección",250,true):"Azumi · San Francisco, Calle 72",point:deliveryPoint,zone:zone?.name||null,minutes:zone?`${zone.minutesMin}–${zone.minutesMax} minutos`:"20–30 minutos",totals,status:"Recibido",whatsapp:false,paymentStatus:"Pendiente",coupon:code};
}
