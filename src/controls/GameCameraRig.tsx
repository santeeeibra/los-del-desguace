import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAfterPhysicsStep, useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import type { CameraTargetSource } from './ThirdPersonCamera';
import { useGameStore } from '../state/gameStore';

interface GameCameraRigProps {
  targetSourceRef: React.RefObject<CameraTargetSource>;
  resetSignal: number;
}

const DEFAULT_YAW = 0.45;
const DEFAULT_FP_PITCH = 0.1;

export function GameCameraRig({ targetSourceRef, resetSignal }: GameCameraRigProps) {
  const { gl } = useThree();
  const { world, rapier } = useRapier();
  const cameraMode = useGameStore((s) => s.cameraMode);

  const yawRef = useRef(DEFAULT_YAW);
  const pitchRef = useRef(DEFAULT_FP_PITCH);
  const desiredDistRef = useRef(6.2);
  const actualDistRef = useRef(6.2);
  const appliedModeRef = useRef<string | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);

  const smoothTarget = useRef(new THREE.Vector3(0, 1.2, 4));
  const rawTarget = useRef(new THREE.Vector3());
  const rayDir = useRef(new THREE.Vector3());
  const desiredCamPos = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());

  const dragPointerId = useRef<number | null>(null);
  const lastPointer = useRef({ x: 0, y: 0 });
  const keyOrbit = useRef({ left: false, right: false });
  const initialized = useRef(false);
  const rayRef = useRef<InstanceType<typeof rapier.Ray> | null>(null);

  useEffect(() => {
    yawRef.current = DEFAULT_YAW;
    pitchRef.current = DEFAULT_FP_PITCH;
    desiredDistRef.current = 6.2;
    actualDistRef.current = 6.2;
    initialized.current = false;
  }, [resetSignal]);

  useEffect(() => {
    const dom = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      // Only free canvas drags rotate the camera; HUD buttons & joystick never trigger camera rotation
      if (e.target !== dom) return;
      if (e.button !== 0 && e.button !== 2 && e.pointerType === 'mouse') return;
      if (dragPointerId.current !== null) return;
      dragPointerId.current = e.pointerId;
      lastPointer.current.x = e.clientX;
      lastPointer.current.y = e.clientY;
      try {
        dom.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic events or browsers disallowing capture stay supported via window listeners
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (dragPointerId.current !== e.pointerId) return;
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current.x = e.clientX;
      lastPointer.current.y = e.clientY;

      const yawSens = cameraMode === 'firstPerson' ? 0.0052 : 0.0065;
      const pitchSens = cameraMode === 'firstPerson' ? 0.0044 : 0.0055;
      const minPitch = cameraMode === 'firstPerson' ? -1.16 : -0.05;
      const maxPitch = cameraMode === 'firstPerson' ? 1.16 : 1.05;

      yawRef.current -= dx * yawSens;
      pitchRef.current = THREE.MathUtils.clamp(pitchRef.current + dy * pitchSens, minPitch, maxPitch);
    };

    const releaseDrag = (e: PointerEvent) => {
      if (dragPointerId.current !== e.pointerId) return;
      dragPointerId.current = null;
      try {
        if (dom.hasPointerCapture(e.pointerId)) {
          dom.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore release errors on synthetic/lost pointers
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (cameraMode === 'firstPerson') return;
      desiredDistRef.current = THREE.MathUtils.clamp(
        desiredDistRef.current + e.deltaY * 0.004,
        2.2,
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
    const onBlur = () => {
      dragPointerId.current = null;
      keyOrbit.current.left = false;
      keyOrbit.current.right = false;
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', releaseDrag);
    window.addEventListener('pointercancel', releaseDrag);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', releaseDrag);
      window.removeEventListener('pointercancel', releaseDrag);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [gl, cameraMode]);

  useFrame(({ camera: activeCam }, rawDelta) => {
    cameraRef.current = activeCam;
    const dt = Math.min(rawDelta, 0.05);
    if (keyOrbit.current.left) yawRef.current += 1.65 * dt;
    if (keyOrbit.current.right) yawRef.current -= 1.65 * dt;

    // Adjust FOV and near clip safely per camera mode without altering physics or reach
    if (appliedModeRef.current !== cameraMode && activeCam instanceof THREE.PerspectiveCamera) {
      appliedModeRef.current = cameraMode;
      const targetFov = cameraMode === 'firstPerson' ? 62 : cameraMode === 'thirdPersonClose' ? 54 : 50;
      const targetNear = cameraMode === 'firstPerson' ? 0.06 : 0.12;
      if (activeCam.fov !== targetFov || activeCam.near !== targetNear) {
        activeCam.fov = targetFov;
        activeCam.near = targetNear;
        activeCam.updateProjectionMatrix();
      }
    }
  });

  // Update camera right after Rapier world.step() so first-person eyes stay locked to Chispa's arms & held prop
  useAfterPhysicsStep(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    const targetSource = targetSourceRef.current;
    if (!targetSource.getTargetPosition(rawTarget.current)) return;

    if (!rayRef.current) {
      rayRef.current = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    }

    const ray = rayRef.current;
    const excludedPlayerHandle = targetSource.getExcludedBodyHandle();
    const rayFilter = (collider: { parent: () => { handle: number; userData?: unknown } | null }) => {
      const parentBody = collider.parent();
      if (!parentBody) return true;
      if (excludedPlayerHandle !== null && parentBody.handle === excludedPlayerHandle) {
        return false;
      }
      const userData = parentBody.userData as
        | { ecctrl?: { excludeRay?: boolean }; cameraIgnore?: boolean }
        | undefined;
      return !(userData?.ecctrl?.excludeRay || userData?.cameraIgnore);
    };

    const yaw = yawRef.current;
    const pitch = pitchRef.current;
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);

    if (cameraMode === 'firstPerson') {
      // Eye height cleanly above shoulders/bib (0.34m above capsule center) & safely inside 0.32m capsule
      let eyeY = rawTarget.current.y + 0.34;
      const baseOriginY = rawTarget.current.y + 0.08;

      // Prevent eye point clipping above low ceilings/under beams
      ray.origin = { x: rawTarget.current.x, y: baseOriginY, z: rawTarget.current.z };
      ray.dir = { x: 0, y: 1, z: 0 };
      const ceilingHit = world.castRay(
        ray,
        0.42,
        true,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        undefined,
        rayFilter
      );
      if (ceilingHit && ceilingHit.timeOfImpact > 0.05) {
        eyeY = Math.min(eyeY, baseOriginY + Math.max(0.14, ceilingHit.timeOfImpact - 0.14));
      }

      // Clamp small forward eye nudge strictly clear of walls
      const fwdX = -sinYaw;
      const fwdZ = -cosYaw;
      ray.origin = { x: rawTarget.current.x, y: eyeY, z: rawTarget.current.z };
      ray.dir = { x: fwdX, y: 0, z: fwdZ };
      const wallHit = world.castRay(
        ray,
        0.24,
        true,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        undefined,
        rayFilter
      );
      let forwardOffset = 0.04;
      if (wallHit && wallHit.timeOfImpact > 0.01) {
        forwardOffset = Math.min(forwardOffset, Math.max(0, wallHit.timeOfImpact - 0.18));
      }

      desiredCamPos.current.set(
        rawTarget.current.x + fwdX * forwardOffset,
        eyeY,
        rawTarget.current.z + fwdZ * forwardOffset
      );

      // Gentle vertical tap only on heavy landing/bump (no forced head-bob or horizon roll)
      const shake = targetSource.getShakeIntensity();
      if (shake > 0.01) {
        desiredCamPos.current.y -= Math.min(0.025, shake * 0.03);
      }

      rayDir.current.set(-cosPitch * sinYaw, -sinPitch, -cosPitch * cosYaw).normalize();
      camera.up.set(0, 1, 0);
      camera.position.copy(desiredCamPos.current);
      lookTarget.current.copy(desiredCamPos.current).addScaledVector(rayDir.current, 2.0);
      camera.lookAt(lookTarget.current);
      smoothTarget.current.copy(rawTarget.current);
      initialized.current = true;
      return;
    }

    // Fallback wide third-person mode (expanded with close shoulder preset & toggle in next step)
    const dt = Math.min(world.timestep, 0.05);
    rawTarget.current.y += 0.78;
    if (!initialized.current) {
      smoothTarget.current.copy(rawTarget.current);
      initialized.current = true;
    } else {
      smoothTarget.current.lerp(rawTarget.current, 1 - Math.exp(-14 * dt));
    }

    rayDir.current.set(cosPitch * sinYaw, sinPitch, cosPitch * cosYaw).normalize();
    let safeDist = desiredDistRef.current;
    ray.origin = {
      x: smoothTarget.current.x,
      y: smoothTarget.current.y,
      z: smoothTarget.current.z,
    };
    ray.dir = { x: rayDir.current.x, y: rayDir.current.y, z: rayDir.current.z };
    const hit = world.castRay(
      ray,
      desiredDistRef.current + 0.35,
      true,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      undefined,
      rayFilter
    );
    if (hit && hit.timeOfImpact > 0.05) {
      safeDist = Math.max(1.15, Math.min(desiredDistRef.current, hit.timeOfImpact - 0.32));
    }

    const distRate = safeDist < actualDistRef.current ? 22 : 6;
    actualDistRef.current = THREE.MathUtils.lerp(
      actualDistRef.current,
      safeDist,
      1 - Math.exp(-distRate * dt)
    );
    desiredCamPos.current
      .copy(smoothTarget.current)
      .addScaledVector(rayDir.current, actualDistRef.current);

    camera.up.set(0, 1, 0);
    camera.position.copy(desiredCamPos.current);
    lookTarget.current.copy(smoothTarget.current);
    lookTarget.current.y += 0.12;
    camera.lookAt(lookTarget.current);
  });

  return null;
}
