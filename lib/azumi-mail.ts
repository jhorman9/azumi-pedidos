import nodemailer from "nodemailer";
import type { Order } from "./azumi-types";
import { readDocument, writeDocument } from "./azumi-store";

export const mailConfigured = () => !!(process.env.AZUMI_SMTP_HOST && process.env.AZUMI_MAIL_FROM);
export async function sendMail(to: string, subject: string, text: string) {
  if (!mailConfigured()) throw new Error("Configura el correo del restaurante para enviar mensajes.");
  const port = Number(process.env.AZUMI_SMTP_PORT || 465);
  const transport = nodemailer.createTransport({ host: process.env.AZUMI_SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465, auth: process.env.AZUMI_SMTP_USER ? { user: process.env.AZUMI_SMTP_USER, pass: process.env.AZUMI_SMTP_PASSWORD } : undefined, connectionTimeout: 7000, greetingTimeout: 7000, socketTimeout: 10000 });
  try { await transport.sendMail({ from: process.env.AZUMI_MAIL_FROM, to, subject, text }); }
  finally { transport.close(); }
}

export async function notifyOrder(order: Order) {
  if (!mailConfigured()) return;
  const text = `Pedido ${order.id}\nEstado: ${order.status}\nPago: ${order.paymentStatus}\nTotal: $${order.totals.total.toFixed(2)}\n${order.items.map(i => `${i.qty} x ${i.name} (${i.variant})`).join("\n")}\n${order.fulfillment === "delivery" ? "Delivery" : "Retiro"}\n${order.address}\nCliente: ${order.customer.name}\nTeléfono: ${order.customer.phone}\nEl restaurante coordina el pago directamente con el cliente.`;
  for (const recipient of [process.env.AZUMI_RESTAURANT_EMAIL, order.customer.email].filter(Boolean) as string[]) {
    const key = `mail_${order.id}_${order.status}_${order.paymentStatus}_${Buffer.from(recipient).toString("hex").slice(0, 100)}`;
    try {
      if (await readDocument<{ sent: boolean }>(key).then(value => value?.sent)) continue;
      await sendMail(recipient, `Azumi · ${order.id} · ${order.status}`, text);
      await writeDocument(key, { sent: true, date: new Date().toISOString() });
    } catch { console.error(`Azumi: no se pudo enviar la notificación del pedido ${order.id}.`); }
  }
}
