import { CatalogEditorScreen } from "@/components/admin/catalog-editor";

export const metadata = { title: "Editar categorías" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CatalogEditorScreen resource="categories" id={id} />;
}
