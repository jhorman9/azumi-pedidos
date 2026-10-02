import { CatalogEditorScreen } from "@/components/admin/catalog-editor";

export const metadata = { title: "Editar cupones" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CatalogEditorScreen resource="coupons" id={id} />;
}
