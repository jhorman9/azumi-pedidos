import { ProductScreen } from "@/components/store/product-form";

export const metadata = { title: "Producto" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductScreen id={id} />;
}
