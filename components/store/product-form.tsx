"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAzumi } from "@/components/azumi-provider";
import { Badge, Button, EmptyState, Field, ProductPhoto } from "@/components/ui";
import { availableProducts, createItem, money, options, type CartItem } from "@/lib/azumi-client";
import type { Product } from "@/lib/azumi-types";

export function ProductForm({ product, item, index }: { product: Product; item?: CartItem; index?: number }) {
  const { updatePersonal, personalReady, notify } = useAzumi(), router = useRouter();
  const variants = options(product.options), extraChoices = options(product.extras);
  const [variant, setVariant] = useState(item && variants.some(v => v.name === item.variant) ? item.variant : variants[0]?.name || ""), [extras, setExtras] = useState(item?.extras.map(e => e.name) || []), [qty, setQty] = useState(item?.qty || 1), [notes, setNotes] = useState(item?.notes || "");
  const selected = createItem(product, variant, extras, qty, notes);
  return <form onSubmit={e => { e.preventDefault(); updatePersonal(p => ({ ...p, cart: index === undefined ? [...p.cart, selected] : p.cart.map((value, i) => i === index ? selected : value) })); notify(index === undefined ? "Agregado a tu pedido" : "Producto actualizado"); router.push("/carrito"); }}>
    {variants.length > 0 && <section className="card"><div className="flex"><h3>Elige tu opción</h3><Badge>Obligatorio</Badge></div>{variants.map(v => <label className="choice" key={v.name}><input type="radio" name="variant" value={v.name} checked={variant === v.name} onChange={() => setVariant(v.name)} required /><span>{v.name}</span><span className="choice-price">{v.cost ? `+${money(v.cost)}` : "Incluido"}</span></label>)}</section>}
    {extraChoices.length > 0 && <section className="card"><h3>Hazlo a tu gusto</h3>{extraChoices.map(extra => <label className="choice" key={extra.name}><input type="checkbox" checked={extras.includes(extra.name)} onChange={e => setExtras(previous => e.target.checked ? [...previous, extra.name] : previous.filter(name => name !== extra.name))} /><span>{extra.name}</span><span className="choice-price">+{money(extra.cost)}</span></label>)}</section>}
    <label className="field"><span>Observaciones</span><textarea maxLength={200} placeholder="Sin cebolla, por favor…" value={notes} onChange={e => setNotes(e.target.value)} /></label><Field label="Cantidad" type="number" min={1} max={99} step={1} required value={qty} onChange={e => setQty(Number(e.target.value))} /><Button type="submit" disabled={!personalReady}>{index === undefined ? "Agregar al carrito" : "Guardar cambios"} · {money(selected.unit * qty)}</Button>
  </form>;
}
export function ProductScreen({ id }: { id: string }) {
  const { catalog } = useAzumi(), product = availableProducts(catalog).find(p => p.id === id);
  if (!product) return <EmptyState title="Producto no disponible">Explora otros sabores de nuestro menú.</EmptyState>;
  return <div className="product-detail"><Link href="/menu" className="back">← Volver al menú</Link><div className="product-detail-grid"><section><ProductPhoto image={product.image} name={product.name} className="detail-photo" /><span className="eyebrow">{product.category}</span><h1>{product.name}</h1><p className="muted">{product.description}</p><h2>{money(product.price)}</h2></section><ProductForm product={product} /></div></div>;
}
export function EditCartScreen({ index }: { index: number }) {
  const { cart, catalog } = useAzumi(), item = cart[index], product = availableProducts(catalog).find(p => p.id === item?.productId);
  if (!item || !product) return <EmptyState title="Este producto ya no está disponible" href="/carrito" label="Volver al carrito" />;
  return <><Link href="/carrito" className="back">← Volver al carrito</Link><h1>Editar {product.name}</h1><ProductForm product={product} item={item} index={index} /></>;
}
