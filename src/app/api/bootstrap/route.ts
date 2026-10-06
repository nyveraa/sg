import { route } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { bootstrap } from "@/lib/server/service";

export const GET = route(async () => bootstrap((await requireUser()).id));
