import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server/auth";
import { Landing } from "@/components/Landing";

export default async function Home() {
  if (await currentUser()) redirect("/app");
  return <Landing />;
}
