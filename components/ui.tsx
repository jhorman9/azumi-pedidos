import Link from "next/link";
import Image from "next/image";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, ButtonHTMLAttributes } from "react";

export type IconName = "home" | "menu" | "heart" | "order" | "user" | "pin" | "bag" | "search" | "settings" | "arrow" | "logout";
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 20v-7h6v7" /></>, menu: <><path d="M4 3v7m4-7v7m-4-3h4m-2 3v11M16 3v18m0-18c6 4 6 10 0 10" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" />,
    order: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6m-6 4h6" />, user: <><circle cx="12" cy="7" r="4" /><path d="M4 21v-3a8 8 0 0 1 16 0v3" /></>,
    pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z" /><circle cx="12" cy="10" r="3" /></>, bag: <path d="M4 7h16l-1 14H5zM8 7V6a4 4 0 0 1 8 0v1" />,
    search: <><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" /></>, settings: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" /></>,
    arrow: <path d="m9 5 7 7-7 7" />, logout: <><path d="M9 4H4v16h5m5-4 4-4-4-4m-5 4h12" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export function Brand({ admin = false }: { admin?: boolean }) { return <Link href={admin ? "/admin" : "/"} className="brand">Azumi<small>{admin ? "ADMINISTRACIÓN" : "SAN FRANCISCO · PANAMÁ"}</small></Link>; }
export function Button({ children, className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button type={type} className={`button ${className}`} {...props}>{children}</button>; }
export function Field({ label, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className={`field ${className}`}><span>{label}</span><input {...props} /></label>; }
export function Select({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) { return <label className="field"><span>{label}</span><select {...props}>{children}</select></label>; }
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) { return <p className={`notice ${error ? "error" : ""}`} role={error ? "alert" : undefined}>{children}</p>; }
export function Badge({ children, coral = false }: { children: ReactNode; coral?: boolean }) { return <span className={`badge ${coral ? "coral" : ""}`}>{children}</span>; }
export function EmptyState({ title, children, href = "/menu", label = "Explorar el menú" }: { title: string; children?: ReactNode; href?: string; label?: string }) { return <div className="empty"><Icon name="bag" size={36} /><h2>{title}</h2>{children && <p className="muted">{children}</p>}<Link className="button secondary" href={href}>{label}</Link></div>; }
export function PageHeading({ title, eyebrow, back }: { title: string; eyebrow?: string; back?: string }) { return <header className="page-heading">{back && <Link className="back" href={back}>← Volver</Link>}{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1></header>; }
export function ProductPhoto({ image, name, className = "", preload = false }: { image: string; name: string; className?: string; preload?: boolean }) { return <div className={`product-photo ${className}`}>{image ? <Image src={`/images/products/${image}.jpg`} alt={name} fill sizes="(max-width: 600px) 46vw, 260px" preload={preload} /> : <div className="drink-photo">🍵</div>}</div>; }
