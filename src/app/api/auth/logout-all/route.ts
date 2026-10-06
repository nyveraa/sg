import { route } from "@/lib/server/api";
import { endSession, requireUser } from "@/lib/server/auth";
import { logoutEverywhere } from "@/lib/server/service";

export const POST = route(async () => {
  logoutEverywhere((await requireUser()).id);
  await endSession();
});
