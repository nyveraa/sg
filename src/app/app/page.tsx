import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server/auth";
import { AppShell } from "@/components/AppShell";

export default async function AppPage() {
  if (!(await currentUser())) redirect("/");
  return <AppShell />;
}
