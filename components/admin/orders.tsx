"use client";
import { useState } from "react";
import Link from "next/link";
import { api, useAzumi } from "@/components/azumi-provider";
import { Badge, Button, Field, Notice, PageHeading, Select } from "@/components/ui";
import { DeliveryMap } from "@/components/delivery-map";
import { OrderItems, OrderSummary } from "@/components/store/cart";
import { dateLabel, money, statusOptions } from "@/lib/azumi-client";
import type { Order, Status } from "@/lib/azumi-types";

export function OrdersTable({ orders }: { orders: Order[] }) { return <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Tipo</th><th>Estado</th><th>Pago</th><th>Total</th><th>Fecha</th><th><span className="sr-only">Detalle</span></th></tr></thead><tbody>{orders.slice().reverse().map(o => <tr key={o.id}><td><strong>{o.id}</strong></td><td>{o.customer.name}</td><td>{o.fulfillment === "delivery" ? "Delivery" : "Retiro"}</td><td><Badge coral={o.status === "Cancelado"}>{o.status}</Badge></td><td><Badge coral={o.paymentStatus !== "Pagado"}>{o.paymentStatus}</Badge></td><td>{money(o.totals.total)}</td><td>{dateLabel(o.date)}</td><td><Link className="link-button" href={`/admin/pedidos/${o.id}`}>Ver →</Link></td></tr>)}{!orders.length && <tr><td colSpan={8} className="muted">Aún no hay pedidos.</td></tr>}</tbody></table></div>; }
export function AdminOrdersScreen() {
  const { snapshot } = useAzumi(), [filter, setFilter] = useState("Todos"), orders = snapshot?.adminOrders || [];
  return <><PageHeading title="Pedidos" eyebrow="Cada pedido, una buena experiencia" /><div className="chips">{["Todos", "Recibido", "Confirmado", "En camino", "Entregado", "Cancelado"].map(value => <button key={value} className={`pill ${filter === value ? "active" : ""}`} onClick={() => setFilter(value)}>{value}</button>)}</div><section className="card"><OrdersTable orders={orders.filter(o => filter === "Todos" || o.status === filter)} /></section></>;
}
function StatusForm({ order }: { order: Order }) {
  const { busy, run, changeStatus } = useAzumi(), [status, setStatus] = useState<Status>(order.status);
  return <form className="card" onSubmit={e => { e.preventDefault(); void run(() => changeStatus(order, status)); }}><Select label="Estado general" value={status} onChange={e => setStatus(e.target.value as Status)}>{statusOptions(order).map(s => <option key={s}>{s}</option>)}</Select><Button disabled={busy} type="submit">{busy ? "Guardando…" : "Guardar estado"}</Button></form>;
}
function PaymentForm({ order }: { order: Order }) {
  const { busy, run, refresh, notify } = useAzumi(), [note, setNote] = useState("");
  return <section className="card"><h3>Pago directo con el cliente</h3><Badge>{order.paymentStatus}</Badge><div className="flex"><a className="link-button" href={`tel:${order.customer.phone}`}>Llamar</a><a className="link-button" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${order.customer.phone.length === 8 ? "507" : ""}${order.customer.phone}?text=${encodeURIComponent(`Hola ${order.customer.name}, recibimos tu pedido ${order.id} por ${money(order.totals.total)}. Coordinemos el pago y la entrega.`)}`}>Contactar por WhatsApp</a></div>{order.paymentStatus !== "Devuelto" && <form onSubmit={e => { e.preventDefault(); void run(async () => { await api("PATCH", { action: "payment", id: order.id, paymentStatus: order.paymentStatus === "Pendiente" ? "Pagado" : "Devuelto", previousPaymentStatus: order.paymentStatus, note }); await refresh(); setNote(""); notify("Registro de pago actualizado"); }); }}><Field label={order.paymentStatus === "Pendiente" ? "Referencia del pago recibido" : "Motivo y referencia de la devolución"} required maxLength={250} value={note} onChange={e => setNote(e.target.value)} /><Button type="submit" disabled={busy}>{order.paymentStatus === "Pendiente" ? "Registrar pago recibido" : "Registrar devolución completa"}</Button></form>}{order.paymentHistory?.map((event, i) => <p key={i} className="helper-text">{dateLabel(event.date)} · {event.status} · {event.note}</p>)}</section>;
}
export function AdminOrderScreen({ id }: { id: string }) {
  const { snapshot, catalog } = useAzumi(), order = snapshot?.adminOrders?.find(o => o.id === id);
  if (!order) return <><PageHeading title="Pedido no encontrado" /><Link href="/admin/pedidos" className="button secondary">Volver a pedidos</Link></>;
  return <><PageHeading title={order.id} back="/admin/pedidos" /><div className="two-col"><section><OrderItems items={order.items} /><div className="card"><h3>Observaciones de entrega</h3><p>{order.customer.instructions || "Sin instrucciones adicionales."}</p></div></section><section><div className="card"><h3>{order.customer.name} {order.customer.lastName}</h3><p>{order.customer.phone}</p><p>{order.customer.email}</p><p>{order.address}</p><small>{order.customer.building} {order.customer.floor}</small><Badge>{order.zone || "Retiro"}</Badge></div><OrderSummary totals={order.totals} /><div className="card"><Badge>{order.customer.payment}</Badge>{order.customer.payment === "Efectivo" && <p className="muted">Efectivo: {money(order.customer.cash)} · cambio: {money(order.customer.cash - order.totals.total)}</p>}</div><PaymentForm key={`${order.id}-${order.paymentStatus}`} order={order} /><StatusForm key={`${order.id}-${order.status}`} order={order} /><Notice>El restaurante coordina el cobro directamente con el cliente.</Notice></section></div>{order.point && <section className="card"><h3>Ubicación del pedido</h3><DeliveryMap zones={catalog.zones} point={order.point} /></section>}</>;
}
export function ClientsScreen() {
  const { snapshot } = useAzumi(), customers = new Map<string, { name: string; phone: string; email: string; count: number; total: number }>();
  snapshot?.adminOrders?.forEach(order => { const previous = customers.get(order.customer.phone) || { ...order.customer, count: 0, total: 0 }; customers.set(order.customer.phone, { ...previous, count: previous.count + 1, total: previous.total + order.totals.total }); });
  return <><PageHeading title="Clientes" eyebrow="Las personas que nos eligen" /><div className="card table-wrap"><table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Correo</th><th>Pedidos</th><th>Total</th></tr></thead><tbody>{[...customers.values()].map(c => <tr key={c.phone}><td>{c.name}</td><td>{c.phone}</td><td>{c.email || "—"}</td><td>{c.count}</td><td>{money(c.total)}</td></tr>)}{!customers.size && <tr><td colSpan={5}>Los clientes aparecerán al recibir pedidos.</td></tr>}</tbody></table></div></>;
}
