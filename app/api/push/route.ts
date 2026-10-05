import { NextRequest, NextResponse } from "next/server";
import { pushActor, pushKeys, subscribePush, unsubscribePush } from "@/lib/push-store";
import { AppError, object } from "@/lib/azumi-validation";
import { sameOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
function failure(error: unknown) { return NextResponse.json({ error: error instanceof AppError ? error.message : "No pudimos configurar las notificaciones." }, { status: error instanceof AppError ? error.status : 500 }); }
export async function GET(request: NextRequest) {
  try { await pushActor(request); return NextResponse.json({ publicKey: (await pushKeys()).publicKey }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) throw new AppError("Origen no permitido.", 403);
    const actor = await pushActor(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError("Envía datos JSON.", 415);
    const raw = await request.text(); if (Buffer.byteLength(raw) > 6000) throw new AppError("Solicitud demasiado grande.", 413);
    const data = object(JSON.parse(raw));
    if (data.action === "subscribe") await subscribePush(actor, data.subscription);
    else if (data.action === "unsubscribe") await unsubscribePush(actor, data.endpoint);
    else throw new AppError("Acción inválida.");
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
