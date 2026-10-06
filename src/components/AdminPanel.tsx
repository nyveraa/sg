"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { ago } from "@/lib/client/format";
import { Wordmark } from "./Logo";

export type AdminUser = {
  id: string; username: string; displayName: string; bio: string; createdAt: number; lastSeen: number | null;
  online: boolean; friends: number; messages: number; sessions: number;
};
type Detail = { friends: { username: string; displayName: string; since: number }[]; groups: string[]; posts: number; invitesMade: number };
type Edit = { username: string; displayName: string; bio: string; password: string };

export function AdminPanel({ initial }: { initial: AdminUser[] | null }) {
  const [users, setUsers] = useState<AdminUser[] | null>(initial);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<AdminUser | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [edit, setEdit] = useState<Edit>({ username: "", displayName: "", bio: "", password: "" });
  const [creating, setCreating] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok = "") => {
    setMsg("");
    try { await fn(); if (ok) setMsg(ok); } catch (e) { setMsg(e instanceof Error ? e.message : "Something went wrong"); }
  };
  const apply = (r: { users: AdminUser[] }) => setUsers(r.users);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (users ?? []).filter((u) => !t || u.username.includes(t) || u.displayName.toLowerCase().includes(t));
  }, [users, q]);

  const open = (u: AdminUser) => {
    setSel(u); setDetail(null); setCreating(false);
    setEdit({ username: u.username, displayName: u.displayName, bio: u.bio, password: "" });
    void run(async () => setDetail(await api<Detail>("GET", `/api/admin/users/${u.id}`)));
  };

  if (!users) {
    return (
      <main className="stage fixed inset-0 grid place-items-center overflow-auto p-6">
        <form className="w-full max-w-[380px]" onSubmit={(e) => {
          e.preventDefault();
          void run(async () => { await api("POST", "/api/admin/login", { password: pw }); setPw(""); apply(await api("GET", "/api/admin/users")); });
        }}>
          <Wordmark />
          <p className="label mt-6">Admin</p>
          <input className="field mt-4" type="password" autoFocus autoComplete="current-password" placeholder="Admin password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <div aria-live="polite" className="min-h-9 pt-3 text-[13px] italic text-white/75">{msg}</div>
          <button className="btn w-full" disabled={!pw}>Enter</button>
        </form>
      </main>
    );
  }

  const online = users.filter((u) => u.online).length;
  const field = (k: keyof Edit, label: string, type = "text", ph = "") => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="field" type={type} placeholder={ph} autoComplete="off" value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
    </label>
  );

  return (
    <main className="stage fixed inset-0 overflow-auto">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <header className="flex items-center justify-between">
          <div className="flex items-baseline gap-4"><Wordmark /><span className="label">Admin</span></div>
          <button className="btn btn-ghost btn-sm" onClick={() => void run(async () => { await api("POST", "/api/admin/logout"); setUsers(null); })}>Sign out</button>
        </header>

        <div className="mt-8 grid grid-cols-3 gap-3">
          {[["Users", users.length], ["Online now", online], ["Messages", users.reduce((n, u) => n + u.messages, 0)]].map(([l, v]) => (
            <div key={l} className="box p-5"><p className="label">{l}</p><p className="display mt-2 text-4xl">{v}</p></div>
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          <input className="field" placeholder="Search username or name" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-sm shrink-0" onClick={() => { setSel(null); setDetail(null); setEdit({ username: "", displayName: "", bio: "", password: "" }); setCreating(true); }}>Add user</button>
        </div>
        <div aria-live="polite" className="min-h-8 pt-2 text-[13px] italic text-white/75">{msg}</div>

        <div className="box overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[14px]">
            <thead><tr className="label">{["User", "Joined", "Last active", "Friends", "Msgs", "Devices", ""].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id} className="hair cursor-pointer border-t transition hover:bg-white/[.04]" onClick={() => open(u)}>
                  <td className="px-4 py-3"><span className="text-white">{u.displayName}</span> <span className="text-mute">@{u.username}</span></td>
                  <td suppressHydrationWarning className="px-4 py-3 text-mute">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td suppressHydrationWarning className="px-4 py-3 text-mute">{u.online ? "Online now" : u.lastSeen ? ago(u.lastSeen) : "—"}</td>
                  <td className="px-4 py-3">{u.friends}</td><td className="px-4 py-3">{u.messages}</td><td className="px-4 py-3">{u.sessions}</td>
                  <td className="px-4 py-3 text-right text-mute">Manage</td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-mute">No users</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {(sel || creating) && (
        <div className="fixed inset-0 z-10 grid place-items-center overflow-auto bg-black/70 p-4" onClick={() => { setSel(null); setCreating(false); }}>
          <div className="card w-full max-w-[460px] p-6" onClick={(e) => e.stopPropagation()}>
            <p className="label">{sel ? `@${sel.username}` : "New user"}</p>
            <div className="mt-4 space-y-5">
              {field("username", "Username")}
              {field("displayName", "Display name")}
              {sel && field("bio", "Bio")}
              {field("password", sel ? "New password" : "Password", "text", sel ? "Leave empty to keep current" : "At least 8 characters")}
            </div>
            {sel && detail && (
              <p className="mt-5 text-[13px] leading-relaxed text-mute">
                {detail.friends.length} friends{detail.friends.length ? ` (${detail.friends.slice(0, 6).map((f) => "@" + f.username).join(", ")}${detail.friends.length > 6 ? "…" : ""})` : ""} ·{" "}
                {detail.groups.length} groups · {detail.posts} posts · {detail.invitesMade} invites made
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              <button className="btn btn-sm" onClick={() => void run(async () => {
                if (sel) apply(await api("PATCH", `/api/admin/users/${sel.id}`, { username: edit.username, displayName: edit.displayName, bio: edit.bio, password: edit.password || undefined }));
                else apply(await api("POST", "/api/admin/users", edit));
                setSel(null); setCreating(false);
              }, sel ? "Saved" : "User created")}>{sel ? "Save" : "Create"}</button>
              {sel && <>
                <button className="btn btn-ghost btn-sm" onClick={() => void run(async () => { await api("POST", `/api/admin/users/${sel.id}/impersonate`); window.open("/app", "_blank"); })}>Sign in as</button>
                <button className="btn btn-ghost btn-sm" onClick={() => void run(async () => { apply(await api("POST", `/api/admin/users/${sel.id}/signout`)); }, "Signed out of all devices")}>Sign out devices</button>
                <button className="btn btn-danger btn-sm" onClick={() => {
                  if (confirm(`Delete @${sel.username} and all their messages? This cannot be undone.`))
                    void run(async () => { apply(await api("DELETE", `/api/admin/users/${sel.id}`)); setSel(null); }, "User deleted");
                }}>Delete</button>
              </>}
            </div>
            <div aria-live="polite" className="min-h-6 pt-3 text-[13px] italic text-white/75">{msg}</div>
          </div>
        </div>
      )}
    </main>
  );
}
