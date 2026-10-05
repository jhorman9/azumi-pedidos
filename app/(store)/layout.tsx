import { StoreShell } from "@/components/store/store-shell";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { customerSession } from "@/lib/customer-store";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  if (!(await customerSession(jar.get("azumi_customer")?.value))) redirect("/cuenta");
  return <StoreShell>{children}</StoreShell>;
}
