import { isAdmin } from "@/lib/server/admin";
import { adminListUsers } from "@/lib/server/service";
import { AdminPanel } from "@/components/AdminPanel";

export const metadata = { title: "Whisper · Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const authed = await isAdmin();
  return <AdminPanel initial={authed ? adminListUsers() : null} />;
}
