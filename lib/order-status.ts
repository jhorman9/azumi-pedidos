import type { Order, Status } from "./azumi-types";

export function statusOptions(order: Order): Status[] {
  const transitions: Record<Status, Status[]> = {
    Recibido: ["Recibido", "Confirmado", "Cancelado"],
    Confirmado: ["Confirmado", "En preparación", "Cancelado"],
    "En preparación": ["En preparación", "Listo", "Cancelado"],
    Listo: ["Listo", order.fulfillment === "delivery" ? "En camino" : "Entregado", "Cancelado"],
    "En camino": ["En camino", "Entregado", "Cancelado"],
    Entregado: ["Entregado"], Cancelado: ["Cancelado"],
  };
  return transitions[order.status] || [];
}
export function statusMessage(order: Pick<Order, "status" | "fulfillment">) {
  const messages: Record<Status, string> = {
    Recibido: "El restaurante recibió tu pedido.", Confirmado: "Tu pedido está confirmado.",
    "En preparación": "Estamos preparando tu pedido.",
    Listo: order.fulfillment === "pickup" ? "Tu pedido está listo para retirar." : "Tu pedido está listo para salir a entrega.",
    "En camino": "Tu pedido está en camino.", Entregado: "Tu pedido fue entregado.", Cancelado: "Tu pedido fue cancelado.",
  };
  return messages[order.status];
}
