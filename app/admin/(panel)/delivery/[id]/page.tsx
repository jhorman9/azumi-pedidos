import { ZoneEditorScreen } from "@/components/admin/delivery-screens";

export const metadata = { title: "Editar cobertura" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ZoneEditorScreen id={id} />;
}
