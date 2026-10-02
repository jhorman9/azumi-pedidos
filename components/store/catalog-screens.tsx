"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAzumi } from "@/components/azumi-provider";
import { Badge, EmptyState, Icon, PageHeading } from "@/components/ui";
import { ProductCard } from "./product-card";
import { availableProducts, money, promoActive } from "@/lib/azumi-client";

export function HomeScreen() {
  const { catalog, personal } = useAzumi(), products = availableProducts(catalog);
  const promotion = catalog.promotions.find(p => promoActive(p) && products.some(product => product.id === p.product));
  const promoProduct = products.find(p => p.id === promotion?.product);
  return <>
    <header className="welcome-header"><div><span className="eyebrow">Un mundo de sabores</span><h1>¿Qué se te antoja hoy?</h1><p className="muted">Fusión asiática y latinoamericana, preparada al momento.</p></div><Link className="delivery-address" href="/ubicacion"><span className="address-icon"><Icon name="pin" /></span><span><small>ENTREGAR EN</small><strong>{personal.deliveryAddress || "San Francisco, Panamá"}</strong><small>Ver cobertura y tarifa</small></span><Icon name="arrow" size={16} /></Link></header>
    <Link className="search-link" href="/menu"><Icon name="search" /><span>¿Qué quieres comer hoy?</span></Link>
    {promotion && promoProduct && <Link className="hero" href={`/producto/${promotion.product}`}><Image src={`/images/products/${promotion.image}.jpg`} alt={promotion.name} fill sizes="(max-width: 700px) 100vw, 980px" preload /><div className="hero-copy"><span className="eyebrow">Promo de la semana</span><h2>{promotion.name}</h2><p>{promotion.description}</p><Badge coral>Desde {money(promoProduct.price)}</Badge></div></Link>}
    <div className="chips">{catalog.categories.filter(c => c.active).map(c => <Link key={c.id} className="pill" href={`/categoria/${encodeURIComponent(c.name)}`}>{c.name}</Link>)}</div>
    <div className="section-heading"><h2>Más pedidos</h2><Link href="/menu">Ver todo →</Link></div><div className="product-grid">{products.filter(p => p.featured).slice(0, 4).map(p => <ProductCard key={p.id} product={p} />)}</div>
    <div className="section-heading"><h2>Especialidades Azumi</h2><Link href="/menu">Explorar →</Link></div><div className="product-grid">{products.filter(p => ["sushi", "pasta"].includes(p.id)).map(p => <ProductCard key={p.id} product={p} />)}</div>
    <section className="story-card"><span className="eyebrow">De nuestra casa a tu mesa</span><h2>Sabores que conectan.</h2><p>Nos encontramos en San Francisco, Calle 72. Tú eliges el antojo; nosotros ponemos el sabor.</p><Link href="/menu" className="button secondary">Explorar el menú</Link></section>
  </>;
}
export function MenuScreen({ category = "Todo", favorites = false }: { category?: string; favorites?: boolean }) {
  const { catalog, personal } = useAzumi(), [query, setQuery] = useState("");
  const products = availableProducts(catalog).filter(p => (!favorites || personal.favorites.includes(p.id)) && (category === "Todo" || (category === "Promociones" ? catalog.promotions.some(a => a.product === p.id && promoActive(a)) : category === "Especialidades" ? p.featured : p.category === category)) && `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase()));
  return <><PageHeading title={favorites ? "Mis favoritos" : category === "Todo" ? "Nuestro menú" : category} eyebrow="Encuentra tu próximo favorito" back="/" /><label className="search-link"><Icon name="search" /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar platos o sabores" aria-label="Buscar platos" /></label>
    {!favorites && <div className="chips"><Link className={`pill ${category === "Todo" ? "active" : ""}`} href="/menu">Todo</Link>{catalog.categories.filter(c => c.active).map(c => <Link className={`pill ${category === c.name ? "active" : ""}`} href={`/categoria/${encodeURIComponent(c.name)}`} key={c.id}>{c.name}</Link>)}</div>}
    <p className="results-count">{products.length} platos para disfrutar</p><div className="product-grid">{products.map(p => <ProductCard product={p} key={p.id} />)}</div>{!products.length && <EmptyState title={favorites ? "Guarda tu próximo favorito" : "No encontramos platos"}>{favorites ? "Toca el corazón de un plato para encontrarlo aquí." : "Prueba otra categoría o cambia la búsqueda."}</EmptyState>}</>;
}
