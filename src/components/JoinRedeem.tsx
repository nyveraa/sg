"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { Loader3D } from "./Loader";

/** Signed-in user opened an invite link: redeem it, then drop them into the app. */
export function JoinRedeem({ code, inviter }: { code: string; inviter?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode double-invoke would burn the single-use code twice
    started.current = true;
    api<{ conversation: { id: string } }>("POST", "/api/invites/redeem", { code })
      .then(({ conversation }) => router.replace(`/app?welcome=${conversation.id}`))
      .catch((e: Error) => setError(e.message));
  }, [code, router]);

  if (!error) return <Loader3D label={inviter ? `Connecting you with ${inviter}` : "Redeeming invite"} />;
  return (
    <main className="grid h-dvh place-items-center bg-black p-6">
      <div className="glass max-w-sm rounded-3xl p-8 text-center">
        <p className="text-lg font-medium">{error}</p>
        <Link href="/app" className="bg-accent-grad mt-6 inline-block rounded-xl px-5 py-2.5 font-semibold text-black">Go to chats</Link>
      </div>
    </main>
  );
}
