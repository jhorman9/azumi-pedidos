import { readDocument } from "@/lib/azumi-store";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{48}$/.test(id)) return new Response(null, { status: 404 });
  const image = await readDocument<{ content: string }>(`media_${id}`);
  if (!image) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(Buffer.from(image.content, "base64")), { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
