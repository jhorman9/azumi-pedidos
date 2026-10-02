"use client";
import Link from "next/link";
import { useAzumi } from "@/components/azumi-provider";
import { Icon, ProductPhoto } from "@/components/ui";
import { money } from "@/lib/azumi-client";
import type { Product } from "@/lib/azumi-types";

export function ProductCard({ product }: { product: Product }) {
  const { personal, personalReady, updatePersonal } = useAzumi(), favorite = personal.favorites.includes(product.id);
  return <article className="product-card">
    <div className="product-image"><Link href={`/producto/${product.id}`}><ProductPhoto image={product.image} name={product.name} /></Link><button disabled={!personalReady} className={`favorite ${favorite ? "selected" : ""}`} aria-label={`${favorite ? "Quitar" : "Guardar"} ${product.name} de favoritos`} aria-pressed={favorite} onClick={() => updatePersonal(p => ({ ...p, favorites: favorite ? p.favorites.filter(id => id !== product.id) : [...p.favorites, product.id] }))}><Icon name="heart" size={17} /></button></div>
    <Link className="product-copy" href={`/producto/${product.id}`}><span className="product-category">{product.category}</span><h3>{product.name}</h3><p>{product.description}</p></Link>
    <div className="price-row"><strong>{money(product.price)}</strong><Link href={`/producto/${product.id}`} className="add" aria-label={`Agregar ${product.name}`}>+</Link></div>
  </article>;
}
