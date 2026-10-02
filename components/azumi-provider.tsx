"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cartTotals, coverage, emptyCatalog, emptyPersonal, readPersonal, reconcileCart, type Personal, type Snapshot } from "@/lib/azumi-client";
import type { Catalog, Order, Status } from "@/lib/azumi-types";

class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T>(method = "GET", body?: unknown): Promise<T> {
  const response = await fetch("/api/azumi", { method, credentials: "same-origin", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => { throw new Error("El servidor no está disponible. Intenta nuevamente."); });
  if (!response.ok) throw new ApiError(data.error || "No se pudo completar la operación.", response.status);
  return data as T;
}
type Store = {
  snapshot: Snapshot | null; catalog: Catalog; personal: Personal; cart: Personal["cart"]; totals: ReturnType<typeof cartTotals>; cov: ReturnType<typeof coverage>;
  ready: boolean; personalReady: boolean; error: string; busy: boolean; notify: (message: string) => void; refresh: () => Promise<Snapshot>;
  updatePersonal: (update: Partial<Personal> | ((current: Personal) => Personal)) => void;
  run: <T>(action: () => Promise<T>) => Promise<T | undefined>;
  saveCatalog: (changes: Partial<Catalog>, revision?: number) => Promise<void>;
  placeOrder: () => Promise<Order>; changeStatus: (order: Order, status: Status) => Promise<void>;
  login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>;
};
const Context = createContext<Store | null>(null);

export function AzumiProvider({ children, initialSnapshot }: { children: ReactNode; initialSnapshot: Snapshot }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(initialSnapshot), [personal, setPersonal] = useState<Personal>(emptyPersonal);
  const [ready, setReady] = useState(true), [error, setError] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [personalReady, setPersonalReady] = useState(false);
  const hydrated = useRef(false);
  const lock = useRef(false), inflight = useRef<Promise<Snapshot> | null>(null);
  const notify = useCallback((value: string) => setMessage(value), []);
  const refresh = useCallback(async () => {
    if (inflight.current) await inflight.current.catch(() => {});
    const task = api<Snapshot>(); inflight.current = task;
    try { const data = await task; data.categories.sort((a, b) => a.order - b.order); setSnapshot(data); setError(""); return data; }
    finally { if (inflight.current === task) inflight.current = null; }
  }, []);
  useEffect(() => {
    let active = true;
    async function initialize() {
      try { await refresh(); if (active) { const preferences = readPersonal(); hydrated.current = true; setPersonal(preferences); setPersonalReady(true); setReady(true); } }
      catch (e) { if (active) { setError(e instanceof Error ? e.message : "No pudimos cargar el menú."); setReady(false); } }
    }
    void initialize();
    return () => { active = false; };
  }, [refresh]);
  useEffect(() => {
    if (!ready || !hydrated.current) return;
    try { localStorage.setItem("azumi-customer-v2", JSON.stringify(personal)); } catch { /* Preferences are optional; orders still persist on the server. */ }
  }, [personal, ready]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000); return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    const poll = () => {
      if (!ready || lock.current || document.hidden || document.querySelector('[data-editing="true"]') || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName || "")) return;
      void refresh().catch(() => {});
    };
    const timer = setInterval(poll, 10000);
    window.addEventListener("focus", poll);
    const storage = (event: StorageEvent) => { if (event.key === "azumi-customer-v2") setPersonal(readPersonal()); };
    window.addEventListener("storage", storage);
    return () => { clearInterval(timer); window.removeEventListener("focus", poll); window.removeEventListener("storage", storage); };
  }, [ready, refresh]);
  const catalog = snapshot || emptyCatalog;
  const cart = useMemo(() => snapshot ? reconcileCart(personal.cart, snapshot) : personal.cart, [personal.cart, snapshot]);
  const totals = cartTotals(catalog, personal, cart), cov = coverage(catalog, cart, personal.deliveryPoint);
  const updatePersonal = useCallback((update: Partial<Personal> | ((p: Personal) => Personal)) => setPersonal(current => typeof update === "function" ? update(current) : { ...current, ...update }), []);
  const run = useCallback(async <T,>(action: () => Promise<T>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { return await action(); }
    catch (e) { if (e instanceof ApiError && (e.status === 401 || e.status === 409)) await refresh().catch(() => {}); notify(e instanceof Error ? e.message : "No se pudo completar la operación."); }
    finally { lock.current = false; setBusy(false); }
  }, [refresh, notify]);
  async function saveCatalog(changes: Partial<Catalog>, baseRevision = snapshot?.revision) {
    await api("PATCH", { action: "catalog", changes, revision: baseRevision }); await refresh(); notify("Cambios guardados");
  }
  async function placeOrder() {
    if (cart.some(c => c.unavailable)) throw new Error("Edita o elimina los productos que ya no están disponibles.");
    const payload = { items: cart, customer: personal.profile, fulfillment: personal.fulfillment, address: personal.deliveryAddress, point: personal.deliveryPoint, coupon: personal.coupon, expectedTotal: totals.total };
    const fingerprint = JSON.stringify(payload); let pending: { fingerprint: string; key: string } | null = null;
    try { pending = JSON.parse(sessionStorage.getItem("azumi-pending-order") || "null"); } catch {}
    if (!pending || pending.fingerprint !== fingerprint) pending = { fingerprint, key: crypto.randomUUID() };
    sessionStorage.setItem("azumi-pending-order", JSON.stringify(pending));
    const { order } = await api<{ order: Order }>("POST", { action: "order", ...payload, requestKey: pending.key });
    setSnapshot(current => current ? { ...current, orders: [...current.orders.filter(o => o.id !== order.id), order], adminOrders: current.adminOrders ? [...current.adminOrders.filter(o => o.id !== order.id), order] : undefined } : current);
    updatePersonal({ cart: [], coupon: "" }); sessionStorage.removeItem("azumi-pending-order"); return order;
  }
  async function changeStatus(order: Order, status: Status) { await api("PATCH", { action: "status", id: order.id, previousStatus: order.status, status }); await refresh(); notify("Estado actualizado"); }
  async function login(email: string, password: string) { await api("POST", { action: "login", email, password }); await refresh(); }
  async function logout() { await api("POST", { action: "logout" }); await refresh(); }
  const value: Store = { snapshot, catalog, personal, cart, totals, cov, ready, personalReady, error, busy, notify, refresh, updatePersonal, run, saveCatalog, placeOrder, changeStatus, login, logout };
  return <Context.Provider value={value}>{children}{message && <div className="toast" role="status">{message}<button aria-label="Cerrar aviso" onClick={() => setMessage("")}>×</button></div>}</Context.Provider>;
}
export function useAzumi() { const value = useContext(Context); if (!value) throw new Error("AzumiProvider is required"); return value; }
export function PersonalReady({ children }: { children: ReactNode }) {
  const { personalReady } = useAzumi();
  return personalReady ? children : <div className="loading-screen" role="status"><p>Cargando tus preferencias…</p></div>;
}
export function AppReady({ children }: { children: ReactNode }) {
  const { ready, error } = useAzumi();
  if (error && !ready) return <main className="loading-screen"><div className="brand">Azumi</div><h1>No pudimos cargar el menú</h1><p>{error}</p><button className="button" onClick={() => window.location.reload()}>Reintentar</button></main>;
  if (!ready) return <div className="loading-screen" role="status"><div className="brand">Azumi</div><div className="loading-dots"><i /><i /><i /></div><p>Preparando algo delicioso…</p></div>;
  return children;
}
