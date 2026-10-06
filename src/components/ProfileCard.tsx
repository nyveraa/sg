"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Pencil } from "lucide-react";
import { presenceLabel } from "@/lib/client/format";
import { useOnyx } from "@/lib/client/store";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { Tilt } from "./Tilt";

/** A person's card, opened from anywhere via showProfile(userId). */
export function ProfileCard() {
  const { profileUserId, showProfile, s, setActive, setNickname, toast } = useOnyx();
  const me = s.me!;
  const u = profileUserId ? s.users[profileUserId] : undefined;
  const dm = u && Object.values(s.convs).find((c) => c.kind === "dm" && c.memberIds.includes(u.id));
  const mine = u?.id === me.id;
  const [nick, setNick] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setNick(u?.realName ? u.displayName : ""); }, [u?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveNick(e: React.FormEvent) {
    e.preventDefault();
    if (!u) return;
    setSaving(true);
    try { await setNickname(u.id, nick); toast(nick ? "Nickname saved" : "Nickname removed", "ok"); } catch (err) { toast(err instanceof Error ? err.message : "Couldn't save", "error"); }
    setSaving(false);
  }

  return (
    <Modal open={!!u} onClose={() => showProfile(null)} title={u?.displayName ?? ""} eyebrow={u ? (mine ? "You" : presenceLabel(u)) : ""} width={440}>
      {u && (
        <>
          <Tilt className="card mb-6 flex flex-col items-center p-8 text-center" max={6}>
            <Avatar user={u} size={112} online={mine ? me.prefs.showOnline : u.online} />
            <div className="mt-5 text-[13px] text-mute">@{u.username}{u.pronouns ? ` · ${u.pronouns}` : ""}{u.realName ? ` · ${u.realName}` : ""}</div>
            {u.status && <div className="mt-4 rounded-full border border-white/14 px-4 py-1.5 text-[13px]">{u.status}</div>}
            {u.bio && <p className="mt-4 text-[15px] leading-relaxed text-white/75 italic">{u.bio}</p>}
          </Tilt>
          {!mine && dm && <button onClick={() => { setActive(dm.id); showProfile(null); }} className="btn mb-6 w-full justify-between"><span>Message</span><MessageCircle size={15} /></button>}
          {!mine && (
            <form onSubmit={saveNick}>
              <label className="block"><span className="label">Private nickname <span className="normal-case tracking-normal text-dim">— only you see it</span></span>
                <div className="flex items-end gap-3"><input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={40} placeholder={u.realName ?? u.displayName} className="field" />
                  <button disabled={saving} className="btn btn-sm shrink-0"><Pencil size={13} /> Save</button></div></label>
            </form>
          )}
        </>
      )}
    </Modal>
  );
}
