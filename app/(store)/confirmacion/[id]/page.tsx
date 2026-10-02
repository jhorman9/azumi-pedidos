import { OrderScreen } from "@/components/store/order-screens";

export const metadata = { title: "Pedido recibido" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderScreen id={id} success />;
}
