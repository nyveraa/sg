import { currentUser } from "@/lib/server/auth";
import { inviteInfo, normalizeCode } from "@/lib/server/service";
import { Landing } from "@/components/Landing";
import { JoinRedeem } from "@/components/JoinRedeem";

/** Shareable invite link: /join/ABCD-EFGH */
export default async function Join({ params }: PageProps<"/join/[code]">) {
  const code = normalizeCode((await params).code);
  const info = inviteInfo(code);
  if (await currentUser()) return <JoinRedeem code={code} inviter={info.inviter?.displayName} />;
  return <Landing invite={{ code, valid: info.valid, inviter: info.inviter }} />;
}
