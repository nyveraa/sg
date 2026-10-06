"use client";

import dynamic from "next/dynamic";

/** Three.js is client-only and heavy: load it lazily and never block first paint. */
export const HeroScene = dynamic(() => import("./three/Scenes").then((m) => m.HeroScene), { ssr: false });
export const VoiceOrb = dynamic(() => import("./three/Scenes").then((m) => m.VoiceOrb), { ssr: false });
