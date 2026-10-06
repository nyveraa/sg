import { route } from "@/lib/server/api";
import { adminLogout } from "@/lib/server/admin";

export const POST = route(async () => {
  await adminLogout();
});
