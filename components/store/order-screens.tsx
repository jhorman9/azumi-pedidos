"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAzumi } from "@/components/azumi-provider";
import { Badge, Button, EmptyState, Notice, PageHeading } from "@/components/ui";
import { availableProducts, createItem, dateLabel, money, options } from "@/lib/azumi-client";
import { OrderItems, OrderSummary } from "./cart";
import { MissingOrder } from "./account-screens";

export function OrdersScreen() {
  const { snapshot, catalog, updatePersonal, notify } = useAzumi(), router = useRouter();
  const orders = snapshot?.orders || [];
  return <><PageHeading title="Mis pedidos" eyebrow="Siempre hay un próximo antojo" />{!orders.length && <EmptyState title="Aquí aparecerán tus pedidos" />}{orders.slice().reverse().map(order => <article className="card" key={order.id}><div className="flex"><h3>{order.id}</h3><Badge coral={order.status === "Cancelado"}>{order.status}</Badge></div><p className="muted">{dateLabel(order.date)} · {money(order.totals.total)}</p><div className="flex"><Link className="link-button" href={`/pedido/${order.id}`}>Ver pedido →</Link><Button className="secondary small" onClick={() => { const items = order.items.flatMap(item => { const p = availableProducts(catalog).find(p => p.id === item.productId); if (!p) return []; const variant = options(p.options).find(v => v.name === item.variant) || options(p.options)[0]; return [createItem(p, variant?.name || "", item.extras.map(e => e.name), item.qty, item.notes)]; }); updatePersonal({ cart: items, coupon: "" }); notify("Carrito reconstruido con precios actuales"); router.push("/carrito"); }}>Pedir nuevamente</Button></div></article>)}</>;
}
export function OrderScreen({ id, success = false }: { id: string; success?: boolean }) {
  const { snapshot } = useAzumi(), order = snapshot?.orders.find(o => o.id === id);
  if (!order) return <MissingOrder />;
  const steps = order.fulfillment === "pickup" ? ["Recibido", "Confirmado", "Entregado"] : ["Recibido", "Confirmado", "En camino", "Entregado"];
  return <>{success ? <div className="success-check">✓</div> : <Link className="back" href="/pedidos">← Mis pedidos</Link>}<PageHeading title={success ? "¡Pedido recibido!" : order.id} eyebrow={success ? "Gracias por elegir Azumi" : "Tu pedido"} /><p className="muted">{order.id} · {dateLabel(order.date)}</p><section className="card"><div className="flex"><h3>{order.fulfillment === "pickup" ? "Retiro estimado" : "Entrega estimada"}</h3><Badge coral={order.status === "Cancelado"}>{order.status}</Badge></div><h2>{order.minutes}</h2><small>El tiempo es estimado y puede variar según la preparación.</small></section>{order.status === "Cancelado" ? <Notice error>Este pedido fue cancelado.</Notice> : <ol className="card timeline">{steps.map((step, i) => <li key={step}><span className={`dot ${steps.indexOf(order.status) === i ? "current" : ""}`}>{steps.indexOf(order.status) > i ? "✓" : i + 1}</span><span>{step}</span></li>)}</ol>}<OrderItems items={order.items} /><section className="card"><h3>{order.fulfillment === "pickup" ? "Retiro en Azumi" : "Dirección de entrega"}</h3><p>{order.address}</p><small>{order.customer.building}</small><div className="total-row"><span>{order.customer.payment}</span><Badge>Pago al recibir</Badge></div></section><OrderSummary totals={order.totals} /><Link className="button" href="/menu">Volver al menú</Link></>;
}
