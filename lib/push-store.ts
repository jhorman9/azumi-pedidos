import { createHash } from "node:crypto";
import webpush from "web-push";
import type { RowDataPacket } from "mysql2/promise";
import { db, deleteDocument, isAdmin, readDocument, writeDocument } from "./azumi-store";
import { customerSession } from "./customer-store";
import { AppError, object, text } from "./azumi-validation";
import { statusMessage } from "./order-status";
import type { Order } from "./azumi-types";
import type { NextRequest } from "next/server";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type Actor = { role: "customer" | "admin"; owner: string; session: string };
type Record = Actor & { subscription: webpush.PushSubscription };
let tableReady: Promise<void> | undefined;
async function pushDb() {
  const connection = await db();
  tableReady ??= (async () => {
    if (connection.kind === "sqlite") connection.database.exec("CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, role TEXT NOT NULL, owner TEXT NOT NULL, data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS push_owner ON push_subscriptions(role,owner)");
    else await connection.pool.query("CREATE TABLE IF NOT EXISTS push_subscriptions (id CHAR(64) PRIMARY KEY, role VARCHAR(20) NOT NULL, owner CHAR(64) NOT NULL, data LONGTEXT NOT NULL, KEY push_owner(role,owner)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  })();
  await tableReady;
  return connection;
}
export async function pushActor(request: NextRequest): Promise<Actor> {
  if (request.nextUrl.searchParams.get("role") === "admin") {
    const token = request.cookies.get("azumi_admin")?.value;
    if (!token || !(await isAdmin(token))) throw new AppError("Inicia sesión en administración para activar avisos.", 401);
    return { role: "admin", owner: "restaurant", session: hash(token) };
  }
  const token = request.cookies.get("azumi_customer")?.value, account = await customerSession(token);
  if (!token || !account) throw new AppError("Inicia sesión para activar avisos.", 401);
  return { role: "customer", owner: hash(account.owner), session: hash(token) };
}
export async function pushKeys() {
  if (process.env.AZUMI_VAPID_PUBLIC_KEY && process.env.AZUMI_VAPID_PRIVATE_KEY) return { publicKey: process.env.AZUMI_VAPID_PUBLIC_KEY, privateKey: process.env.AZUMI_VAPID_PRIVATE_KEY };
  const key = "web_push_vapid";
  const saved = await readDocument<{ publicKey: string; privateKey: string }>(key);
  if (saved) return saved;
  await writeDocument(key, webpush.generateVAPIDKeys(), true);
  return (await readDocument<{ publicKey: string; privateKey: string }>(key))!;
}
function endpointValue(value: unknown) {
  const raw = text(value, "Suscripción", 2048, true);
  let endpoint: URL;
  try { endpoint = new URL(raw); } catch { throw new AppError("Suscripción inválida."); }
  const host = endpoint.hostname;
  const approved = host === "fcm.googleapis.com" || host === "web.push.apple.com" || host.endsWith(".push.services.mozilla.com") || host.endsWith(".notify.windows.com");
  if (!approved || endpoint.protocol !== "https:" || (endpoint.port && endpoint.port !== "443") || endpoint.username || endpoint.password) throw new AppError("Servicio de notificaciones no permitido.");
  return raw;
}
export async function subscribePush(actor: Actor, input: unknown) {
  const value = object(input), keys = object(value.keys), endpoint = endpointValue(value.endpoint);
  const p256dh = text(keys.p256dh, "Clave", 100, true), auth = text(keys.auth, "Clave", 30, true);
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(p256dh) || !/^[A-Za-z0-9_-]+={0,2}$/.test(auth) || Buffer.from(p256dh, "base64url").length !== 65 || Buffer.from(auth, "base64url").length !== 16) throw new AppError("Claves de suscripción inválidas.");
  const connection = await pushDb(), id = hash(actor.role + endpoint), data = JSON.stringify({ ...actor, subscription: { endpoint, keys: { p256dh, auth } } } satisfies Record);
  if (connection.kind === "sqlite") connection.database.prepare("INSERT INTO push_subscriptions(id,role,owner,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,data=excluded.data").run(id, actor.role, actor.owner, data);
  else await connection.pool.execute("INSERT INTO push_subscriptions(id,role,owner,data) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE owner=VALUES(owner),data=VALUES(data)", [id, actor.role, actor.owner, data]);
}
export async function unsubscribePush(actor: Actor, endpoint: unknown) {
  const id = hash(actor.role + endpointValue(endpoint)), connection = await pushDb();
  if (connection.kind === "sqlite") connection.database.prepare("DELETE FROM push_subscriptions WHERE id=? AND owner=?").run(id, actor.owner);
  else await connection.pool.execute("DELETE FROM push_subscriptions WHERE id=? AND owner=?", [id, actor.owner]);
}
async function sessionAlive(record: Record) {
  if (record.role === "customer") {
    const session = await readDocument<{ email: string; expires: number; credential: string }>(`customer_session_${record.session}`);
    if (!session || session.expires < Date.now()) return false;
    const account = await readDocument<{ owner: string; password: string }>(`customer_${hash(session.email)}`);
    return !!account && hash(account.owner) === record.owner && hash(account.password) === session.credential;
  }
  const connection = await db();
  const session = connection.kind === "sqlite" ? connection.database.prepare("SELECT expires,credential FROM sessions WHERE token=?").get(record.session) : (await connection.pool.execute<RowDataPacket[]>("SELECT expires,credential FROM sessions WHERE token=?", [record.session]))[0][0];
  const email = process.env.AZUMI_ADMIN_EMAIL || (process.env.NODE_ENV !== "production" ? "admin@azumi.demo" : ""), password = process.env.AZUMI_ADMIN_PASSWORD || (process.env.NODE_ENV !== "production" ? "azumi123" : "");
  return !!session && Number(session.expires) > Date.now() && session.credential === hash(email + ":" + password);
}
export async function notifyPush(order: Order) {
  const connection = await pushDb();
  const orderRow = connection.kind === "sqlite" ? connection.database.prepare("SELECT owner FROM orders WHERE id=?").get(order.id) : (await connection.pool.execute<RowDataPacket[]>("SELECT owner FROM orders WHERE id=?", [order.id]))[0][0];
  if (!orderRow) return;
  const sql = "SELECT id,data FROM push_subscriptions WHERE role='admin' OR (role='customer' AND owner=?)";
  const rows = connection.kind === "sqlite" ? connection.database.prepare(sql).all(String(orderRow.owner)) : (await connection.pool.execute<RowDataPacket[]>(sql, [orderRow.owner]))[0];
  if (!rows.length) return;
  const keys = await pushKeys();
  for (const row of rows) {
    const record = JSON.parse(String(row.data)) as Record;
    if (!(await sessionAlive(record))) { await unsubscribePush(record, record.subscription.endpoint); continue; }
    const receipt = `push_${hash(`${row.id}:${order.id}:${order.status}:${order.paymentStatus}`)}`;
    if (!(await writeDocument(receipt, { sent: false, date: Date.now() }, true))) continue;
    const payload = { title: record.role === "admin" ? `${order.id} · ${order.status === "Recibido" ? "Nuevo pedido" : order.status}` : `Azumi · ${order.id}`, body: record.role === "admin" ? `Pago ${order.paymentStatus.toLowerCase()} · ${order.fulfillment === "delivery" ? "Delivery" : "Retiro"}` : statusMessage(order), url: record.role === "admin" ? `/admin/pedidos/${order.id}` : `/pedido/${order.id}`, tag: `azumi-${order.id}` };
    try {
      await webpush.sendNotification(record.subscription, JSON.stringify(payload), { vapidDetails: { ...keys, subject: process.env.AZUMI_VAPID_SUBJECT || process.env.AZUMI_APP_URL || "https://azumi.example" }, TTL: 3600, timeout: 8000 });
      await writeDocument(receipt, { sent: true, date: Date.now() });
    } catch (error) {
      await deleteDocument(receipt);
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await unsubscribePush(record, record.subscription.endpoint);
      else console.error(`Azumi: no se pudo enviar el aviso push de ${order.id}.`);
    }
  }
}
