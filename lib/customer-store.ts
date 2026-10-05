import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { db, deleteDocument, readDocument, writeDocument } from "./azumi-store";
import { AppError, object, point, text } from "./azumi-validation";
import { mailConfigured, sendMail } from "./azumi-mail";
import type { Customer } from "./azumi-types";
import type { Address } from "./azumi-client";

type Account = { email: string; password: string; salt: string; owner: string; profile: Partial<Customer>; addresses: Address[] };
export type CustomerAccount = Pick<Account, "email" | "profile" | "addresses">;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const accountKey = (email: string) => `customer_${hash(email)}`;
const derive = (password: string, salt: string) => new Promise<string>((resolve, reject) => scrypt(password, salt, 64, (error, result) => error ? reject(error) : resolve(result.toString("hex"))));
const publicAccount = (account: Account): CustomerAccount => ({ email: account.email, profile: account.profile, addresses: account.addresses });
function emailValue(value: unknown) {
  const email = text(value, "Correo", 150, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("Correo inválido.");
  return email;
}
function passwordValue(value: unknown) {
  const password = text(value, "Contraseña", 200, true);
  if (password.length < 12) throw new AppError("Usa una contraseña de al menos 12 caracteres.");
  return password;
}
export async function customerSession(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await readDocument<{ email: string; credential: string; expires: number }>(`customer_session_${hash(token)}`);
  if (!session || session.expires < Date.now()) return null;
  const account = await readDocument<Account>(accountKey(session.email));
  return account && hash(account.password) === session.credential ? account : null;
}
export async function customerInfo(token?: string) { const account = await customerSession(token); return account ? publicAccount(account) : null; }
export async function customerOwner(token: string | undefined, visitor: string) { return (await customerSession(token))?.owner || visitor; }
async function rateLimit(email: string) {
  const key = `customer_attempt_${hash(email)}`;
  const record = await readDocument<{ count: number; expires: number }>(key);
  const count = record && record.expires > Date.now() ? record.count + 1 : 1;
  if (count > 8) throw new AppError("Demasiados intentos. Intenta de nuevo en 15 minutos.", 429);
  await writeDocument(key, { count, expires: record && record.expires > Date.now() ? record.expires : Date.now() + 900000 });
}
export async function authenticateCustomer(input: unknown, visitor: string) {
  const data = object(input), email = emailValue(data.email), password = passwordValue(data.password);
  await rateLimit(email);
  let account = await readDocument<Account>(accountKey(email));
  if (data.action === "register") {
    if (account) throw new AppError("Ya existe una cuenta con ese correo.", 409);
    const salt = randomBytes(24).toString("hex");
    account = { email, salt, password: await derive(password, salt), owner: randomBytes(32).toString("hex"), profile: { name: text(data.name, "Nombre", 80, true), email }, addresses: [] };
    if (!(await writeDocument(accountKey(email), account, true))) throw new AppError("Ya existe una cuenta con ese correo.", 409);
  } else {
    const derived = await derive(password, account?.salt || "azumi-no-account");
    if (!account || !timingSafeEqual(Buffer.from(account.password, "hex"), Buffer.from(derived, "hex"))) throw new AppError("Correo o contraseña incorrectos.", 401);
  }
  const connection = await db();
  if (/^[a-f0-9]{64}$/.test(visitor)) {
    if (connection.kind === "sqlite") connection.database.prepare("UPDATE orders SET owner=? WHERE owner=?").run(hash(account.owner), hash(visitor));
    else await connection.pool.execute("UPDATE orders SET owner=? WHERE owner=?", [hash(account.owner), hash(visitor)]);
  }
  const token = randomBytes(32).toString("hex");
  await writeDocument(`customer_session_${hash(token)}`, { email, credential: hash(account.password), expires: Date.now() + 30 * 86400000 });
  await deleteDocument(`customer_attempt_${hash(email)}`);
  return { token, customer: publicAccount(account) };
}
export async function logoutCustomer(token?: string) { if (token) await deleteDocument(`customer_session_${hash(token)}`); }
export async function saveCustomer(input: unknown, token?: string) {
  const account = await customerSession(token);
  if (!account) throw new AppError("Inicia sesión para guardar tu perfil.", 401);
  const previous = structuredClone(account);
  const data = object(input), profile = object(data.profile);
  const phone = text(profile.phone, "Teléfono", 30).replace(/[^\d]/g, "");
  if (phone && (phone.length < 8 || phone.length > 15)) throw new AppError("Teléfono inválido.");
  account.profile = { name: text(profile.name, "Nombre", 80, true), lastName: text(profile.lastName, "Apellido", 80), phone, email: account.email };
  if (!Array.isArray(data.addresses) || data.addresses.length > 20) throw new AppError("Puedes guardar hasta 20 direcciones.");
  account.addresses = data.addresses.map(raw => { const address = object(raw); return { id: text(address.id, "Dirección", 80, true), label: text(address.label, "Nombre", 80, true), address: text(address.address, "Dirección", 250, true), point: point(address.point, false) }; });
  if (!(await writeDocument(accountKey(account.email), account, false, previous))) throw new AppError("Tu cuenta cambió en otra sesión. Recarga antes de guardar.", 409);
  return publicAccount(account);
}
export async function requestReset(input: unknown) {
  if (!mailConfigured() || !process.env.AZUMI_APP_URL) throw new AppError("La recuperación por correo todavía no está configurada. Contacta al restaurante.", 503);
  const email = emailValue(object(input).email);
  await rateLimit(`reset:${email}`);
  const account = await readDocument<Account>(accountKey(email));
  if (!account) return;
  const token = randomBytes(32).toString("hex");
  await writeDocument(`customer_reset_${hash(token)}`, { email, credential: hash(account.password), expires: Date.now() + 1800000 });
  const url = new URL("/cuenta", process.env.AZUMI_APP_URL); url.searchParams.set("reset", token);
  await sendMail(email, "Azumi · Recuperar contraseña", `Abre este enlace para cambiar tu contraseña. Caduca en 30 minutos:\n${url}\nSi no lo solicitaste, ignora este correo.`);
}
export async function resetPassword(input: unknown) {
  const data = object(input), token = text(data.token, "Enlace", 64, true), password = passwordValue(data.password);
  const key = `customer_reset_${hash(token)}`, reset = await readDocument<{ email: string; credential: string; expires: number }>(key);
  if (!reset || reset.expires < Date.now()) throw new AppError("El enlace no es válido o ha caducado.");
  const account = await readDocument<Account>(accountKey(reset.email));
  if (!account || hash(account.password) !== reset.credential) throw new AppError("El enlace ya fue utilizado.");
  const previous = structuredClone(account);
  account.salt = randomBytes(24).toString("hex"); account.password = await derive(password, account.salt);
  if (!(await writeDocument(accountKey(account.email), account, false, previous))) throw new AppError("El enlace ya fue utilizado o la cuenta cambió.", 409);
  await deleteDocument(key);
}
