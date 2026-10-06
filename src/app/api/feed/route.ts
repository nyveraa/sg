import { route } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { listFeed } from "@/lib/server/service";

export const GET = route(async () => listFeed((await requireUser()).id));
