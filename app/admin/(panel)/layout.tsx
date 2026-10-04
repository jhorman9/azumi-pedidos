import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/azumi-store";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = (await cookies()).get("azumi_admin")?.value;
  if (!(await isAdmin(session))) redirect("/admin/login");
  return <AdminShell>{children}</AdminShell>;
}
