"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { OnyxProvider, useOnyx } from "@/lib/client/store";
import { ChatPane } from "./ChatPane";
import { FeedView } from "./FeedView";
import { FriendsView } from "./FriendsView";
import { FxLayer } from "./Fx";
import { Loader3D } from "./Loader";
import { Celebration, FriendModal, GroupModal, Lightbox, ProfileModal, Toasts } from "./Modals";
import { Rail } from "./Rail";
import { Sidebar, type ModalKind } from "./Sidebar";

export function AppShell() {
  return (
    <OnyxProvider>
      <Shell />
    </OnyxProvider>
  );
}

function Shell() {
  const { ready, s, active, celebration, view } = useOnyx();
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const closeModal = () => setModal(null);
  // Someone just used your invite (or you used theirs): the celebration takes over from any open popup.
  useEffect(() => { if (celebration) setModal(null); }, [celebration]);

  const inChat = view === "chats" && !!active; // on phones an open chat takes the full screen

  return (
    <div className="stage fixed inset-0 overflow-hidden">
      <div className="aurora"><i /><i /><i /></div>
      {s.me && (
        <motion.div className="relative flex h-full flex-col-reverse md:flex-row" initial={false} animate={ready ? { opacity: 1 } : { opacity: 0 }} transition={{ duration: 0.8 }}>
          <Rail onModal={setModal} className={inChat ? "hidden md:flex" : "flex"} />
          <div className="relative min-h-0 min-w-0 flex-1 [perspective:1600px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={view} className="flex h-full" style={{ transformOrigin: "50% 0%" }}
                initial={{ opacity: 0, y: 26, rotateX: 5, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, rotateX: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -14, filter: "blur(4px)" }} transition={{ duration: 0.38, ease: [0.2, 0.8, 0.2, 1] }}>
                {view === "chats" && (
                  <>
                    <Sidebar onModal={setModal} className={active ? "hidden md:flex" : "flex"} />
                    <ChatPane onImage={setImage} className={active ? "flex" : "hidden md:flex"} />
                  </>
                )}
                {view === "feed" && <FeedView onImage={setImage} />}
                {view === "friends" && <FriendsView onModal={setModal} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {s.me && (
        <>
          <FriendModal open={modal === "code" || modal === "invite"} tab={modal === "invite" ? "invite" : "code"} setTab={(t) => setModal(t)} onClose={closeModal} />
          <GroupModal open={modal === "group"} onClose={closeModal} />
          <ProfileModal open={modal === "profile"} onClose={closeModal} />
        </>
      )}
      <Lightbox src={image} onClose={() => setImage(null)} />
      <Celebration />
      <FxLayer />
      <Toasts />

      <AnimatePresence>{!ready && <Loader3D key="loader" />}</AnimatePresence>
    </div>
  );
}
