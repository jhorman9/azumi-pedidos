import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/azumi-store";
import { AppError, object } from "@/lib/azumi-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

function response(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function visitor(request: NextRequest) {
  const value = request.cookies.get("azumi_visitor")?.value;
  return value && /^[a-f0-9]{64}$/.test(value) ? value : store.visitorToken();
}

function admin(request: NextRequest) {
  return store.isAdmin(request.cookies.get("azumi_admin")?.value);
}

async function requireAdmin(request: NextRequest) {
  if (!(await admin(request))) throw new AppError("Inicia sesion para administrar Azumi.", 401);
}

async function body(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) throw new AppError("Origen no permitido.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError("Envia datos JSON.", 415);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 512000) throw new AppError("Solicitud demasiado grande.", 413);
  try { return object(JSON.parse(raw)); }
  catch (error) { if (error instanceof AppError) throw error; throw new AppError("JSON invalido."); }
}

function failure(error: unknown) {
  if (error instanceof AppError) return response({ error: error.message }, error.status);
  console.error("Azumi API:", error);
  return response({ error: "No pudimos guardar los datos. Intenta nuevamente." }, 500);
}

export async function GET(request: NextRequest) {
  try {
    const owner = visitor(request);
    const result = response(await store.snapshot(owner, request.cookies.get("azumi_admin")?.value));
    result.cookies.set("azumi_visitor", owner, { ...cookieOptions, maxAge: 365 * 24 * 60 * 60 });
    return result;
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const d = await body(request);
    if (d.action === "login") {
      const token = await store.login(d), result = response({ ok: true });
      result.cookies.set("azumi_admin", token, { ...cookieOptions, maxAge: 8 * 60 * 60 });
      return result;
    }
    if (d.action === "logout") {
      await store.logout(request.cookies.get("azumi_admin")?.value);
      const result = response({ ok: true });
      result.cookies.set("azumi_admin", "", { ...cookieOptions, maxAge: 0 });
      return result;
    }
    if (d.action === "order") {
      const owner = visitor(request), order = await store.placeOrder(d, owner), result = response({ order }, 201);
      result.cookies.set("azumi_visitor", owner, { ...cookieOptions, maxAge: 365 * 24 * 60 * 60 });
      return result;
    }
    throw new AppError("Accion invalida.");
  } catch (error) { return failure(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const d = await body(request);
    await requireAdmin(request);
    if (d.action === "catalog") return response(await store.patchCatalog(d));
    if (d.action === "status") return response({ order: await store.updateStatus(d) });
    throw new AppError("Accion invalida.");
  } catch (error) { return failure(error); }
}
