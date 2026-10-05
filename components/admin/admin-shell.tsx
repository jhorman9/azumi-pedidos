"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { AppReady, useAzumi } from "@/components/azumi-provider";
import { Brand, Icon, type IconName } from "@/components/ui";
import { PushSettings } from "@/components/push-settings";

const links: [string, string, IconName][] = [["/admin", "Dashboard", "home"], ["/admin/pedidos", "Pedidos", "order"], ["/admin/productos", "Productos", "menu"], ["/admin/categorias", "Categorías", "menu"], ["/admin/promociones", "Promociones", "heart"], ["/admin/clientes", "Clientes", "user"], ["/admin/delivery", "Delivery", "pin"], ["/admin/cupones", "Cupones", "bag"], ["/admin/configuracion", "Configuración", "settings"]];
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(), router = useRouter(), { busy, run, logout, snapshot } = useAzumi();
  return <div className="admin-shell"><aside className="sidebar"><Brand admin /><nav aria-label="Administración">{links.map(([href, label, icon]) => <Link key={href} href={href} className={pathname === href || (href !== "/admin" && pathname.startsWith(href + "/")) ? "active" : ""}><Icon name={icon} />{label}</Link>)}</nav><div className="sidebar-bottom"><Link href="/">← Ver restaurante</Link><button disabled={busy} onClick={() => void run(async () => { await logout(); router.replace("/admin/login"); router.refresh(); })}><Icon name="logout" />Cerrar sesión</button><small>Conectado al servidor</small>{snapshot?.admin && <PushSettings role="admin" />}</div></aside><main className="admin-content"><AppReady>{snapshot?.admin ? children : <div className="card"><h1>Tu sesión terminó</h1><p>Inicia sesión para continuar.</p><Link className="button" href="/admin/login">Iniciar sesión</Link></div>}</AppReady></main></div>;
}
