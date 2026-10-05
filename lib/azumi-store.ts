import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createPool, type Pool, type PoolConnection, type PoolOptions, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import seed from "./azumi-seed.json";
import type { Catalog, Order, Status } from "./azumi-types";
import { AppError, buildOrder, object, text, validateCatalog } from "./azumi-validation";
import { geographicCatalog, geographicPoint } from "./delivery-geo";
import { statusOptions } from "./order-status";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

type SqliteStore = { kind: "sqlite"; database: DatabaseSync };
type MysqlStore = { kind: "mysql"; pool: Pool };
type Store = SqliteStore | MysqlStore;

let store: Promise<Store> | undefined;

function mysqlEnabled() {
  return process.env.AZUMI_DATABASE_DRIVER === "mysql" || !!process.env.AZUMI_DATABASE_URL || !!process.env.AZUMI_MYSQL_HOST;
}

function mysqlConfig(): string | PoolOptions {
  if (process.env.AZUMI_DATABASE_URL) return process.env.AZUMI_DATABASE_URL;
  const host = process.env.AZUMI_MYSQL_HOST || "127.0.0.1";
  const port = Number(process.env.AZUMI_MYSQL_PORT || 3306);
  const database = process.env.AZUMI_MYSQL_DATABASE;
  const user = process.env.AZUMI_MYSQL_USER;
  const password = process.env.AZUMI_MYSQL_PASSWORD;
  if (!database || !user || !password) {
    throw new AppError("Configura AZUMI_MYSQL_DATABASE, AZUMI_MYSQL_USER y AZUMI_MYSQL_PASSWORD en el servidor.", 503);
  }
  return { host, port, database, user, password, waitForConnections: true, connectionLimit: 10, charset: "utf8mb4" };
}

async function createMysqlStore(): Promise<MysqlStore> {
  const config = mysqlConfig();
  const pool = typeof config === "string" ? createPool(config) : createPool(config);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog (
      id TINYINT PRIMARY KEY,
      revision INT NOT NULL,
      data LONGTEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      sequence BIGINT PRIMARY KEY AUTO_INCREMENT,
      id VARCHAR(80) UNIQUE NOT NULL,
      owner CHAR(64) NOT NULL,
      request_key VARCHAR(80) NOT NULL,
      data LONGTEXT NOT NULL,
      UNIQUE KEY orders_owner_request (owner, request_key),
      KEY orders_owner (owner)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=1048
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token CHAR(64) PRIMARY KEY,
      expires BIGINT NOT NULL,
      credential CHAR(64) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id TINYINT PRIMARY KEY,
      count INT NOT NULL,
      expires BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.execute(
    "INSERT IGNORE INTO catalog(id, revision, data) VALUES(1, 1, ?)",
    [JSON.stringify(validateCatalog(seed))]
  );
  return { kind: "mysql", pool };
}

function createSqliteStore(): SqliteStore {
  const filename = process.env.AZUMI_DATABASE_PATH || path.join(process.cwd(), "data", "azumi.sqlite");
  mkdirSync(path.dirname(filename), { recursive: true });
  const database = new DatabaseSync(filename, { timeout: 5000 });
  database.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS catalog (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, owner TEXT NOT NULL, request_key TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(owner,request_key));
    CREATE INDEX IF NOT EXISTS orders_owner ON orders(owner);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL, credential TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY CHECK(id=1), count INTEGER NOT NULL, expires INTEGER NOT NULL);
  `);
  database.prepare("INSERT OR IGNORE INTO catalog(id,revision,data) VALUES(1,1,?)").run(JSON.stringify(validateCatalog(seed)));
  return { kind: "sqlite", database };
}

export async function db(): Promise<Store> {
  store ??= mysqlEnabled() ? createMysqlStore() : Promise.resolve(createSqliteStore());
  return store;
}

let documentsReady: Promise<void> | undefined;
async function documentStore() {
  const conn = await db();
  documentsReady ??= (async () => {
    if (conn.kind === "sqlite") conn.database.exec("CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
    else await conn.pool.query("CREATE TABLE IF NOT EXISTS documents (id VARCHAR(191) PRIMARY KEY, data LONGTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");
  })();
  await documentsReady;
  return conn;
}
export async function readDocument<T>(id: string): Promise<T | null> {
  const conn = await documentStore();
  const row = conn.kind === "sqlite" ? conn.database.prepare("SELECT data FROM documents WHERE id=?").get(id) : await mysqlGet<RowDataPacket>(conn.pool, "SELECT data FROM documents WHERE id=?", [id]);
  return row ? JSON.parse(String(row.data)) as T : null;
}
export async function writeDocument(id: string, value: unknown, insertOnly = false, previous?: unknown) {
  const conn = await documentStore(), data = JSON.stringify(value);
  if (previous !== undefined) {
    const params = [data, id, JSON.stringify(previous)];
    if (conn.kind === "sqlite") return Number(conn.database.prepare("UPDATE documents SET data=? WHERE id=? AND data=?").run(...params).changes) > 0;
    const [result] = await conn.pool.execute<ResultSetHeader>("UPDATE documents SET data=? WHERE id=? AND data=?", params);
    return result.affectedRows > 0;
  }
  if (conn.kind === "sqlite") {
    const result = conn.database.prepare(insertOnly ? "INSERT OR IGNORE INTO documents(id,data) VALUES(?,?)" : "INSERT INTO documents(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(id, data);
    return Number(result.changes) > 0;
  }
  const [result] = await conn.pool.execute<ResultSetHeader>(insertOnly ? "INSERT IGNORE INTO documents(id,data) VALUES(?,?)" : "INSERT INTO documents(id,data) VALUES(?,?) ON DUPLICATE KEY UPDATE data=VALUES(data)", [id, data]);
  return result.affectedRows > 0;
}
export async function deleteDocument(id: string) {
  const conn = await documentStore();
  if (conn.kind === "sqlite") conn.database.prepare("DELETE FROM documents WHERE id=?").run(id);
  else await conn.pool.execute("DELETE FROM documents WHERE id=?", [id]);
}

type MysqlExecutor = Pool | PoolConnection;

type SqlValue = string | number | null;

async function mysqlGet<T extends RowDataPacket>(conn: MysqlExecutor, sql: string, params: SqlValue[] = []) {
  const [rows] = await conn.execute<T[]>(sql, params);
  return rows[0];
}

async function mysqlAll<T extends RowDataPacket>(conn: MysqlExecutor, sql: string, params: SqlValue[] = []) {
  const [rows] = await conn.execute<T[]>(sql, params);
  return rows;
}

async function catalogFrom(conn: Store | MysqlExecutor): Promise<{ revision: number; data: Catalog }> {
  if ("kind" in conn && conn.kind === "sqlite") {
    const row = conn.database.prepare("SELECT revision,data FROM catalog WHERE id=1").get()!;
    return { revision: Number(row.revision), data: geographicCatalog(JSON.parse(String(row.data)) as Catalog) };
  }
  const executor = "kind" in conn ? conn.pool : conn;
  const row = await mysqlGet<RowDataPacket>(executor, "SELECT revision, data FROM catalog WHERE id=1");
  return { revision: Number(row.revision), data: geographicCatalog(JSON.parse(String(row.data)) as Catalog) };
}

export async function catalog(): Promise<{ revision: number; data: Catalog }> {
  return catalogFrom(await db());
}

export async function snapshot(owner?: string, token?: string, requireAccount = false) {
  const conn = await db();
  const authenticated = await isAdmin(token), current = await catalogFrom(conn);
  const data = requireAccount && !owner && !authenticated ? { ...current.data, products: [], categories: [], zones: [], promotions: [], coupons: [] } : authenticated ? current.data : {
    ...current.data,
    products: current.data.products.filter(p => p.active && current.data.categories.some(c => c.active && c.name === p.category)),
    categories: current.data.categories.filter(c => c.active),
  };
  return {
    ...data,
    revision: current.revision,
    orders: owner && /^[a-f0-9]{64}$/.test(owner) ? await orders(owner, false, conn) : [],
    adminOrders: authenticated ? await orders(owner || "", true, conn) : undefined,
    admin: authenticated,
    customerAuthenticated: !!owner,
    development: process.env.NODE_ENV !== "production",
    serverTime: new Date().toISOString(),
  };
}

function credentials() {
  const email = process.env.AZUMI_ADMIN_EMAIL || (process.env.NODE_ENV !== "production" ? "admin@azumi.demo" : "");
  const password = process.env.AZUMI_ADMIN_PASSWORD || (process.env.NODE_ENV !== "production" ? "azumi123" : "");
  if (!email || !password || (process.env.NODE_ENV === "production" && password.length < 12)) {
    throw new AppError("Configura AZUMI_ADMIN_EMAIL y una AZUMI_ADMIN_PASSWORD de al menos 12 caracteres en el servidor.", 503);
  }
  return { email, password, fingerprint: hash(email + ":" + password) };
}

export async function login(input: unknown): Promise<string> {
  const d = object(input), email = text(d.email, "Correo", 150, true).toLowerCase(), password = text(d.password, "Contrasena", 200, true), now = Date.now();
  const conn = await db();
  const attempts = conn.kind === "sqlite"
    ? conn.database.prepare("SELECT count,expires FROM login_attempts WHERE id=1").get()
    : await mysqlGet<RowDataPacket>(conn.pool, "SELECT count, expires FROM login_attempts WHERE id=1");
  if (attempts && Number(attempts.expires) > now && Number(attempts.count) >= 8) throw new AppError("Demasiados intentos. Intenta de nuevo en 15 minutos.", 429);
  const configured = credentials();
  const emailMatches = timingSafeEqual(Buffer.from(hash(email)), Buffer.from(hash(configured.email.toLowerCase())));
  const passwordMatches = timingSafeEqual(Buffer.from(hash(password)), Buffer.from(hash(configured.password)));
  if (!emailMatches || !passwordMatches) {
    const count = attempts && Number(attempts.expires) > now ? Number(attempts.count) + 1 : 1;
    if (conn.kind === "sqlite") {
      conn.database.prepare("INSERT INTO login_attempts(id,count,expires) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET count=excluded.count,expires=excluded.expires").run(count, now + 15 * 60 * 1000);
    } else {
      await conn.pool.execute("INSERT INTO login_attempts(id,count,expires) VALUES(1,?,?) ON DUPLICATE KEY UPDATE count=VALUES(count), expires=VALUES(expires)", [count, now + 15 * 60 * 1000]);
    }
    throw new AppError("Correo o contrasena incorrectos.", 401);
  }
  const token = randomBytes(32).toString("hex");
  if (conn.kind === "sqlite") {
    conn.database.prepare("DELETE FROM login_attempts").run();
    conn.database.prepare("DELETE FROM sessions WHERE expires < ?").run(now);
    conn.database.prepare("INSERT INTO sessions(token,expires,credential) VALUES(?,?,?)").run(hash(token), now + 8 * 60 * 60 * 1000, configured.fingerprint);
  } else {
    await conn.pool.execute("DELETE FROM login_attempts");
    await conn.pool.execute("DELETE FROM sessions WHERE expires < ?", [now]);
    await conn.pool.execute("INSERT INTO sessions(token,expires,credential) VALUES(?,?,?)", [hash(token), now + 8 * 60 * 60 * 1000, configured.fingerprint]);
  }
  return token;
}

export async function isAdmin(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const conn = await db();
  const session = conn.kind === "sqlite"
    ? conn.database.prepare("SELECT expires,credential FROM sessions WHERE token=?").get(hash(token))
    : await mysqlGet<RowDataPacket>(conn.pool, "SELECT expires, credential FROM sessions WHERE token=?", [hash(token)]);
  if (!session || Number(session.expires) <= Date.now()) return false;
  try { return session.credential === credentials().fingerprint; } catch { return false; }
}

export async function logout(token: string | undefined) {
  if (!token) return;
  const conn = await db();
  if (conn.kind === "sqlite") conn.database.prepare("DELETE FROM sessions WHERE token=?").run(hash(token));
  else await conn.pool.execute("DELETE FROM sessions WHERE token=?", [hash(token)]);
}

export const visitorToken = () => randomBytes(32).toString("hex");

function geographicOrder(order: Order): Order { return { ...order, point: order.point ? geographicPoint(order.point, order.pointSystem !== "wgs84") : null, pointSystem: "wgs84" }; }

export async function orders(owner: string, admin: boolean, existing?: Store): Promise<Order[]> {
  const conn = existing || await db();
  if (conn.kind === "sqlite") {
    const rows = admin
      ? conn.database.prepare("SELECT data FROM orders ORDER BY sequence").all()
      : conn.database.prepare("SELECT data FROM orders WHERE owner=? ORDER BY sequence").all(hash(owner));
    return rows.map(row => geographicOrder(JSON.parse(String(row.data)) as Order));
  }
  const rows = admin
    ? await mysqlAll<RowDataPacket>(conn.pool, "SELECT data FROM orders ORDER BY sequence")
    : await mysqlAll<RowDataPacket>(conn.pool, "SELECT data FROM orders WHERE owner=? ORDER BY sequence", [hash(owner)]);
  return rows.map(row => geographicOrder(JSON.parse(String(row.data)) as Order));
}

let writeQueue = Promise.resolve();
async function serializedWrite<T>(action: () => Promise<T>): Promise<T> {
  const previous = writeQueue;
  let release!: () => void;
  writeQueue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try { return await action(); } finally { release(); }
}
export function placeOrder(input: unknown, owner: string): Promise<Order> {
  return serializedWrite(() => placeOrderInternal(input, owner)).then(geographicOrder);
}
async function placeOrderInternal(input: unknown, owner: string): Promise<Order> {
  const d = object(input), key = text(d.requestKey, "Identificador de pedido", 80, true);
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(key)) throw new AppError("Identificador de pedido invalido.");
  const conn = await db();
  if (conn.kind === "sqlite") {
    conn.database.exec("BEGIN IMMEDIATE");
    try {
      const existing = conn.database.prepare("SELECT data FROM orders WHERE owner=? AND request_key=?").get(hash(owner), key);
      if (existing) { conn.database.exec("COMMIT"); return JSON.parse(String(existing.data)) as Order; }
      const draft = buildOrder(d, (await catalogFrom(conn)).data);
      const row = conn.database.prepare("SELECT COALESCE(MAX(sequence),0)+1048 AS next FROM orders").get()!;
      const order: Order = { ...draft, id: "AZ-" + row.next, date: new Date().toISOString() };
      conn.database.prepare("INSERT INTO orders(id,owner,request_key,data) VALUES(?,?,?,?)").run(order.id, hash(owner), key, JSON.stringify(order));
      conn.database.exec("COMMIT");
      return order;
    } catch (error) { conn.database.exec("ROLLBACK"); throw error; }
  }
  const connection = await conn.pool.getConnection();
  try {
    await connection.beginTransaction();
    const existing = await mysqlGet<RowDataPacket>(connection, "SELECT data FROM orders WHERE owner=? AND request_key=?", [hash(owner), key]);
    if (existing) { await connection.commit(); return JSON.parse(String(existing.data)) as Order; }
    const draft = buildOrder(d, (await catalogFrom(connection)).data);
    const [result] = await connection.execute<ResultSetHeader>("INSERT INTO orders(id,owner,request_key,data) VALUES(?,?,?,?)", ["", hash(owner), key, "{}"]);
    const order: Order = { ...draft, id: "AZ-" + result.insertId, date: new Date().toISOString() };
    await connection.execute("UPDATE orders SET id=?, data=? WHERE sequence=?", [order.id, JSON.stringify(order), result.insertId]);
    await connection.commit();
    return order;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export function patchCatalog(input: unknown) { return serializedWrite(() => patchCatalogInternal(input)); }
async function patchCatalogInternal(input: unknown) {
  const d = object(input), changes = object(d.changes), allowed = ["products", "categories", "zones", "promotions", "coupons", "settings"];
  if (!Object.keys(changes).length || Object.keys(changes).some(key => !allowed.includes(key))) throw new AppError("Cambios invalidos.");
  const conn = await db();
  if (conn.kind === "sqlite") {
    conn.database.exec("BEGIN IMMEDIATE");
    try {
      const current = await catalogFrom(conn);
      if (d.revision !== current.revision) throw new AppError("Otra sesion actualizo el catalogo. Recargamos los datos; vuelve a aplicar tu cambio.", 409);
      const next = validateCatalog({ ...current.data, ...changes });
      conn.database.prepare("UPDATE catalog SET revision=revision+1,data=? WHERE id=1").run(JSON.stringify(next));
      conn.database.exec("COMMIT");
      return catalogFrom(conn);
    } catch (error) { conn.database.exec("ROLLBACK"); throw error; }
  }
  const connection = await conn.pool.getConnection();
  try {
    await connection.beginTransaction();
    const current = await catalogFrom(connection);
    if (d.revision !== current.revision) throw new AppError("Otra sesion actualizo el catalogo. Recargamos los datos; vuelve a aplicar tu cambio.", 409);
    const next = validateCatalog({ ...current.data, ...changes });
    await connection.execute("UPDATE catalog SET revision=revision+1, data=? WHERE id=1", [JSON.stringify(next)]);
    await connection.commit();
    return catalogFrom(conn);
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export function updateStatus(input: unknown, payment = false): Promise<Order> { return serializedWrite(() => updateStatusInternal(input, payment)); }
async function updateStatusInternal(input: unknown, payment = false): Promise<Order> {
  const d = object(input), id = text(d.id, "Pedido", 80, true), status = text(d.status, "Estado", 30, true) as Status;
  const conn = await db();
  const apply = (order: Order) => {
    if (payment) {
      if (d.previousPaymentStatus !== order.paymentStatus) throw new AppError("El pago fue actualizado por otra sesión. Revisa su estado actual.", 409);
      if (d.paymentStatus !== "Pagado" && d.paymentStatus !== "Devuelto") throw new AppError("Estado de pago inválido.");
      if ((d.paymentStatus === "Pagado" && order.paymentStatus !== "Pendiente") || (d.paymentStatus === "Devuelto" && order.paymentStatus !== "Pagado")) throw new AppError("Ese cambio de pago no está permitido.", 409);
      const note = text(d.note, "Referencia del pago o devolución", 250, true);
      return { ...order, paymentStatus: d.paymentStatus, paymentHistory: [...(order.paymentHistory || []), { status: d.paymentStatus, note, date: new Date().toISOString() }] } as Order;
    }
    if (d.previousStatus !== order.status) throw new AppError("El pedido fue actualizado por otra sesion. Revisa su estado actual.", 409);
    if (!statusOptions(order).includes(status)) throw new AppError("Ese cambio de estado no esta permitido.", 409);
    return { ...order, status };
  };
  if (conn.kind === "sqlite") {
    conn.database.exec("BEGIN IMMEDIATE");
    try {
      const row = conn.database.prepare("SELECT data FROM orders WHERE id=?").get(id);
      if (!row) throw new AppError("Pedido no encontrado.", 404);
      const order = apply(JSON.parse(String(row.data)) as Order);
      conn.database.prepare("UPDATE orders SET data=? WHERE id=?").run(JSON.stringify(order), id);
      conn.database.exec("COMMIT");
      return order;
    } catch (error) { conn.database.exec("ROLLBACK"); throw error; }
  }
  const connection = await conn.pool.getConnection();
  try {
    await connection.beginTransaction();
    const row = await mysqlGet<RowDataPacket>(connection, "SELECT data FROM orders WHERE id=? FOR UPDATE", [id]);
    if (!row) throw new AppError("Pedido no encontrado.", 404);
    const order = apply(JSON.parse(String(row.data)) as Order);
    await connection.execute("UPDATE orders SET data=? WHERE id=?", [JSON.stringify(order), id]);
    await connection.commit();
    return order;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
