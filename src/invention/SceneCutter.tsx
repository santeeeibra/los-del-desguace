import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { grabbableRegistry } from '../props/grabbableRegistry';
import { playWeldClank } from '../audio/sfxEngine';
import { outlineSegments, sceneCutStore, useCutPreview, cellsGrid } from './sceneCut';
import { gridBounds, gridToRects, PLATFORM_THICKNESS, STEER_DESIGN_MAX, wheelFootprintCorners, type Pt, type Rect } from './platformShape';
import { steerSweepHits, wheelFootprintFromPose } from './platformRules';

const TOP = PLATFORM_THICKNESS / 2;
const GRAB_RADIUS = 0.11;
const LASER_SPEED = 1.3; // m/s

function v3(p: Pt, y = TOP + 0.012): [number, number, number] {
  return [p.x, y, p.z];
}

function RectBoxes({ rects, color, opacity, lift = 0.004, grow = 0.006 }: { rects: Rect[]; color: string; opacity: number; lift?: number; grow?: number }) {
  return (
    <group>
      {rects.map((r, i) => (
        <mesh key={i} position={[r.x, lift, r.z]} renderOrder={3}>
          <boxGeometry args={[r.hx * 2 + grow, PLATFORM_THICKNESS + grow, r.hz * 2 + grow]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Restos que se desprenden al cortar (solo visual). */
function Offcut({ rects, matrix, onDone }: { rects: Rect[]; matrix: THREE.Matrix4; onDone: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  const spin = useMemo(() => new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), []);
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.matrixAutoUpdate = true;
    matrix.decompose(g.position, g.quaternion, g.scale);
  }, [matrix]);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    t.current += dt;
    g.position.y -= (4 * t.current) * dt + 0.2 * dt;
    g.rotateOnAxis(spin, dt * 1.6);
    if (t.current > 1.4) onDone();
  });
  return (
    <group ref={ref}>
      {rects.map((r, i) => (
        <mesh key={i} position={[r.x, 0, r.z]} castShadow>
          <boxGeometry args={[r.hx * 2, PLATFORM_THICKNESS, r.hz * 2]} />
          <meshStandardMaterial color="#c98a45" roughness={0.8} emissive="#ff5a1f" emissiveIntensity={0.25} />
        </mesh>
      ))}
    </group>
  );
}

export function SceneCutter() {
  const { cut, info, record, preview } = useCutPreview();
  const groupRef = useRef<THREE.Group>(null);
  const dragIndex = useRef<number | null>(null);
  const laserRef = useRef<THREE.Group>(null);
  const laserProgress = useRef(0);
  const { camera, size } = useThree();
  const [offcuts, setOffcuts] = useState<{ key: number; rects: Rect[]; matrix: THREE.Matrix4 }[]>([]);
  const lastNonce = useRef(cut.cutNonce);
  const body = cut.platformId ? grabbableRegistry.getById(cut.platformId)?.getBody() : null;

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g || !body?.isValid()) return;
    const t = body.translation();
    const r = body.rotation();
    g.position.set(t.x, t.y, t.z);
    g.quaternion.set(r.x, r.y, r.z, r.w);
    g.updateMatrixWorld(true);
    // Pasada del láser a lo largo de la línea antes de cortar de verdad.
    const pts = sceneCutStore.get().points;
    if (cut.phase === 'cutting' && pts.length >= 2) {
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      laserProgress.current += (dt * LASER_SPEED) / Math.max(0.3, total);
      let d = Math.min(1, laserProgress.current) * total;
      let p = pts[0];
      for (let i = 1; i < pts.length; i++) {
        const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        if (d <= seg || i === pts.length - 1) {
          const k = seg > 0 ? Math.min(1, d / seg) : 1;
          p = { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * k };
          break;
        }
        d -= seg;
      }
      if (laserRef.current) {
        laserRef.current.visible = true;
        laserRef.current.position.set(p.x, TOP + 0.02, p.z);
        laserRef.current.scale.setScalar(1 + Math.sin(performance.now() / 30) * 0.25);
      }
      if (laserProgress.current >= 1) {
        laserProgress.current = 0;
        sceneCutStore.finishCut();
      }
    } else {
      laserProgress.current = 0;
      if (laserRef.current) laserRef.current.visible = false;
    }
  });

  // Desprender el sobrante al terminar un corte.
  useEffect(() => {
    if (cut.cutNonce === lastNonce.current) return;
    lastNonce.current = cut.cutNonce;
    const last = sceneCutStore.get().lastCut;
    const g = groupRef.current;
    if (!last || !g || !last.removed.length) return;
    playWeldClank();
    setOffcuts((list) => [...list, { key: cut.cutNonce, rects: last.removed, matrix: g.matrixWorld.clone() }]);
  }, [cut.cutNonce]);

  // Gancho de pruebas (solo desarrollo): proyecta un punto de la plataforma a la pantalla.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__desguaceCutDev = {
      project(x: number, z: number) {
        const g = groupRef.current;
        if (!g) return null;
        const v = g.localToWorld(new THREE.Vector3(x, TOP, z)).project(camera);
        const rect = (document.querySelector('canvas') as HTMLCanvasElement | null)?.getBoundingClientRect();
        if (!rect) return null;
        return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
      },
    };
    return () => { delete w.__desguaceCutDev; };
  }, [camera, size]);

  const bounds = record ? gridBounds(record.grid) : null;
  const outline = useMemo(() => {
    if (!preview) return [] as [number, number, number][];
    const seg = outlineSegments(preview.remaining);
    const out: [number, number, number][] = [];
    for (let i = 0; i < seg.length; i += 4) out.push([seg[i], TOP + 0.01, seg[i + 1]], [seg[i + 2], TOP + 0.01, seg[i + 3]]);
    return out;
  }, [preview]);

  const sweepChild = info?.children.find((c) => c.id === cut.sweepWheel && c.steer) ?? null;
  const sweep = useMemo(() => {
    if (!sweepChild || !record || !preview) return null;
    const grid = preview.remaining;
    const fp = wheelFootprintFromPose(sweepChild.pose);
    const angles: number[] = [];
    for (let a = -STEER_DESIGN_MAX; a <= STEER_DESIGN_MAX + 1e-6; a += STEER_DESIGN_MAX / 6) angles.push(a);
    return {
      loops: angles.map((a) => wheelFootprintCorners(fp, a)),
      ends: [wheelFootprintCorners(fp, -STEER_DESIGN_MAX), wheelFootprintCorners(fp, STEER_DESIGN_MAX)],
      hits: gridToRects(cellsGrid(grid, steerSweepHits(grid, sweepChild.pose))),
    };
  }, [sweepChild, record, preview]);

  if (!cut.active || !record || !body || !bounds) return null;

  const toLocal = (e: ThreeEvent<PointerEvent>): Pt | null => {
    const g = groupRef.current;
    if (!g) return null;
    const p = g.worldToLocal(e.point.clone());
    return { x: p.x, z: p.z };
  };

  const margin = 0.6;
  const planeW = bounds.maxX - bounds.minX + margin * 2;
  const planeD = bounds.maxZ - bounds.minZ + margin * 2;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const editing = cut.phase === 'edit';
  const linePts = cut.points.map((p) => v3(p, TOP + 0.016));

  return (
    <>
      <group ref={groupRef} name="scene-cutter">
        {/* Superficie de marcado (más grande que la pieza para poder tocar afuera del borde). */}
        <mesh
          position={[cx, TOP + 0.006, cz]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={(e) => {
            if (!editing) return;
            e.stopPropagation();
            const p = toLocal(e);
            if (!p) return;
            const pts = sceneCutStore.get().points;
            let best = -1;
            let bestD = GRAB_RADIUS;
            pts.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bestD) { bestD = d; best = i; } });
            if (best >= 0) dragIndex.current = best;
            else { sceneCutStore.addPoint(p); dragIndex.current = sceneCutStore.get().points.length - 1; }
            (e.target as unknown as Element).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (dragIndex.current === null) return;
            e.stopPropagation();
            const p = toLocal(e);
            if (p) sceneCutStore.movePoint(dragIndex.current, p);
          }}
          onPointerUp={(e) => {
            dragIndex.current = null;
            (e.target as unknown as Element).releasePointerCapture?.(e.pointerId);
          }}
        >
          <planeGeometry args={[planeW, planeD]} />
          <meshBasicMaterial color="#7fdcff" transparent opacity={0.06} depthWrite={false} />
        </mesh>

        {/* Lo que queda: contorno celeste. Lo que se va: rojo translúcido. */}
        {outline.length > 0 && <Line points={outline} segments color="#5fe1ff" lineWidth={3} toneMapped={false} />}
        {preview && preview.removedRects.length > 0 && <RectBoxes rects={preview.removedRects} color="#ff3a2a" opacity={0.45} />}

        {/* Holograma del recorrido de giro de la rueda. */}
        {sweep && (
          <group>
            {sweep.loops.map((loop, i) => (
              <Line key={i} points={[...loop, loop[0]].map((p) => v3(p, TOP + 0.02))} color="#7ee8d6" lineWidth={1.5} transparent opacity={0.7} toneMapped={false} />
            ))}
            {sweep.ends.map((loop, i) => (
              <Line key={`e${i}`} points={[...loop, loop[0]].map((p) => v3(p, TOP + 0.022))} color="#c9fff4" lineWidth={3} toneMapped={false} />
            ))}
            <RectBoxes rects={sweep.hits} color="#ff1f4a" opacity={0.7} lift={0.01} grow={0.01} />
          </group>
        )}

        {/* Línea láser y puntos luminosos. */}
        {linePts.length >= 2 && (
          <>
            <Line points={linePts} color="#ff2a1a" lineWidth={9} transparent opacity={0.28} toneMapped={false} />
            <Line points={linePts} color="#ff6a3a" lineWidth={3.5} toneMapped={false} />
          </>
        )}
        {cut.points.map((p, i) => (
          <group key={i} position={v3(p, TOP + 0.02)}>
            <mesh renderOrder={5}>
              <sphereGeometry args={[i === cut.points.length - 1 ? 0.045 : 0.035, 16, 12]} />
              <meshBasicMaterial color={i === 0 ? '#ffe066' : '#ff5a36'} toneMapped={false} />
            </mesh>
            <mesh renderOrder={4}>
              <sphereGeometry args={[0.085, 16, 12]} />
              <meshBasicMaterial color="#ff7a4a" transparent opacity={0.25} depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
        ))}

        {/* Punto del láser durante el corte. */}
        <group ref={laserRef} visible={false}>
          <mesh>
            <sphereGeometry args={[0.05, 16, 12]} />
            <meshBasicMaterial color="#fff2c0" toneMapped={false} />
          </mesh>
          <pointLight color="#ff6a2a" intensity={3} distance={1.6} />
        </group>
      </group>
      {offcuts.map((o) => (
        <Offcut key={o.key} rects={o.rects} matrix={o.matrix}
          onDone={() => setOffcuts((list) => list.filter((x) => x.key !== o.key))} />
      ))}
    </>
  );
}
