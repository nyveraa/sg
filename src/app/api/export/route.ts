import { route } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { exportData } from "@/lib/server/service";

/** Download everything tied to your account as JSON. */
export const GET = route(async () => {
  const me = await requireUser();
  return new Response(JSON.stringify(exportData(me.id), null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="nocturne-${me.username}.json"` },
  });
});
