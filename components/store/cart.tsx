"use client";
import { useState } from "react";
import Link from "next/link";
import { useAzumi } from "@/components/azumi-provider";
import { Button, EmptyState, Field, Notice, PageHeading, ProductPhoto } from "@/components/ui";
import { money, subtotal } from "@/lib/azumi-client";
import type { Item, Totals } from "@/lib/azumi-types";

export function OrderItems({ items }: { items: Item[] }) { return <div className="order-items">{items.map((item, index) => <article className="card cart-item" key={`${item.productId}-${index}`}><div className="row"><ProductPhoto image={item.image} name={item.name} className="cart-photo" /><div className="grow"><h3>{item.name}</h3><small>{[item.variant, ...item.extras.map(e => e.name)].filter(Boolean).join(" · ")}</small>{item.notes && <p className="item-notes">{item.notes}</p>}<small>{item.qty} unidades</small></div><strong>{money(item.unit * item.qty)}</strong></div></article>)}</div>; }
export function OrderSummary({ totals: provided }: { totals?: Totals }) {
  const { totals, personal, cov } = useAzumi(), t = provided || totals;
  return <section className="card summary"><h3>Resumen de tu pedido</h3><div className="total-row"><span>Subtotal</span><span>{money(t.subtotal)}</span></div><div className="total-row"><span>Descuento</span><span>−{money(t.discount)}</span></div><div className="total-row"><span>Delivery</span><span>{provided ? money(t.delivery) : personal.fulfillment === "pickup" ? "Retiro sin costo" : cov.ok ? money(t.delivery) : "Por calcular"}</span></div><div className="total-row final"><strong>Total</strong><strong>{money(t.total)}</strong></div></section>;
}
export function CartScreen() {
  const { cart, personal, catalog, updatePersonal, notify } = useAzumi(), [code, setCode] = useState(personal.coupon);
  if (!cart.length) return <><PageHeading title="Tu pedido" back="/menu" /><EmptyState title="Tu carrito espera algo delicioso" /></>;
  const invalidCoupon = !!personal.coupon && !catalog.coupons.some(c => c.active && c.code === personal.coupon && subtotal(cart) >= c.min);
  function quantity(index: number, delta: number) { updatePersonal(p => ({ ...p, cart: cart.map((item, i) => i === index ? { ...item, qty: Math.min(99, item.qty + delta) } : item).filter(item => item.qty > 0) })); }
  return <><PageHeading title="Tu pedido" eyebrow="Tu próximo antojo está aquí" back="/menu" />{cart.map((item, index) => <article className="card cart-item" key={index}>{item.unavailable && <Notice error>Esta selección ya no está disponible. Edita o elimina el producto.</Notice>}<div className="row"><ProductPhoto image={item.image} name={item.name} className="cart-photo" /><div className="grow"><h3>{item.name}</h3><small>{[item.variant, ...item.extras.map(e => e.name)].join(" · ")}</small>{item.notes && <p className="item-notes">{item.notes}</p>}</div><strong>{money(item.unit * item.qty)}</strong></div><div className="flex cart-actions"><div className="inline-actions"><Link className="link-button" href={`/carrito/editar/${index}`}>Editar</Link><button className="link-button" onClick={() => updatePersonal(p => ({ ...p, cart: cart.filter((_, i) => i !== index) }))}>Eliminar</button></div><div className="quantity"><button aria-label={`Reducir cantidad de ${item.name}`} onClick={() => quantity(index, -1)}>−</button><span>{item.qty}</span><button aria-label={`Aumentar cantidad de ${item.name}`} disabled={item.qty >= 99} onClick={() => quantity(index, 1)}>+</button></div></div></article>)}
    <form className="coupon-form" onSubmit={e => { e.preventDefault(); const value = code.trim().toUpperCase(), coupon = catalog.coupons.find(c => c.code === value && c.active); if (!value) { updatePersonal({ coupon: "" }); return; } if (!coupon || subtotal(cart) < coupon.min) { notify(coupon ? `Pedido mínimo ${money(coupon.min)}` : "Cupón no válido"); return; } updatePersonal({ coupon: value }); notify("Cupón aplicado"); }}><Field label="Código promocional" value={code} onChange={e => setCode(e.target.value)} /><Button type="submit" className="small">Aplicar</Button></form>
    {personal.coupon && <div className="flex"><span className="muted">{invalidCoupon ? "El cupón ya no aplica a este pedido" : `Cupón ${personal.coupon} aplicado`}</span><button className="link-button" onClick={() => { setCode(""); updatePersonal({ coupon: "" }); }}>Quitar cupón</button></div>}
    <OrderSummary />{cart.some(c => c.unavailable) ? <Notice error>Actualiza los productos no disponibles antes de continuar.</Notice> : invalidCoupon ? <Notice error>Quita o cambia el cupón antes de continuar.</Notice> : <Link className="button" href="/modalidad">Continuar →</Link>}
  </>;
}
