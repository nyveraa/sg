import { route } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { listFriends } from "@/lib/server/service";

export const GET = route(async () => ({ friends: listFriends((await requireUser()).id) }));
