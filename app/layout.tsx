import type { Metadata } from "next";
import { cookies } from "next/headers";
import { snapshot } from "@/lib/azumi-store";
import "./globals.css";
import { AzumiProvider } from "@/components/azumi-provider";
import { customerOwner } from "@/lib/customer-store";

export const metadata: Metadata = {
  title: { default: "Azumi | Sabores que conectan", template: "%s | Azumi" },
  description: "Haz tu pedido en Azumi. Sabores asiáticos y latinoamericanos en San Francisco, Panamá.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const jar = await cookies();
  const owner = await customerOwner(jar.get("azumi_customer")?.value, jar.get("azumi_visitor")?.value || "");
  const initialSnapshot = await snapshot(owner, jar.get("azumi_admin")?.value);
  return (
    <html lang="es">
      <body><AzumiProvider initialSnapshot={initialSnapshot}>{children}</AzumiProvider></body>
    </html>
  );
}
