import { AdminOrderScreen } from "@/components/admin/orders";

export const metadata = { title: "Detalle del pedido" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminOrderScreen id={id} />;
}
