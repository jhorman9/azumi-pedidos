"use client";
import { useState } from "react";
import Link from "next/link";
import { useAzumi } from "@/components/azumi-provider";
import { Badge, Button, Field, Icon, PageHeading, ProductPhoto } from "@/components/ui";
import { money, promoActive } from "@/lib/azumi-client";
import type { Point, Settings } from "@/lib/azumi-types";
import { restaurantPoint } from "@/lib/delivery-geo";

export type Resource = "products" | "categories" | "promotions" | "coupons";
export const resourceMeta: Record<Resource, { title: string; path: string; singular: string }> = { products: { title: "Productos", path: "productos", singular: "producto" }, categories: { title: "Categorías", path: "categorias", singular: "categoría" }, promotions: { title: "Promociones", path: "promociones", singular: "promoción" }, coupons: { title: "Cupones", path: "cupones", singular: "cupón" } };
export function CatalogScreen({ resource }: { resource: Resource }) {
  const { catalog, busy, run, saveCatalog } = useAzumi(), meta = resourceMeta[resource], [query, setQuery] = useState("");
  const editLink = (id: string) => <Link className="link-button" href={`/admin/${meta.path}/${id}`}>Editar →</Link>;
  return <><div className="section-heading"><PageHeading title={meta.title} eyebrow="Tu restaurante, a tu manera" /><Link className="button small" href={`/admin/${meta.path}/nuevo`}>+ Agregar {meta.singular}</Link></div>
    {resource === "products" && <><label className="search-link"><Icon name="search" /><input type="search" placeholder="Buscar producto" aria-label="Buscar producto" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="card table-wrap"><table><thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Disponibilidad</th><th>Acciones</th></tr></thead><tbody>{catalog.products.filter(p => p.name.toLowerCase().includes(query.toLowerCase())).map(p => <tr key={p.id}><td><div className="row"><ProductPhoto image={p.image} name={p.name} className="table-photo" /><strong>{p.name}</strong></div></td><td>{p.category}</td><td>{money(p.price)}</td><td><Badge coral={!p.active}>{p.active ? "Disponible" : "Inactivo"}</Badge></td><td><div className="inline-actions">{editLink(p.id)}<button className="link-button" disabled={busy} onClick={() => void run(() => saveCatalog({ products: catalog.products.map(value => value.id === p.id ? { ...value, active: !value.active } : value) }))}>{p.active ? "Desactivar" : "Activar"}</button></div></td></tr>)}</tbody></table></div></>}
    {resource === "categories" && <div className="card table-wrap"><table><thead><tr><th>Nombre</th><th>Orden</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{catalog.categories.slice().sort((a, b) => a.order - b.order).map(c => <tr key={c.id}><td>{c.name}</td><td>{c.order}</td><td><Badge coral={!c.active}>{c.active ? "Activa" : "Inactiva"}</Badge></td><td>{editLink(c.id)}</td></tr>)}</tbody></table></div>}
    {resource === "promotions" && <div className="promotion-grid">{catalog.promotions.map(p => <article className="card" key={p.id}><ProductPhoto image={p.image} name={p.name} className="promotion-photo" /><h3>{p.name}</h3><p className="muted">{p.description}</p><p className="helper-text">{p.start} → {p.end}</p><Badge coral={!promoActive(p)}>{promoActive(p) ? "Vigente" : "No vigente"}</Badge><Link className="button secondary spacer" href={`/admin/promociones/${p.id}`}>Editar promoción</Link></article>)}</div>}
    {resource === "coupons" && <div className="card table-wrap"><table><thead><tr><th>Código</th><th>Descuento</th><th>Mínimo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{catalog.coupons.map(c => <tr key={c.id}><td><strong>{c.code}</strong></td><td>{c.percent}%</td><td>{money(c.min)}</td><td><Badge coral={!c.active}>{c.active ? "Activo" : "Inactivo"}</Badge></td><td>{editLink(c.id)}</td></tr>)}</tbody></table></div>}
  </>;
}
export function SettingsScreen() {
  const { catalog, snapshot } = useAzumi();
  return <SettingsForm key={snapshot?.revision} settings={catalog.settings} />;
}
function SettingsForm({ settings }: { settings: Settings }) {
  const { busy, run, saveCatalog } = useAzumi();
  const [restaurantOpen, setRestaurantOpen] = useState(settings.restaurantOpen), [deliveryOpen, setDeliveryOpen] = useState(settings.deliveryOpen);
  const [location, setLocation] = useState<Point>(settings.restaurantPoint || restaurantPoint);
  const [confirmed, setConfirmed] = useState(!!settings.restaurantPoint);
  return <><PageHeading title="Configuración" /><form className="card narrow-form" data-editing="true" onSubmit={e => { e.preventDefault(); void run(() => saveCatalog({ settings: { restaurantOpen, deliveryOpen, whatsapp: false, ...(confirmed ? { restaurantPoint: location } : {}) } })); }}>
    <h3>Disponibilidad</h3><label className="choice"><input type="checkbox" checked={restaurantOpen} onChange={e => setRestaurantOpen(e.target.checked)} />Aceptar pedidos</label><label className="choice"><input type="checkbox" checked={deliveryOpen} onChange={e => setDeliveryOpen(e.target.checked)} />Delivery habilitado</label>
    <h3>Ubicación del restaurante</h3><div className="form-grid"><Field label="Latitud" type="number" min={-90} max={90} step="0.000001" value={location[1]} onChange={e => setLocation(p => [p[0], Number(e.target.value)])} /><Field label="Longitud" type="number" min={-180} max={180} step="0.000001" value={location[0]} onChange={e => setLocation(p => [Number(e.target.value), p[1]])} /></div><label className="choice"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Ubicación exacta confirmada</label>
    <Button className="spacer" disabled={busy} type="submit">{busy ? "Guardando…" : "Guardar configuración"}</Button>
  </form><section className="card narrow-form"><h3>Conexión al servidor</h3><p className="muted">Los pedidos llegan al panel del restaurante. El cobro se coordina directamente con el cliente.</p></section></>;
}
