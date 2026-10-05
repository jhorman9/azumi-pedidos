"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppReady, PersonalReady, useAzumi } from "@/components/azumi-provider";
import { Brand, Icon, type IconName } from "@/components/ui";
import { money, subtotal } from "@/lib/azumi-client";
import { AccountScreen } from "./account-screens";
import { statusMessage } from "@/lib/order-status";

const navigation: [string, string, IconName][] = [["/", "Inicio", "home"], ["/menu", "Menú", "menu"], ["/favoritos", "Favoritos", "heart"], ["/pedidos", "Pedidos", "order"], ["/cuenta", "Cuenta", "user"]];
export function StoreShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(), { cart, catalog, customer, personalReady, snapshot } = useAzumi();
  const activeOrder = snapshot?.orders.slice().reverse().find(order => !["Entregado", "Cancelado"].includes(order.status));
  const permitted = !!customer || pathname === "/cuenta";
  const checkout = ["/carrito", "/modalidad", "/ubicacion", "/checkout", "/resumen"].includes(pathname);
  const needsPersonal = ["/carrito", "/modalidad", "/ubicacion", "/checkout", "/resumen", "/favoritos", "/cuenta", "/direcciones"].some(route => pathname === route || pathname.startsWith(route + "/"));
  const count = cart.reduce((sum, i) => sum + i.qty, 0);
  return <>
    <div className="store-topbar"><Brand /><Link href="/carrito" className="icon-button" aria-label={`Carrito, ${count} productos`}><Icon name="bag" />{count > 0 && <span className="cart-count">{count}</span>}</Link></div>
    <main className="store-shell"><AppReady>{customer && !catalog.settings.restaurantOpen && <p className="notice error">En este momento no estamos aceptando pedidos.</p>}{customer && activeOrder && <Link className="active-order" href={`/pedido/${activeOrder.id}`} role="status"><Icon name="order" /><span><strong>{activeOrder.id} · {activeOrder.status}</strong><small>{statusMessage(activeOrder)}</small></span><Icon name="arrow" /></Link>}{!personalReady ? <PersonalReady>{children}</PersonalReady> : !permitted ? <AccountScreen /> : needsPersonal ? <PersonalReady>{children}</PersonalReady> : children}</AppReady><footer className="store-footer"><span>Hecho con sabor, en Panamá.</span><Link href="/admin">Administración</Link></footer></main>
    {customer && count > 0 && !checkout && <Link className="cart-bar" href="/carrito"><span><Icon name="bag" /> Ver carrito · {count}</span><strong>{money(subtotal(cart))}</strong></Link>}
    <nav className="bottom-nav" aria-label="Navegación principal">{navigation.map(([href, label, icon]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={pathname === href ? "active" : ""}><Icon name={icon} /><span>{label}</span></Link>)}</nav>
  </>;
}
