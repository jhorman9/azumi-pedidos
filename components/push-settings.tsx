"use client";
import { useEffect, useState } from "react";
import { Button, Icon, Notice } from "./ui";

export async function stopPush(role: "customer" | "admin") {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await fetch(`/api/push?role=${role}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unsubscribe", endpoint: subscription.endpoint }) });
  await subscription.unsubscribe();
}
export function PushSettings({ role = "customer" }: { role?: "customer" | "admin" }) {
  const [state, setState] = useState("checking"), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function sync(subscription: PushSubscription) {
    const response = await fetch(`/api/push?role=${role}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "subscribe", subscription: subscription.toJSON() }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error);
  }
  useEffect(() => {
    let active = true;
    async function initialize() {
      if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { if (active) setState("unsupported"); return; }
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        const subscription = await registration.pushManager.getSubscription();
        if (subscription && Notification.permission === "granted") await sync(subscription);
        if (active) setState(subscription && Notification.permission === "granted" ? "enabled" : "disabled");
      } catch { if (active) { setState("disabled"); setError("No pudimos comprobar tus avisos. Intenta activarlos nuevamente."); } }
    }
    void initialize();
    return () => { active = false; };
    // The audience is fixed for this control; account changes remount it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);
  async function enable() {
    setBusy(true); setError("");
    try {
      if (await Notification.requestPermission() !== "granted") throw new Error("Los avisos están bloqueados. Puedes permitirlos desde los ajustes de este sitio.");
      const response = await fetch(`/api/push?role=${role}`, { cache: "no-store" }), data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const registration = await navigator.serviceWorker.ready;
      const key = Uint8Array.from(atob(data.publicKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await sync(subscription); setState("enabled");
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos activar los avisos."); }
    finally { setBusy(false); }
  }
  return <div className="push-settings">{state === "unsupported" ? <Notice>Este navegador no permite avisos push. En iPhone, agrega Azumi a la pantalla de inicio y ábrela desde allí.</Notice> : <Button className="secondary small" disabled={busy || state === "checking"} onClick={() => {
    if (state === "enabled") { setBusy(true); void stopPush(role).then(() => setState("disabled")).catch(() => setError("No pudimos desactivar los avisos.")).finally(() => setBusy(false)); }
    else void enable();
  }}><Icon name="order" />{state === "enabled" ? "Desactivar avisos" : state === "checking" ? "Comprobando avisos…" : "Activar avisos de pedidos"}</Button>}{error && <Notice error>{error}</Notice>}</div>;
}
