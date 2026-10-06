// Admin + session-cookie checks. Server must run with ONYX_ADMIN_PASSWORD=admin-pass-123:
//   ONYX_ADMIN_PASSWORD=admin-pass-123 npm run dev   →   node tests/smoke4.mjs [baseUrl]
const BASE = process.argv[2] ?? "http://localhost:3100";
const ADMIN_PW = process.env.ONYX_ADMIN_PASSWORD ?? "admin-pass-123";
let failed = 0;
const ok = (c, n, x = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  " + x}`); if (!c) failed++; };

class Client {
  cookies = {};
  async call(method, path, body) {
    const res = await fetch(BASE + path, {
      method, redirect: "manual",
      headers: { "content-type": "application/json", cookie: Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join("; ") },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv, ...attrs] = c.split(";"); const [k, v] = kv.split("=");
      this.cookies[k] = v; this.lastAttrs = attrs.join(";").toLowerCase();
    }
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }
}

const tag = Math.random().toString(36).slice(2, 7);
const user = new Client(), admin = new Client(), anon = new Client();

let r = await user.call("POST", "/api/auth/signup", { username: `u_${tag}`, displayName: "Una", password: "supersecret1" });
ok(r.status === 200, "signup");
const maxAge = Number(/max-age=(\d+)/.exec(user.lastAttrs)?.[1] ?? 0);
ok(maxAge >= 60 * 60 * 24 * 90, "session cookie persists for months", String(maxAge));
ok(!user.lastAttrs.includes("secure"), "no Secure flag on plain http (cookie kept)");
ok((await user.call("GET", "/api/bootstrap")).status === 200, "stays signed in on later requests");

// admin gate
ok((await anon.call("GET", "/api/admin/users")).status === 401, "admin list needs login");
ok((await user.call("GET", "/api/admin/users")).status === 401, "a normal user is not an admin");
ok((await admin.call("POST", "/api/admin/login", { password: "nope" })).status === 401, "wrong admin password rejected");
ok((await admin.call("POST", "/api/admin/login", { password: ADMIN_PW })).status === 200, "admin login");
admin.cookies.onyx_admin = admin.cookies.onyx_admin.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
ok((await admin.call("GET", "/api/admin/users")).status === 401, "tampered admin cookie rejected");
await admin.call("POST", "/api/admin/login", { password: ADMIN_PW });

r = await admin.call("GET", "/api/admin/users");
const me = r.body.users?.find((u) => u.username === `u_${tag}`);
ok(!!me && me.sessions === 1, "admin sees the user", JSON.stringify(r.body).slice(0, 200));

// create, rename, reset password
r = await admin.call("POST", "/api/admin/users", { username: `made_${tag}`, displayName: "Made", password: "adminmade1" });
ok(r.status === 200 && r.body.users.some((u) => u.username === `made_${tag}`), "admin creates user");
r = await admin.call("POST", "/api/admin/users", { username: `made_${tag}`, displayName: "x", password: "adminmade1" });
ok(r.status === 409, "duplicate username rejected");
r = await admin.call("PATCH", `/api/admin/users/${me.id}`, { username: `renamed_${tag}`, displayName: "Una R", password: "brandnewpass1" });
ok(r.status === 200 && r.body.users.some((u) => u.username === `renamed_${tag}` && u.displayName === "Una R"), "admin renames user");
ok((await user.call("GET", "/api/bootstrap")).status === 401, "password reset signs the user out everywhere");
ok((await new Client().call("POST", "/api/auth/login", { username: `u_${tag}`, password: "supersecret1" })).status === 401, "old username/password dead");
const again = new Client();
ok((await again.call("POST", "/api/auth/login", { username: `renamed_${tag}`, password: "brandnewpass1" })).status === 200, "login with new username + password");
ok((await admin.call("PATCH", `/api/admin/users/${me.id}`, { username: "a!" })).status === 400, "bad username rejected");
ok((await admin.call("PATCH", `/api/admin/users/${me.id}`, { password: "short" })).status === 400, "short password rejected");

// detail, sign out, impersonate, delete
r = await admin.call("GET", `/api/admin/users/${me.id}`);
ok(r.status === 200 && Array.isArray(r.body.friends), "user detail");
await admin.call("POST", `/api/admin/users/${me.id}/signout`);
ok((await again.call("GET", "/api/bootstrap")).status === 401, "admin can sign a user out");
const imp = new Client();
ok((await imp.call("POST", `/api/admin/users/${me.id}/impersonate`)).status === 401, "impersonation needs admin cookie");
imp.cookies.onyx_admin = admin.cookies.onyx_admin;
ok((await imp.call("POST", `/api/admin/users/${me.id}/impersonate`)).status === 200, "admin signs in as user");
r = await imp.call("GET", "/api/bootstrap");
ok(r.status === 200 && r.body.me.username === `renamed_${tag}`, "impersonated session works");
r = await admin.call("DELETE", `/api/admin/users/${me.id}`);
ok(r.status === 200 && !r.body.users.some((u) => u.id === me.id), "admin deletes user");
ok((await imp.call("GET", "/api/bootstrap")).status === 401, "deleted user's sessions are dead");
await admin.call("POST", "/api/admin/logout");
ok((await admin.call("GET", "/api/admin/users")).status === 401, "admin logout clears access");

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
