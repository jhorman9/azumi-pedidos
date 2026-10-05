import { NextRequest, NextResponse } from "next/server";
import { authenticateCustomer, customerInfo, logoutCustomer, requestReset, resetPassword, saveCustomer } from "@/lib/customer-store";
import { AppError, object } from "@/lib/azumi-validation";
import { sameOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
export async function GET(request: NextRequest) {
  return NextResponse.json({ customer: await customerInfo(request.cookies.get("azumi_customer")?.value) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) throw new AppError("Origen no permitido.", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError("Envía datos JSON.", 415);
    const raw = await request.text(); if (Buffer.byteLength(raw) > 20000) throw new AppError("Solicitud demasiado grande.", 413);
    const data = object(JSON.parse(raw)), token = request.cookies.get("azumi_customer")?.value;
    if (data.action === "login" || data.action === "register") {
      const result = await authenticateCustomer(data, request.cookies.get("azumi_visitor")?.value || ""), response = NextResponse.json({ customer: result.customer });
      response.cookies.set("azumi_customer", result.token, { ...options, maxAge: 30 * 86400 });
      return response;
    }
    if (data.action === "logout") { await logoutCustomer(token); const response = NextResponse.json({ customer: null }); response.cookies.set("azumi_customer", "", { ...options, maxAge: 0 }); return response; }
    if (data.action === "profile") return NextResponse.json({ customer: await saveCustomer(data, token) });
    if (data.action === "forgot") { await requestReset(data); return NextResponse.json({ message: "Si existe una cuenta con ese correo, recibirás un enlace para recuperar tu contraseña." }); }
    if (data.action === "reset") { await resetPassword(data); return NextResponse.json({ message: "Contraseña actualizada. Ya puedes iniciar sesión." }); }
    throw new AppError("Acción inválida.");
  } catch (error) { return NextResponse.json({ error: error instanceof AppError ? error.message : "No se pudo completar la operación." }, { status: error instanceof AppError ? error.status : 500 }); }
}
