import { EditCartScreen } from "@/components/store/product-form";

export const metadata = { title: "Editar producto" };
export default async function Page({ params }: { params: Promise<{ index: string }> }) {
  const { index } = await params;
  return <EditCartScreen index={Number(index)} />;
}
