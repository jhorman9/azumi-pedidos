import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { isAdmin, writeDocument } from "@/lib/azumi-store";
import { sameOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (!(await isAdmin(request.cookies.get("azumi_admin")?.value))) return NextResponse.json({ error: "Inicia sesión para subir imágenes." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  if (Number(request.headers.get("content-length")) > 4200000) return NextResponse.json({ error: "La imagen debe pesar menos de 4 MB." }, { status: 413 });
  try {
    const form = await request.formData(), file = form.get("image");
    if (!(file instanceof File) || file.size > 4000000 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return NextResponse.json({ error: "Elige una imagen JPG, PNG o WebP de hasta 4 MB." }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const source = sharp(buffer, { limitInputPixels: 20000000 });
    const metadata = await source.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format || "")) throw new Error("Invalid image");
    const image = await source.rotate().resize(1400, 1400, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    const id = randomBytes(24).toString("hex");
    await writeDocument(`media_${id}`, { content: image.toString("base64") });
    return NextResponse.json({ image: `/api/media/${id}` }, { status: 201 });
  } catch { return NextResponse.json({ error: "No pudimos procesar la imagen. Prueba con otra foto." }, { status: 400 }); }
}
