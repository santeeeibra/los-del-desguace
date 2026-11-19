import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getPartLogicOutput } from '../logic/contraptionRegistry';
import { grabbableRegistry, type GrabbableEntry, type GrabbableKind } from './grabbableRegistry';

const _worldPos = new THREE.Vector3();
const _worldQuat = new THREE.Quaternion();

function syncGroupToEntry(group: THREE.Group, entry: GrabbableEntry): boolean {
  const visual = entry.getVisualGroup();
  if (visual) {
    visual.getWorldPosition(_worldPos);
    visual.getWorldQuaternion(_worldQuat);
    group.position.copy(_worldPos);
    group.quaternion.copy(_worldQuat);
    return true;
  }

  const body = entry.getBody();
  if (body) {
    const t = body.translation();
    const r = body.rotation();
    group.position.set(t.x, t.y, t.z);
    group.quaternion.set(r.x, r.y, r.z, r.w);
    return true;
  }

  return false;
}

function getActiveSignal(id: string): number {
  return Math.abs(getPartLogicOutput(id));
}

function HeadlightSpotEffect({ id }: { id: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const spotRef = useRef<THREE.SpotLight>(null);
  const haloMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const targetObj = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    if (spotRef.current) {
      spotRef.current.target = targetObj;
    }
  }, [targetObj]);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;

    const entry = grabbableRegistry.getById(id);
    if (!entry || grabbableRegistry.carriedId === id) {
      group.visible = false;
      return;
    }

    const signal = getActiveSignal(id);
    const active = signal > 0.05;
    group.visible = active;
    if (!active) return;

    if (!syncGroupToEntry(group, entry)) {
      group.visible = false;
      return;
    }

    const pulse = 1 + Math.sin(clock.elapsedTime * 24) * 0.03;
    if (spotRef.current) {
      spotRef.current.intensity = 14 * Math.min(signal, 1.5) * pulse;
    }
    if (haloMatRef.current) {
      haloMatRef.current.emissiveIntensity = 2.6 * pulse;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* Lens front is along local +Z in GrabbableProps */}
      <primitive object={targetObj} position={[0, 0.03, 4.5]} />
      <spotLight
        ref={spotRef}
        position={[0, 0.03, 0.15]}
        color="#ffe3a8"
        intensity={14}
        distance={16}
        angle={0.46}
        penumbra={0.55}
        decay={1.6}
      />
      <mesh position={[0, 0.03, 0.134]}>
        <circleGeometry args={[0.125, 20]} />
        <meshStandardMaterial
          ref={haloMatRef}
          color="#fff2c6"
          emissive="#ffcf70"
          emissiveIntensity={2.6}
          transparent
          opacity={0.78}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function ThrusterFlameEffect({ id }: { id: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const flameRef = useRef<THREE.Group>(null);
  const outerMatRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;

    const entry = grabbableRegistry.getById(id);
    if (!entry || grabbableRegistry.carriedId === id) {
      group.visible = false;
      return;
    }

    const signal = getActiveSignal(id);
    const active = signal > 0.05;
    group.visible = active;
    if (!active) return;

    if (!syncGroupToEntry(group, entry)) {
      group.visible = false;
      return;
    }

    const t = clock.elapsedTime;
    const flicker = 0.84 + Math.sin(t * 43 + id.length) * 0.12 + Math.cos(t * 67) * 0.07;
    if (flameRef.current) {
      flameRef.current.scale.set(
        0.92 + Math.sin(t * 37) * 0.08,
        Math.min(signal, 1.4) * flicker,
        0.92 + Math.cos(t * 37) * 0.08,
      );
    }
    if (outerMatRef.current) {
      outerMatRef.current.emissiveIntensity = 3.0 * (0.88 + flicker * 0.2);
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <group ref={flameRef} position={[0, -0.38, 0]}>
        <mesh position={[0, -0.17, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.115, 0.36, 12]} />
          <meshStandardMaterial
            ref={outerMatRef}
            color="#ff8a1f"
            emissive="#ff8a1f"
            emissiveIntensity={3.0}
            toneMapped={false}
            transparent
            opacity={0.92}
          />
        </mesh>
        <mesh position={[0, -0.11, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.06, 0.22, 10]} />
          <meshStandardMaterial
            color="#fff0a6"
            emissive="#ffe27a"
            emissiveIntensity={3.0}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

function FanWindEffect({ id }: { id: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const ringsRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;

    const entry = grabbableRegistry.getById(id);
    if (!entry || grabbableRegistry.carriedId === id) {
      group.visible = false;
      return;
    }

    const signal = getActiveSignal(id);
    const active = signal > 0.05;
    group.visible = active;
    if (!active) return;

    if (!syncGroupToEntry(group, entry)) {
      group.visible = false;
      return;
    }

    if (ringsRef.current) {
      const t = clock.elapsedTime;
      ringsRef.current.children.forEach((child, i) => {
        const phase = (t * 3.4 + i * 0.33) % 1;
        child.position.y = -0.18 - phase * 0.85;
        const s = 0.7 + phase * 0.65;
        child.scale.set(s, s, s);
      });
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <group ref={ringsRef}>
        {[0, 1, 2].map((idx) => (
          <mesh key={idx} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.2, 0.018, 6, 16]} />
            <meshBasicMaterial
              color="#9beeff"
              transparent
              opacity={0.48}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function HornWaveEffect({ id }: { id: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const ringsRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;

    const entry = grabbableRegistry.getById(id);
    if (!entry || grabbableRegistry.carriedId === id) {
      group.visible = false;
      return;
    }

    const signal = getActiveSignal(id);
    const active = signal > 0.05;
    group.visible = active;
    if (!active) return;

    if (!syncGroupToEntry(group, entry)) {
      group.visible = false;
      return;
    }

    if (ringsRef.current) {
      const t = clock.elapsedTime;
      ringsRef.current.children.forEach((child, i) => {
        const phase = (t * 4.5 + i * 0.33) % 1;
        child.position.z = 0.24 + phase * 0.95;
        const s = 0.55 + phase * 1.4;
        child.scale.set(s, s, s);
      });
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <group ref={ringsRef}>
        {[0, 1, 2].map((idx) => (
          <mesh key={idx}>
            <torusGeometry args={[0.16, 0.02, 6, 16]} />
            <meshBasicMaterial
              color="#ffe066"
              transparent
              opacity={0.65}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function SpringPulseEffect({ id }: { id: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;

    const entry = grabbableRegistry.getById(id);
    if (!entry || grabbableRegistry.carriedId === id) {
      group.visible = false;
      return;
    }

    const signal = getActiveSignal(id);
    const active = signal > 0.05;
    group.visible = active;
    if (!active) return;

    if (!syncGroupToEntry(group, entry)) {
      group.visible = false;
      return;
    }

    if (ringRef.current) {
      const phase = (clock.elapsedTime * 5) % 1;
      const s = 0.8 + phase * 1.1;
      ringRef.current.scale.set(s, s, s);
      ringRef.current.position.y = 0.1 + phase * 0.35;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.22, 0.028, 8, 18]} />
        <meshBasicMaterial
          color="#ff6b35"
          transparent
          opacity={0.72}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

export function PropEffect({ id, kind }: { id: string; kind: GrabbableKind }) {
  if (kind === 'headlight') return <HeadlightSpotEffect id={id} />;
  if (kind === 'thruster' || kind === 'canister') return <ThrusterFlameEffect id={id} />;
  if (kind === 'fan') return <FanWindEffect id={id} />;
  if (kind === 'horn') return <HornWaveEffect id={id} />;
  if (kind === 'spring') return <SpringPulseEffect id={id} />;
  return null;
}
