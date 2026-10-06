"use client";

import { useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Edges, Environment, Float, Lightformer, MeshDistortMaterial, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import type { MotionValue } from "motion/react";

/* ── scroll choreography ─────────────────────────────────────────────────────
   One timeline, sampled by scroll progress (0..1): where the stone is, how big,
   how far it has spun, and how far its shards have burst outward. */
type Key = { p: number; x: number; y: number; z: number; s: number; ry: number; burst: number };
const KEYS: Key[] = [
  { p: 0, x: 2.1, y: 0.1, z: 0, s: 1, ry: 0, burst: 0 },
  { p: 0.28, x: -2.7, y: -0.1, z: 0.5, s: 1.15, ry: 2.6, burst: 0.4 },
  { p: 0.55, x: 0, y: 2.1, z: -6, s: 0.8, ry: 5, burst: 1 },
  { p: 0.78, x: 0, y: 1.2, z: -3, s: 0.9, ry: 6.4, burst: 0.55 },
  { p: 1, x: 2.5, y: -0.3, z: 0, s: 1.0, ry: 8, burst: 0 },
];
const FIXED: Key = { p: 0, x: 0, y: 0, z: 0, s: 1, ry: 0, burst: 0 };
const ease = (t: number) => t * t * (3 - 2 * t);

function sample(p: number): Key {
  const c = Math.min(1, Math.max(0, p));
  let i = 0;
  while (i < KEYS.length - 2 && c > KEYS[i + 1].p) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = ease(Math.min(1, Math.max(0, (c - a.p) / (b.p - a.p))));
  const l = (k: keyof Key) => a[k] + (b[k] - a[k]) * t;
  return { p: c, x: l("x"), y: l("y"), z: l("z"), s: l("s"), ry: l("ry"), burst: l("burst") };
}

/** Eases its children toward the pointer. */
function Rig({ children, strength = 1 }: { children: ReactNode; strength?: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame((st, dt) => {
    if (!g.current) return;
    g.current.rotation.y = THREE.MathUtils.damp(g.current.rotation.y, st.pointer.x * 0.35 * strength, 2.5, dt);
    g.current.rotation.x = THREE.MathUtils.damp(g.current.rotation.x, -st.pointer.y * 0.2 * strength, 2.5, dt);
  });
  return <group ref={g}>{children}</group>;
}

const SHARDS = Array.from({ length: 16 }, (_, i) => {
  const a = i * 2.399963; // golden angle spreads them evenly
  const y = 1 - (i / 15) * 2;
  const r = Math.sqrt(1 - y * y);
  return { dir: new THREE.Vector3(Math.cos(a) * r, y * 0.8, Math.sin(a) * r), size: 0.1 + (i % 4) * 0.045, spin: 0.4 + (i % 5) * 0.25 };
});

/** The stone, its rings and its shards, driven by scroll progress. */
function Journey({ progress }: { progress?: MotionValue<number> }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const rings = useRef<THREE.Group>(null);
  const shardRefs = useRef<(THREE.Mesh | null)[]>([]);
  const burst = useRef(0);
  const { viewport } = useThree();

  const chrome = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#4a4a50", metalness: 1, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, flatShading: true, envMapIntensity: 1.1 }), []);

  useFrame((st, dt) => {
    const k = progress ? sample(progress.get()) : FIXED;
    const t = st.clock.elapsedTime;
    const xs = Math.min(1, viewport.width / 11); // keep the stone on-screen on narrow viewports
    const g = root.current!;
    g.position.x = THREE.MathUtils.damp(g.position.x, k.x * xs, 3.2, dt);
    g.position.y = THREE.MathUtils.damp(g.position.y, k.y, 3.2, dt);
    g.position.z = THREE.MathUtils.damp(g.position.z, k.z, 3.2, dt);
    g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, k.s, 3.2, dt));
    if (body.current) body.current.rotation.y = THREE.MathUtils.damp(body.current.rotation.y, k.ry + t * 0.16, 3.2, dt);
    if (core.current) { core.current.rotation.y -= dt * 0.55; core.current.rotation.z += dt * 0.12; }
    if (rings.current) { rings.current.rotation.z += dt * (0.08 + k.burst * 0.5); rings.current.scale.setScalar(1 + k.burst * 0.35); }
    burst.current = THREE.MathUtils.damp(burst.current, k.burst, 3, dt);
    SHARDS.forEach((s, i) => {
      const m = shardRefs.current[i];
      if (!m) return;
      const radius = 2.9 + burst.current * 4.2 + Math.sin(t * 0.6 + i) * 0.12;
      m.position.copy(s.dir).multiplyScalar(radius);
      m.rotation.x += dt * s.spin; m.rotation.y += dt * s.spin * 0.7;
      m.scale.setScalar(0.6 + burst.current * 0.9);
    });
  });

  return (
    <group ref={root}>
      <Float speed={1.1} rotationIntensity={0.12} floatIntensity={0.5}>
        <group ref={body} scale={[1, 1.45, 1]}>
          <mesh material={chrome}>
            <octahedronGeometry args={[1.7, 0]} />
            <Edges threshold={1} color="#ffffff" />
          </mesh>
          <mesh ref={core} scale={0.5}>
            <octahedronGeometry args={[1.7, 0]} />
            <meshBasicMaterial wireframe color="#ffffff" transparent opacity={0.5} />
          </mesh>
        </group>
        <group ref={rings} rotation={[Math.PI / 2.15, 0.35, 0]}>
          <mesh>
            <torusGeometry args={[3.1, 0.006, 8, 240]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
          </mesh>
          <mesh rotation={[0.5, 0, 0]}>
            <torusGeometry args={[3.7, 0.004, 8, 240]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.22} />
          </mesh>
        </group>
      </Float>
      {SHARDS.map((s, i) => (
        <mesh key={i} ref={(el) => { shardRefs.current[i] = el; }} material={chrome}>
          <tetrahedronGeometry args={[s.size, 0]} />
        </mesh>
      ))}
    </group>
  );
}

/** Endless perspective grid that glides toward the camera. */
function Floor() {
  const g = useRef<THREE.Group>(null);
  useFrame((st) => { if (g.current) g.current.position.z = (st.clock.elapsedTime * 0.3) % 1; });
  return (
    <group ref={g} position={[0, -3.7, 0]}>
      <gridHelper args={[90, 90, "#38383c", "#17171a"]} />
    </group>
  );
}

/** Scroll also dollies the camera: closer on the reveal, pulled back on the burst. */
function Dolly({ progress, base }: { progress?: MotionValue<number>; base: number }) {
  useFrame((st, dt) => {
    const k = progress ? sample(progress.get()) : FIXED;
    st.camera.position.z = THREE.MathUtils.damp(st.camera.position.z, base + k.burst * 2.2, 2.4, dt);
    st.camera.position.y = THREE.MathUtils.damp(st.camera.position.y, 0.4 + k.burst * 0.6, 2.4, dt);
    st.camera.lookAt(0, 0, 0);
  });
  return null;
}

const Lights = () => (
  <Environment resolution={256} frames={1}>
    <Lightformer form="rect" intensity={6} position={[0, 6, 2]} scale={[14, 3, 1]} target={[0, 0, 0]} />
    <Lightformer form="rect" intensity={4} position={[-6, 2, 5]} scale={[5, 9, 1]} target={[0, 0, 0]} />
    <Lightformer form="rect" intensity={7} position={[6.5, 1, -1]} scale={[1.6, 12, 1]} target={[0, 0, 0]} />
    <Lightformer form="rect" intensity={3} position={[0, -6, 4]} scale={[14, 2, 1]} target={[0, 0, 0]} />
    <Lightformer form="rect" intensity={2.5} position={[2, 0, 8]} scale={[4, 12, 1]} target={[0, 0, 0]} />
    <Lightformer form="ring" intensity={4} position={[3, 3, 5]} scale={5} target={[0, 0, 0]} />
  </Environment>
);

const canvasProps = {
  gl: { antialias: true, alpha: true, powerPreference: "high-performance" as const },
  dpr: [1, 1.7] as [number, number],
  // UI sits over the canvas, so listen for the pointer on the whole page.
  eventSource: typeof document === "undefined" ? undefined : document.body,
  eventPrefix: "client" as const,
};

/** `progress` (scroll 0..1) makes it a camera journey; without it the stone just hovers in place. */
export function HeroScene({ progress, compact = false }: { progress?: MotionValue<number>; compact?: boolean }) {
  const base = compact ? 10 : 9;
  return (
    <Canvas {...canvasProps} camera={{ position: [0, 0.4, base], fov: 38 }}>
      <fog attach="fog" args={["#000000", 8, 28]} />
      <Lights />
      <Dolly progress={progress} base={base} />
      <Rig strength={compact ? 0.7 : 1}>
        <Journey progress={progress} />
      </Rig>
      {!compact && <Floor />}
      <Sparkles count={compact ? 30 : 80} scale={[16, 10, 10]} size={1.3} speed={0.18} color="#ffffff" opacity={0.6} />
    </Canvas>
  );
}

/** A small liquid-metal orb that swells and warps with the microphone level (0..1). */
export function VoiceOrb({ level }: { level: { current: number } }) {
  return (
    <Canvas gl={{ antialias: true, alpha: true }} dpr={[1, 1.5]} camera={{ position: [0, 0, 3.3], fov: 40 }}>
      <Lights />
      <Orb level={level} />
    </Canvas>
  );
}

function Orb({ level }: { level: { current: number } }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<{ distort: number; speed: number } | null>(null);
  const smooth = useRef(0);
  useFrame((_, dt) => {
    smooth.current = THREE.MathUtils.damp(smooth.current, level.current, 8, dt);
    const l = smooth.current;
    if (mat.current) { mat.current.distort = 0.2 + l * 0.85; mat.current.speed = 1.5 + l * 6; }
    if (mesh.current) { mesh.current.scale.setScalar(1 + l * 0.35); mesh.current.rotation.y += dt * 0.4; }
  });
  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[1, 24]} />
      <MeshDistortMaterial ref={mat as never} color="#b9b9c2" metalness={1} roughness={0.14} distort={0.25} speed={1.5} envMapIntensity={1.2} />
    </mesh>
  );
}
