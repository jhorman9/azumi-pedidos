import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import seed from "./azumi-seed.json";
import type { Catalog, Order, Status } from "./azumi-types";
import { AppError, buildOrder, object, text, validateCatalog } from "./azumi-validation";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
let database: DatabaseSync | undefined;
export function db(): DatabaseSync {
  if (!database) {
    const filename=process.env.AZUMI_DATABASE_PATH || path.join(process.cwd(),"data","azumi.sqlite");
    mkdirSync(path.dirname(filename),{recursive:true});
    database=new DatabaseSync(filename,{timeout:5000});
    database.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS catalog (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS orders (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, owner TEXT NOT NULL, request_key TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(owner,request_key));
      CREATE INDEX IF NOT EXISTS orders_owner ON orders(owner);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL, credential TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY CHECK(id=1), count INTEGER NOT NULL, expires INTEGER NOT NULL);
    `);
    database.prepare("INSERT OR IGNORE INTO catalog(id,revision,data) VALUES(1,1,?)").run(JSON.stringify(validateCatalog(seed)));
  }
  return database;
}
export function catalog(): { revision: number; data: Catalog } {
  const row=db().prepare("SELECT revision,data FROM catalog WHERE id=1").get()!;
  return {revision:Number(row.revision),data:JSON.parse(String(row.data)) as Catalog};
}
export function snapshot(owner?: string, token?: string) {
  const authenticated = isAdmin(token), current = catalog();
  const data = authenticated ? current.data : { ...current.data, products: current.data.products.filter(p => p.active && current.data.categories.some(c => c.active && c.name === p.category)), categories: current.data.categories.filter(c => c.active) };
  return { ...data, revision: current.revision, orders: owner && /^[a-f0-9]{64}$/.test(owner) ? orders(owner, false) : [], adminOrders: authenticated ? orders(owner || "", true) : undefined, admin: authenticated, development: process.env.NODE_ENV !== "production", serverTime: new Date().toISOString() };
}
function credentials() {
  const email=process.env.AZUMI_ADMIN_EMAIL || (process.env.NODE_ENV!=="production"?"admin@azumi.demo":"");
  const password=process.env.AZUMI_ADMIN_PASSWORD || (process.env.NODE_ENV!=="production"?"azumi123":"");
  if (!email || !password || (process.env.NODE_ENV==="production" && password.length<12)) throw new AppError("Configura AZUMI_ADMIN_EMAIL y una AZUMI_ADMIN_PASSWORD de al menos 12 caracteres en el servidor.",503);
  return {email,password,fingerprint:hash(email+":"+password)};
}
export function login(input: unknown): string {
  const d=object(input), email=text(d.email,"Correo",150,true).toLowerCase(), password=text(d.password,"Contraseña",200,true), now=Date.now();
  const attempts=db().prepare("SELECT count,expires FROM login_attempts WHERE id=1").get();
  if (attempts && Number(attempts.expires)>now && Number(attempts.count)>=8) throw new AppError("Demasiados intentos. Intenta de nuevo en 15 minutos.",429);
  const configured=credentials();
  const emailMatches=timingSafeEqual(Buffer.from(hash(email)),Buffer.from(hash(configured.email.toLowerCase())));
  const passwordMatches=timingSafeEqual(Buffer.from(hash(password)),Buffer.from(hash(configured.password)));
  if (!emailMatches || !passwordMatches) {
    const count=attempts && Number(attempts.expires)>now ? Number(attempts.count)+1 : 1;
    db().prepare("INSERT INTO login_attempts(id,count,expires) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET count=excluded.count,expires=excluded.expires").run(count,now+15*60*1000);
    throw new AppError("Correo o contraseña incorrectos.",401);
  }
  db().prepare("DELETE FROM login_attempts").run();
  db().prepare("DELETE FROM sessions WHERE expires < ?").run(now);
  const token=randomBytes(32).toString("hex");
  db().prepare("INSERT INTO sessions(token,expires,credential) VALUES(?,?,?)").run(hash(token),now+8*60*60*1000,configured.fingerprint);
  return token;
}
export function isAdmin(token: string | undefined): boolean {
  if (!token) return false;
  const session=db().prepare("SELECT expires,credential FROM sessions WHERE token=?").get(hash(token));
  if (!session || Number(session.expires)<=Date.now()) return false;
  try { return session.credential===credentials().fingerprint; } catch { return false; }
}
export function logout(token: string | undefined) { if (token) db().prepare("DELETE FROM sessions WHERE token=?").run(hash(token)); }
export const visitorToken = () => randomBytes(32).toString("hex");
export function orders(owner: string, admin: boolean): Order[] {
  const rows=admin?db().prepare("SELECT data FROM orders ORDER BY sequence").all():db().prepare("SELECT data FROM orders WHERE owner=? ORDER BY sequence").all(hash(owner));
  return rows.map(row=>JSON.parse(String(row.data)) as Order);
}
export function placeOrder(input: unknown, owner: string): Order {
  const d=object(input), key=text(d.requestKey,"Identificador de pedido",80,true);
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(key)) throw new AppError("Identificador de pedido inválido.");
  const conn=db();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const existing=conn.prepare("SELECT data FROM orders WHERE owner=? AND request_key=?").get(hash(owner),key);
    if (existing) { conn.exec("COMMIT"); return JSON.parse(String(existing.data)) as Order; }
    const draft=buildOrder(d,catalog().data);
    const row=conn.prepare("SELECT COALESCE(MAX(sequence),0)+1048 AS next FROM orders").get()!;
    const order: Order={...draft,id:"AZ-"+row.next,date:new Date().toISOString()};
    conn.prepare("INSERT INTO orders(id,owner,request_key,data) VALUES(?,?,?,?)").run(order.id,hash(owner),key,JSON.stringify(order));
    conn.exec("COMMIT");
    return order;
  } catch (error) { conn.exec("ROLLBACK"); throw error; }
}
export function patchCatalog(input: unknown) {
  const d=object(input), changes=object(d.changes), allowed=["products","categories","zones","promotions","coupons","settings"];
  if (!Object.keys(changes).length || Object.keys(changes).some(key=>!allowed.includes(key))) throw new AppError("Cambios inválidos.");
  const conn=db();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const current=catalog();
    if (d.revision!==current.revision) throw new AppError("Otra sesión actualizó el catálogo. Recargamos los datos; vuelve a aplicar tu cambio.",409);
    const next=validateCatalog({...current.data,...changes});
    conn.prepare("UPDATE catalog SET revision=revision+1,data=? WHERE id=1").run(JSON.stringify(next));
    conn.exec("COMMIT");
    return catalog();
  } catch (error) { conn.exec("ROLLBACK"); throw error; }
}
export function updateStatus(input: unknown): Order {
  const d=object(input), id=text(d.id,"Pedido",80,true), status=text(d.status,"Estado",30,true) as Status;
  const conn=db();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const row=conn.prepare("SELECT data FROM orders WHERE id=?").get(id);
    if (!row) throw new AppError("Pedido no encontrado.",404);
    const order=JSON.parse(String(row.data)) as Order;
    if (d.previousStatus!==order.status) throw new AppError("El pedido fue actualizado por otra sesión. Revisa su estado actual.",409);
    const transitions: Record<Status,Status[]>={Recibido:["Recibido","Confirmado","Cancelado"],Confirmado:["Confirmado",...(order.fulfillment==="delivery"?["En camino" as Status]:["Entregado" as Status]),"Cancelado"],"En camino":["En camino","Entregado","Cancelado"],Entregado:["Entregado"],Cancelado:["Cancelado"]};
    if (!transitions[order.status].includes(status)) throw new AppError("Ese cambio de estado no está permitido.",409);
    order.status=status;
    conn.prepare("UPDATE orders SET data=? WHERE id=?").run(JSON.stringify(order),id);
    conn.exec("COMMIT");
    return order;
  } catch (error) { conn.exec("ROLLBACK"); throw error; }
}
