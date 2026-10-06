"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/client/api";
import { Spinner } from "./Loader";

export type AuthMode = "signup" | "login";

/** Sign up / log in as an inline form: small-caps labels, underlined fields, one pill button. */
export function AuthCard({ mode, onMode, onDone }: { mode: AuthMode; onMode: (m: AuthMode) => void; onDone: () => Promise<void> | void }) {
  const [form, setForm] = useState({ username: "", displayName: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api("POST", mode === "signup" ? "/api/auth/signup" : "/api/auth/login", form);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setShake((n) => n + 1);
      setBusy(false);
    }
  }

  return (
    <motion.form onSubmit={submit} key={shake} animate={shake ? { x: [0, -9, 8, -5, 2, 0] } : undefined} transition={{ duration: 0.4 }} className="w-full max-w-[420px]">
      <div className="space-y-6">
        <label className="block">
          <span className="label">Username</span>
          <input className="field" placeholder="yourname" autoComplete="username" required minLength={3} maxLength={20} value={form.username} onChange={set("username")} />
        </label>
        {mode === "signup" && (
          <motion.label initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="block overflow-hidden">
            <span className="label">Display name <span className="normal-case tracking-normal text-dim">— optional</span></span>
            <input className="field" placeholder="How you appear to friends" maxLength={40} value={form.displayName} onChange={set("displayName")} />
          </motion.label>
        )}
        <label className="block">
          <span className="label">Password</span>
          <input className="field" type="password" placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} required minLength={mode === "signup" ? 8 : 1}
            autoComplete={mode === "signup" ? "new-password" : "current-password"} value={form.password} onChange={set("password")} />
        </label>
      </div>

      <div aria-live="polite" className="min-h-9 pt-3 text-[13px] text-white/75 italic">{error}</div>

      <button disabled={busy} className="btn w-full justify-between">
        <span>{mode === "signup" ? "Enter onyx" : "Continue"}</span>
        {busy ? <Spinner /> : <ArrowRight size={16} />}
      </button>
      <button type="button" onClick={() => { onMode(mode === "signup" ? "login" : "signup"); setError(""); }}
        className="mt-5 text-[13px] text-mute transition hover:text-white">
        {mode === "signup" ? <>Already have an account? <span className="italic underline underline-offset-4">Sign in</span></> : <>New here? <span className="italic underline underline-offset-4">Create an account</span></>}
      </button>
    </motion.form>
  );
}
