import { MenuScreen } from "@/components/store/catalog-screens";

export const metadata = { title: "Categoría" };
export default async function Page({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return <MenuScreen category={name} />;
}
