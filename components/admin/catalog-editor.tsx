"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAzumi } from "@/components/azumi-provider";
import { Button, Field, Notice, PageHeading, Select } from "@/components/ui";
import { dayKey } from "@/lib/azumi-client";
import type { Catalog, Category, Coupon, Product, Promotion } from "@/lib/azumi-types";
import { resourceMeta, type Resource } from "./catalog-screens";

type Values = Record<string, string | number | boolean | null>;
const images = ["sushi", "arroz", "nigiri", "ceviche", "padthai", "pasta", ""];
function defaults(resource: Resource, catalog: Catalog): Values {
  if (resource === "products") return { name: "", slug: "", description: "", category: catalog.categories.find(c => c.active)?.name || "", price: 0, originalPrice: "", image: "sushi", options: "Regular:0", extras: "", active: true, featured: false };
  if (resource === "categories") return { name: "", order: catalog.categories.length, active: true };
  if (resource === "coupons") return { code: "", percent: 10, min: 25, active: true };
  return { name: "", description: "", image: "sushi", product: catalog.products[0]?.id || "", price: catalog.products[0]?.price || 0, start: dayKey(new Date()), end: dayKey(new Date(Date.now() + 30 * 86400000)), days: "0,1,2,3,4,5,6", from: "00:00", to: "23:59", active: true };
}
export function CatalogEditorScreen({ resource, id }: { resource: Resource; id: string }) {
  const { catalog, snapshot } = useAzumi(), current = catalog[resource].find(item => item.id === id);
  if (id !== "nuevo" && !current) return <><PageHeading title="Elemento no encontrado" /><Link className="button secondary" href={`/admin/${resourceMeta[resource].path}`}>Volver al listado</Link></>;
  return <CatalogEditor key={`${resource}-${id}-${snapshot?.revision}`} resource={resource} id={id} initial={current ? { ...current } : defaults(resource, catalog)} />;
}
function CatalogEditor({ resource, id, initial }: { resource: Resource; id: string; initial: Values }) {
  const { catalog, snapshot, busy, run, saveCatalog, notify } = useAzumi(), router = useRouter(), meta = resourceMeta[resource];
  const [values, setValues] = useState<Values>(initial), [baseRevision] = useState(snapshot?.revision);
  const set = (key: string, value: string | number | boolean) => setValues(previous => ({ ...previous, [key]: value }));
  const str = (key: string) => String(values[key] ?? "").trim(), num = (key: string) => Number(values[key]);
  const input = (label: string, key: string, type = "text", required = false) => <Field label={label} type={type} required={required} value={String(values[key] ?? "")} min={type === "number" ? 0 : undefined} step={type === "number" ? "0.01" : undefined} maxLength={type === "text" ? 1000 : undefined} onChange={e => set(key, e.target.value)} />;
  const imageSelect = <Select label="Fotografía" value={str("image")} onChange={e => set("image", e.target.value)}>{images.map(image => <option key={image} value={image}>{image || "Sin fotografía"}</option>)}</Select>;
  function submit() {
    const newId = id === "nuevo" ? resource === "products" ? (str("slug") || str("name")).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : crypto.randomUUID() : id;
    if (!newId || newId === "nuevo") { notify("Elige un identificador diferente para el producto."); return; }
    if (id === "nuevo" && catalog[resource].some(item => item.id === newId)) { notify("Ya existe un elemento con ese identificador."); return; }
    let changes: Partial<Catalog>;
    function upsert<T extends { id: string }>(rows: T[], item: T): T[] { return id === "nuevo" ? [...rows, item] : rows.map(value => value.id === id ? item : value); }
    if (resource === "products") {
      const data: Product = { id: newId, name: str("name"), description: str("description"), category: str("category"), price: num("price"), originalPrice: str("originalPrice") ? num("originalPrice") : null, image: str("image"), options: str("options"), extras: str("extras"), active: !!values.active, featured: !!values.featured };
      changes = { products: upsert(catalog.products, data) };
    } else if (resource === "categories") {
      const data: Category = { id: newId, name: str("name"), order: num("order"), active: !!values.active }, old = catalog.categories.find(c => c.id === id);
      changes = { categories: upsert(catalog.categories, data), ...(old && old.name !== data.name ? { products: catalog.products.map(p => p.category === old.name ? { ...p, category: data.name } : p) } : {}) };
    } else if (resource === "coupons") {
      const data: Coupon = { id: newId, code: str("code").toUpperCase(), percent: num("percent"), min: num("min"), active: !!values.active }; changes = { coupons: upsert(catalog.coupons, data) };
    } else {
      const data: Promotion = { id: newId, name: str("name"), description: str("description"), image: str("image"), product: str("product"), price: num("price"), start: str("start"), end: str("end"), from: str("from"), to: str("to"), days: str("days"), active: !!values.active }; changes = { promotions: upsert(catalog.promotions, data) };
    }
    void run(async () => { await saveCatalog(changes, baseRevision); router.push(`/admin/${meta.path}`); });
  }
  return <><PageHeading title={`${id === "nuevo" ? "Agregar" : "Editar"} ${meta.singular}`} back={`/admin/${meta.path}`} /><form className="card editor-form" data-editing="true" onSubmit={e => { e.preventDefault(); submit(); }}>
    {resource === "products" && <><div className="form-grid">{input("Nombre", "name", "text", true)}{id === "nuevo" ? input("Identificador", "slug") : <Field label="Identificador" value={id} readOnly />}<Select label="Categoría" value={str("category")} onChange={e => set("category", e.target.value)} required>{catalog.categories.filter(c => c.active || c.name === str("category")).map(c => <option key={c.id}>{c.name}</option>)}</Select>{imageSelect}{input("Precio ($)", "price", "number", true)}{input("Precio anterior ($) · opcional", "originalPrice", "number")}</div><label className="field"><span>Descripción</span><textarea required maxLength={1000} value={String(values.description ?? "")} onChange={e => set("description", e.target.value)} /></label>{input("Variantes · Nombre:precio adicional, separadas por comas", "options")}{input("Extras · Nombre:precio adicional, separados por comas", "extras")}<label className="choice"><input type="checkbox" checked={!!values.featured} onChange={e => set("featured", e.target.checked)} />Destacado</label></>}
    {resource === "categories" && <>{input("Nombre", "name", "text", true)}{input("Orden", "order", "number", true)}</>}
    {resource === "coupons" && <>{input("Código", "code", "text", true)}<div className="form-grid">{input("Descuento (%)", "percent", "number", true)}{input("Pedido mínimo ($)", "min", "number", true)}</div></>}
    {resource === "promotions" && <>{input("Nombre", "name", "text", true)}{input("Descripción", "description")}<div className="form-grid">{imageSelect}<Select label="Producto relacionado" value={str("product")} onChange={e => set("product", e.target.value)}>{catalog.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>{input("Precio de referencia ($)", "price", "number", true)}{input("Fecha de inicio", "start", "date", true)}{input("Fecha final", "end", "date", true)}{input("Horario de inicio", "from", "time", true)}{input("Horario final", "to", "time", true)}</div><fieldset className="days-fieldset"><legend>Días disponibles</legend>{["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"].map((name, i) => <label className="choice" key={name}><input type="checkbox" checked={str("days").split(",").includes(String(i))} onChange={e => { const selected = str("days").split(",").filter(Boolean); set("days", (e.target.checked ? [...selected, String(i)] : selected.filter(day => day !== String(i))).sort().join(",")); }} />{name}</label>)}</fieldset><Notice>El banner muestra el precio actual del producto. Edita su precio en Productos.</Notice></>}
    <label className="choice"><input type="checkbox" checked={!!values.active} onChange={e => set("active", e.target.checked)} />{resource === "products" ? "Disponible" : "Activo"}</label><div className="form-actions"><Link className="button ghost" href={`/admin/${meta.path}`}>Cancelar</Link><Button type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</Button></div>
  </form></>;
}
