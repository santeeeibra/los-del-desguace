import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import * as THREE from 'three';

export interface CameraTargetSource {
  getTargetPosition: (out: THREE.Vector3) => boolean;
  getExcludedBodyHandle: () => number | null;
  isExcludedBody?: (handle: number) => boolean;
  getVehicleForward?: (out: THREE.Vector3) => boolean;
  getShakeIntensity: () => number;
}

interface ThirdPersonCameraProps {
  targetSourceRef: React.RefObject<CameraTargetSource>;
  resetSignal: number;
}

const DEFAULT_YAW = 0.45;
const DEFAULT_PITCH = 0.36;
const DEFAULT_DIST = 6.2;

export function ThirdPersonCamera({ targetSourceRef, resetSignal }: ThirdPersonCameraProps) {
  const { camera, gl } = useThree();
  const { world, rapier } = useRapier();

  const yawRef = useRef(DEFAULT_YAW);
  const pitchRef = useRef(DEFAULT_PITCH);
  const desiredDistRef = useRef(DEFAULT_DIST);
  const actualDistRef = useRef(DEFAULT_DIST);

  const smoothTarget = useRef(new THREE.Vector3(0, 1.2, 4));
  const rawTarget = useRef(new THREE.Vector3());
  const desiredCamPos = useRef(new THREE.Vector3());
  const rayDir = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
  const dragPointerId = useRef<number | null>(null);
  const lastPointer = useRef({ x: 0, y: 0 });
  const keyOrbit = useRef({ left: false, right: false });
  const initialized = useRef(false);

  // Reusable Rapier ray to prevent per-frame allocations (initialized lazily in useFrame)
  const rayRef = useRef<InstanceType<typeof rapier.Ray> | null>(null);

  useEffect(() => {
    yawRef.current = DEFAULT_YAW;
    pitchRef.current = DEFAULT_PITCH;
    desiredDistRef.current = DEFAULT_DIST;
    actualDistRef.current = DEFAULT_DIST;
    initialized.current = false;
  }, [resetSignal]);

  useEffect(() => {
    const dom = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2 && e.pointerType === 'mouse') return;
      if (dragPointerId.current !== null) return;
      dragPointerId.current = e.pointerId;
      lastPointer.current.x = e.clientX;
      lastPointer.current.y = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (dragPointerId.current !== e.pointerId) return;
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current.x = e.clientX;
      lastPointer.current.y = e.clientY;

      yawRef.current -= dx * 0.0065;
      pitchRef.current = THREE.MathUtils.clamp(pitchRef.current + dy * 0.0055, -0.05, 1.05);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (dragPointerId.current === e.pointerId) {
        dragPointerId.current = null;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      desiredDistRef.current = THREE.MathUtils.clamp(
        desiredDistRef.current + e.deltaY * 0.004,
        3.2,
        10.0
      );
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyQ') keyOrbit.current.left = true;
      if (e.code === 'KeyC') keyOrbit.current.right = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyQ') keyOrbit.current.left = false;
      if (e.code === 'KeyC') keyOrbit.current.right = false;
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [gl]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const targetSource = targetSourceRef.current;

    if (!rayRef.current) {
      rayRef.current = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    }

    if (keyOrbit.current.left) yawRef.current += 1.6 * dt;
    if (keyOrbit.current.right) yawRef.current -= 1.6 * dt;

    const hasTarget = targetSource.getTargetPosition(rawTarget.current);
    if (!hasTarget) return;

    // Aim slightly above player waist/shoulders for pleasant PEAK-style framing
    rawTarget.current.y += 0.78;

    if (!initialized.current) {
      smoothTarget.current.copy(rawTarget.current);
      initialized.current = true;
    } else {
      const followLambda = 1 - Math.exp(-12 * dt);
      smoothTarget.current.lerp(rawTarget.current, followLambda);
    }

    const yaw = yawRef.current;
    const pitch = pitchRef.current;
    const desiredDist = desiredDistRef.current;

    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);

    rayDir.current.set(cosPitch * sinYaw, sinPitch, cosPitch * cosYaw).normalize();

    // Rapier raycast from focus pivot toward desired camera position to prevent clipping through walls
    let safeDist = desiredDist;
    const ray = rayRef.current;
    if (ray) {
      ray.origin.x = smoothTarget.current.x;
      ray.origin.y = smoothTarget.current.y;
      ray.origin.z = smoothTarget.current.z;
      ray.dir.x = rayDir.current.x;
      ray.dir.y = rayDir.current.y;
      ray.dir.z = rayDir.current.z;

      const excludedPlayerHandle = targetSource.getExcludedBodyHandle();
      const hit = world.castRay(
        ray,
        desiredDist + 0.35,
        true,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        undefined,
        (collider) => {
          const parentBody = collider.parent();
          if (!parentBody) return true;
          if (excludedPlayerHandle !== null && parentBody.handle === excludedPlayerHandle) {
            return false;
          }
          if (targetSource.isExcludedBody?.(parentBody.handle)) {
            return false;
          }
          const userData = parentBody.userData as
            | { ecctrl?: { excludeRay?: boolean }; cameraIgnore?: boolean }
            | undefined;
          if (userData?.ecctrl?.excludeRay || userData?.cameraIgnore) {
            return false;
          }
          return true;
        }
      );

      if (hit && hit.timeOfImpact > 0.05) {
        safeDist = Math.max(1.15, Math.min(desiredDist, hit.timeOfImpact - 0.32));
      }
    }

    // Pull in fast on occlusion, ease out smoothly when clear
    const distRate = safeDist < actualDistRef.current ? 22 : 6;
    actualDistRef.current = THREE.MathUtils.lerp(
      actualDistRef.current,
      safeDist,
      1 - Math.exp(-distRate * dt)
    );

    desiredCamPos.current
      .copy(smoothTarget.current)
      .addScaledVector(rayDir.current, actualDistRef.current);

    // Subtle micro-shake on heavy landing/bump
    const shake = targetSource.getShakeIntensity();
    if (shake > 0.001) {
      const t = state.clock.elapsedTime * 42;
      desiredCamPos.current.x += Math.sin(t) * shake * 0.09;
      desiredCamPos.current.y += Math.cos(t * 1.3) * shake * 0.07;
    }

    camera.position.copy(desiredCamPos.current);
    lookTarget.current.copy(smoothTarget.current);
    lookTarget.current.y += 0.12;
    camera.lookAt(lookTarget.current);
  });

  return null;
}
