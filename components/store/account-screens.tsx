"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAzumi } from "@/components/azumi-provider";
import { Button, EmptyState, Field, Icon, Notice, PageHeading } from "@/components/ui";
import { PushSettings } from "@/components/push-settings";

export function AccountScreen() {
  const { customer, accountAction, busy, run, notify } = useAzumi(), router = useRouter();
  const [token] = useState(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("reset") || "" : "");
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">(token ? "reset" : "login");
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [name, setName] = useState("");
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const titles = { login: "Iniciar sesión", register: "Crear cuenta", forgot: "Recuperar contraseña", reset: "Nueva contraseña" };
  return <><PageHeading title={customer ? `Hola, ${customer.profile.name}` : "Mi cuenta"} eyebrow="Tu espacio Azumi" />
{customer ? <><ProfileForm key={`profile-${customer.email}`} /><PushSettings key={`push-${customer.email}`} /><Button className="ghost" disabled={busy} onClick={() => void run(async () => { await accountAction({ action: "logout" }); notify("Sesión cerrada"); })}>Cerrar sesión</Button></> : <><div className="chips">{(["login", "register", "forgot"] as const).map(value => <button className={`pill ${mode === value ? "active" : ""}`} key={value} onClick={() => { setMode(value); setError(""); setMessage(""); setPassword(""); }}>{titles[value]}</button>)}</div><form className="card" onSubmit={e => {
      e.preventDefault(); setError(""); setMessage("");
      void run(async () => {
        try { const result = await accountAction({ action: mode, name, email, password, token }); if (result) setMessage(result); setPassword(""); if (mode === "reset") { setMode("login"); window.history.replaceState(null, "", "/cuenta"); } else if (mode === "login" || mode === "register") { router.replace("/"); router.refresh(); } }
        catch (e) { setError(e instanceof Error ? e.message : "No pudimos completar la operación."); throw e; }
      });
    }}><h3>{titles[mode]}</h3>{mode === "register" && <Field label="Nombre" required maxLength={80} value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" />}{mode !== "reset" && <Field label="Correo" type="email" required maxLength={150} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />}{mode !== "forgot" && <Field label="Contraseña" type="password" required minLength={12} maxLength={200} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />}{error && <Notice error>{error}</Notice>}{message && <Notice>{message}</Notice>}<Button disabled={busy} type="submit">{busy ? "Procesando…" : titles[mode]}</Button></form></>}
    {([['/pedidos','Mis pedidos','order'],['/direcciones','Mis direcciones','pin'],['/favoritos','Mis favoritos','heart']] as const).map(([href,title,icon]) => <Link className="card flex" key={href} href={href}>{title}<Icon name={icon} /></Link>)}
  </>;
}
function ProfileForm() {
  const { personal, customer, accountAction, run, busy, notify } = useAzumi();
  const [profile, setProfile] = useState(customer?.profile || personal.profile);
  return <form className="card" onSubmit={e => { e.preventDefault(); void run(async () => { await accountAction({ action: "profile", profile, addresses: personal.addresses }); notify("Perfil guardado en tu cuenta"); }); }}><Field label="Nombre" required maxLength={80} value={profile.name || ""} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} autoComplete="given-name" /><Field label="Apellido" maxLength={80} value={profile.lastName || ""} onChange={e => setProfile(p => ({ ...p, lastName: e.target.value }))} autoComplete="family-name" /><Field label="Teléfono" type="tel" maxLength={30} value={profile.phone || ""} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} autoComplete="tel" /><Field label="WhatsApp" type="tel" maxLength={30} placeholder="6123 4567 o +507 6123 4567" value={profile.whatsappPhone || ""} onChange={e => setProfile(p => ({ ...p, whatsappPhone: e.target.value }))} autoComplete="off" /><Field label="Correo de la cuenta" value={customer?.email || ""} readOnly /><Button disabled={busy} type="submit">Guardar perfil</Button></form>;
}
export function AddressesScreen() {
  const { personal, customer, updatePersonal, accountAction, run, busy, notify } = useAzumi(), [label, setLabel] = useState("Casa"), router = useRouter();
  async function save(addresses: typeof personal.addresses) {
    if (customer) await accountAction({ action: "profile", profile: { ...personal.profile, name: personal.profile.name || customer.profile.name }, addresses });
    else updatePersonal({ addresses });
  }
  return <><PageHeading title="Mis direcciones" back="/cuenta" />{!customer && <Notice>Inicia sesión para conservar tus direcciones en otros dispositivos.</Notice>}{!personal.addresses.length && <p className="muted">Guarda tus lugares favoritos para pedir más rápido.</p>}{personal.addresses.map(a => <article className="card" key={a.id}><div className="flex"><h3>{a.label}</h3><button className="link-button" disabled={busy} onClick={() => void run(() => save(personal.addresses.filter(value => value.id !== a.id)))}>Eliminar</button></div><p>{a.address}</p><Button className="secondary" onClick={() => { updatePersonal({ deliveryPoint: a.point, deliveryAddress: a.address, fulfillment: "delivery" }); router.push("/ubicacion"); }}>Entregar aquí</Button></article>)}<form className="card" onSubmit={e => { e.preventDefault(); if (!personal.deliveryPoint || !personal.deliveryAddress || !label.trim()) return; const bytes = crypto.getRandomValues(new Uint8Array(16)); const id = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""); void run(async () => { await save([...personal.addresses, { id, label: label.trim(), point: personal.deliveryPoint!, address: personal.deliveryAddress }]); notify("Dirección guardada"); }); }}><Field label="Nombre de la dirección" required maxLength={80} value={label} onChange={e => setLabel(e.target.value)} /><p className="muted">{personal.deliveryAddress || "Primero selecciona una ubicación y escribe la dirección."}</p><Button type="submit" disabled={busy || !personal.deliveryPoint || !personal.deliveryAddress}>Guardar ubicación actual</Button></form><Link className="button ghost" href="/ubicacion">Agregar otra ubicación</Link></>;
}
export function MissingOrder() { return <EmptyState title="Pedido no encontrado" href="/pedidos" label="Ver mis pedidos">Inicia sesión en tu cuenta o consulta desde el navegador donde realizaste el pedido.</EmptyState>; }
