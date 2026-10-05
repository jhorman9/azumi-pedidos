"use client";
import { useState } from "react";
import { whatsappNumber } from "@/lib/azumi-validation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAzumi } from "@/components/azumi-provider";
import { Badge, Button, EmptyState, Field, Icon, Notice, PageHeading } from "@/components/ui";
import { DeliveryMap } from "@/components/delivery-map";
import { OrderItems, OrderSummary } from "./cart";
import { money, pointInPolygon } from "@/lib/azumi-client";
import type { Customer, Point, Zone } from "@/lib/azumi-types";

function CartRequired({ children }: { children: React.ReactNode }) { const { cart } = useAzumi(); return cart.length ? children : <EmptyState title="Tu carrito está vacío" />; }
export function ModalityScreen() {
  const { personal, updatePersonal } = useAzumi();
  return <CartRequired><PageHeading title="¿Cómo quieres recibirlo?" eyebrow="Paso 1 de 3" back="/carrito" /><p className="muted">Tú eliges. Nosotros ponemos el sabor.</p><div className="modality-grid">{(["delivery", "pickup"] as const).map(mode => <button key={mode} className={`card modality ${personal.fulfillment === mode ? "selected" : ""}`} aria-pressed={personal.fulfillment === mode} onClick={() => updatePersonal({ fulfillment: mode })}><Icon name={mode === "delivery" ? "pin" : "bag"} size={30} /><Badge>{mode === "delivery" ? "Delivery" : "Retiro · sin costo"}</Badge><h2>{mode === "delivery" ? "Lo llevamos hasta ti" : "Nos vemos en Azumi"}</h2><p className="muted">{mode === "delivery" ? "Elige tu ubicación y conoce la tarifa antes de confirmar." : "San Francisco, Calle 72, frente al Instituto Italiano Enrico Fermi."}</p></button>)}</div><Link className="button" href={personal.fulfillment === "delivery" ? "/ubicacion" : "/checkout"}>Continuar →</Link></CartRequired>;
}
export function LocationScreen() {
  const { catalog, personal, cart, updatePersonal, cov } = useAzumi(), [address, setAddress] = useState(personal.deliveryAddress), router = useRouter();
  function selectZone(zone: Zone) {
    let candidate: Point | null = null;
    const points = zone.points;
    const minX = Math.min(...points.map(p => p[0])), maxX = Math.max(...points.map(p => p[0]));
    const minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1]));
    for (let y = 1; y < 30 && !candidate; y++) for (let x = 1; x < 30; x++) {
      const p: Point = [minX + (maxX - minX) * x / 30, minY + (maxY - minY) * y / 30]; if (pointInPolygon(p, points) && !catalog.zones.some(z => z.active && z.type === "restricted" && pointInPolygon(p, z.points))) { candidate = p; break; }
    }
    if (candidate) updatePersonal({ deliveryPoint: candidate, fulfillment: "delivery" });
  }
  const canConfirm = cov.ok || (!cart.length && !!cov.zone);
return <><PageHeading title="¿Dónde entregamos?" eyebrow="Delivery a tu puerta" back={cart.length ? "/modalidad" : "/"} /><p className="muted">Selecciona tu zona y escribe la dirección completa para el repartidor.</p><div className="chips">{catalog.zones.filter(z => z.active && z.type === "allowed").map(z => <button className={`pill ${cov.zone?.id === z.id ? "active" : ""}`} key={z.id} onClick={() => selectZone(z)}>{z.name} · {money(z.fee)}</button>)}</div><DeliveryMap zones={catalog.zones} point={personal.deliveryPoint} onAddress={setAddress} onBuilding={building => updatePersonal(p => ({ ...p, profile: { ...p.profile, building, floor: "" } }))} onPoint={point => updatePersonal({ deliveryPoint: point, fulfillment: "delivery" })} /><Notice error={!cov.ok}>{cov.message}</Notice>
    <form onSubmit={e => { e.preventDefault(); if (!canConfirm || !address.trim()) return; updatePersonal({ deliveryAddress: address.trim(), fulfillment: "delivery" }); router.push(cart.length ? "/checkout" : "/"); }}><Field label="Dirección completa de entrega" value={address} onChange={e => setAddress(e.target.value)} maxLength={250} required placeholder="Calle, edificio, casa o apartamento" /><Field label="PH, edificio, casa y apartamento" maxLength={150} value={personal.profile.building || ""} onChange={e => updatePersonal(p => ({ ...p, profile: { ...p.profile, building: e.target.value } }))} placeholder="PH y número de apartamento" /><Button className="spacer" type="submit" disabled={!canConfirm}>Confirmar ubicación</Button></form><Link className="button ghost" href="/checkout" onClick={() => updatePersonal({ fulfillment: "pickup" })}>Prefiero retirar en Azumi</Link></>;
}
export function CheckoutScreen() {
  const { personal, updatePersonal, totals, cov, cart, notify } = useAzumi(), router = useRouter();
  const [profile, setProfile] = useState<Partial<Customer>>({ ...personal.profile, payment: ["Efectivo", "Punto de venta al recibir"].includes(personal.profile.payment || "") ? personal.profile.payment : "Efectivo" });
  const update = (key: keyof Customer, value: string | number) => setProfile(p => ({ ...p, [key]: value }));
  if (!cart.length) return <EmptyState title="Tu carrito está vacío" />;
  if (personal.fulfillment === "delivery" && (!cov.ok || !personal.deliveryAddress)) return <EmptyState title="Selecciona tu dirección de entrega" href="/ubicacion" label="Elegir ubicación" />;
  return <><PageHeading title="Ya casi está." eyebrow="Paso 2 de 3" back={personal.fulfillment === "delivery" ? "/ubicacion" : "/modalidad"} /><p className="muted">Confirma tus datos de contacto para este pedido.</p><form onSubmit={e => { e.preventDefault(); const phone = (profile.phone || "").replace(/[^\d]/g, ""); if (phone.length < 8 || phone.length > 15) { notify("Escribe un teléfono válido."); return; } if (profile.payment === "Efectivo" && Number(profile.cash) < totals.total) { notify("El efectivo debe cubrir el total del pedido."); return; } let whatsappPhone: string; try { whatsappPhone = whatsappNumber(profile.whatsappPhone, true); } catch (error) { notify(error instanceof Error ? error.message : "Escribe un WhatsApp válido."); return; } updatePersonal({ profile: { ...profile, phone, whatsappPhone } }); router.push("/resumen"); }}>
    <section className="card"><h3>Tus datos</h3><div className="form-grid"><Field label="Nombre" required maxLength={80} value={profile.name || ""} onChange={e => update("name", e.target.value)} autoComplete="given-name" /><Field label="Apellido · opcional" maxLength={80} value={profile.lastName || ""} onChange={e => update("lastName", e.target.value)} autoComplete="family-name" /><Field label="Teléfono de contacto" type="tel" required maxLength={30} value={profile.phone || ""} onChange={e => update("phone", e.target.value)} autoComplete="tel" /><Field label="WhatsApp de contacto" type="tel" required maxLength={30} placeholder="6123 4567 o +507 6123 4567" value={profile.whatsappPhone || ""} onChange={e => update("whatsappPhone", e.target.value)} autoComplete="off" /><Field label="Correo · opcional" type="email" maxLength={150} value={profile.email || ""} onChange={e => update("email", e.target.value)} autoComplete="email" /></div></section>
    {personal.fulfillment === "delivery" ? <section className="card"><h3>Entrega en {cov.zone?.name}</h3><p>{personal.deliveryAddress}</p><div className="form-grid"><Field label="PH, edificio, casa y apartamento" required maxLength={150} value={profile.building || ""} onChange={e => update("building", e.target.value)} /><Field label="Piso · opcional" maxLength={30} value={profile.floor || ""} onChange={e => update("floor", e.target.value)} /></div><Field label="Referencia" maxLength={200} value={profile.reference || ""} onChange={e => update("reference", e.target.value)} /><label className="field"><span>Instrucciones de entrega</span><textarea maxLength={500} value={profile.instructions || ""} onChange={e => update("instructions", e.target.value)} /></label></section> : <section className="card"><h3>Retiro en Azumi</h3><p>San Francisco, Calle 72 · frente al Instituto Italiano Enrico Fermi.</p></section>}
    <section className="card"><h3>¿Cómo quieres pagar?</h3>{["Efectivo", "Punto de venta al recibir"].map(method => <label className="choice" key={method}><input type="radio" name="payment" checked={profile.payment === method} onChange={() => update("payment", method)} required />{method}</label>)}{profile.payment === "Efectivo" && <><Field label="¿Con cuánto pagarás?" type="number" min={totals.total} max={10000} step="0.01" required value={profile.cash ?? ""} onChange={e => update("cash", Number(e.target.value))} /><small>Cambio aproximado: {money(Math.max(0, Number(profile.cash || 0) - totals.total))}</small></>}<Notice>Paga al recibir tu pedido. No se realizan cobros en línea.</Notice></section><OrderSummary /><Button type="submit">Revisar mi pedido →</Button>
  </form></>;
}
export function ReviewScreen() {
  const { cart, personal, totals, cov, catalog, busy, run, placeOrder } = useAzumi(), router = useRouter();
  const [submissionError, setSubmissionError] = useState("");
  async function submit() {
    setSubmissionError("");
    await run(async () => {
      try { const order = await placeOrder(); router.push(`/confirmacion/${order.id}`); }
      catch (error) { setSubmissionError(error instanceof Error ? error.message : "No pudimos guardar tu pedido. Intenta nuevamente."); throw error; }
    });
  }
  if (!cart.length) return <EmptyState title="Tu carrito está vacío" />;
  if (!personal.profile.name || !personal.profile.phone || !personal.profile.whatsappPhone) return <EmptyState title="Completa tus datos para continuar" href="/checkout" label="Completar datos" />;
  const invalid = cart.some(i => i.unavailable) || (personal.fulfillment === "delivery" && !cov.ok);
  return <><PageHeading title="Todo listo para disfrutar." eyebrow="Paso 3 de 3" back="/checkout" /><div className="two-col"><OrderItems items={cart} /><section><div className="card"><h3>{personal.fulfillment === "delivery" ? "Delivery a tu puerta" : "Retiro en Azumi"}</h3><p>{personal.fulfillment === "delivery" ? personal.deliveryAddress : "San Francisco, Calle 72"}</p><small>{personal.profile.building} {personal.profile.reference}</small><p>{personal.profile.name} · {personal.profile.phone}</p><p>WhatsApp: +{personal.profile.whatsappPhone}</p><Badge>{personal.profile.payment}</Badge></div><OrderSummary />{invalid && <Notice error>Revisa los productos y la cobertura antes de confirmar. <Link href="/carrito">Volver al carrito</Link></Notice>}{!catalog.settings.restaurantOpen && <Notice error>Azumi no acepta pedidos en este momento.</Notice>}{submissionError && <Notice error>{submissionError}</Notice>}<Button disabled={busy || invalid || !catalog.settings.restaurantOpen} onClick={() => void submit()}>{busy ? "Guardando tu pedido…" : `Realizar pedido · ${money(totals.total)}`}</Button><p className="helper-text">Tu pedido llegará al restaurante. El pago se coordina directamente contigo.</p></section></div></>;
}
