import { redirect } from "next/navigation";
import { isAdmin } from "@/auth";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // 真正的鉴权在这里（proxy 只是乐观跳转）
  if (!(await isAdmin())) {
    redirect("/auth/signin?redirectTo=/admin");
  }

  return <AdminShell>{children}</AdminShell>;
}
