import { json, route } from "@/lib/server/api";
import { adminLogin } from "@/lib/server/admin";

export const POST = route(async (req) => {
  const b = await json(req);
  await adminLogin(req, typeof b.password === "string" ? b.password.slice(0, 200) : "");
});
