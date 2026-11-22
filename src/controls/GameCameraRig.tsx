import { useEffect, useRef } from 'react';
import { sceneCutStore } from '../invention/sceneCut';
import { grabbableRegistry } from '../props/grabbableRegistry';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import type { CameraTargetSource } from './ThirdPersonCamera';
import { playerInput } from './playerInput';
import { snapshotPrimaryInteractRequest, type InteractRequest } from '../invention/interactResolution';
import { clearPendingWire } from '../logic/contraptionRegistry';
import { buildToolsLocked } from '../modes/gameModes';
import { playWoodClick } from '../audio/sfxEngine';
import { gameStore, useGameStore, type CameraViewMode } from '../state/gameStore';

interface GameCameraRigProps {
  targetSourceRef: React.RefObject<CameraTargetSource>;
  resetSignal: number;
}

interface ThirdPersonPreset {
  fov: number;
  near: number;
  pivotHeight: number;
  lookOffsetY: number;
  defaultDist: number;
  minDist: number;
  maxDist: number;
  minSafeDist: number;
  defaultPitch: number;
  minPitch: number;
  maxPitch: number;
  yawSens: number;
  pitchSens: number;
}

// Desde el punto de aparición, mirar hacia el chasis y el arco.
const DEFAULT_YAW = -2.14;

const FIRST_PERSON_LIMITS = {
  fov: 62,
  near: 0.06,
  defaultPitch: 0.1,
  minPitch: -1.16,
  maxPitch: 1.16,
  yawSens: 0.0052,
  pitchSens: 0.0044,
} as const;

const THIRD_PERSON_PRESETS: Record<Exclude<CameraViewMode, 'firstPerson'>, ThirdPersonPreset> = {
  thirdPersonClose: {
    fov: 54,
    near: 0.1,
    pivotHeight: 0.42,
    lookOffsetY: 0.04,
    defaultDist: 2.55,
    minDist: 1.75,
    maxDist: 3.6,
    minSafeDist: 0.58,
    defaultPitch: 0.18,
    minPitch: -0.22,
    maxPitch: 0.78,
    yawSens: 0.0062,
    pitchSens: 0.005,
  },
  thirdPersonWide: {
    fov: 50,
    near: 0.12,
    pivotHeight: 0.78,
    lookOffsetY: 0.12,
    defaultDist: 6.2,
    minDist: 3.6,
    maxDist: 9.8,
    minSafeDist: 1.1,
    defaultPitch: 0.36,
    minPitch: -0.06,
    maxPitch: 1.05,
    yawSens: 0.0065,
    pitchSens: 0.0055,
  },
};

export function GameCameraRig({ targetSourceRef, resetSignal }: GameCameraRigProps) {
  const cutCamGoal = useRef(new THREE.Vector3());
  const cutCenter = useRef(new THREE.Vector3());
  const { gl } = useThree();
  const { world, rapier } = useRapier();
  const cameraMode = useGameStore((s) => s.cameraMode);

  const yawRef = useRef(DEFAULT_YAW);
  const pitchRef = useRef(
    cameraMode === 'firstPerson'
      ? FIRST_PERSON_LIMITS.defaultPitch
      : THIRD_PERSON_PRESETS[cameraMode].defaultPitch
  );
  const closeDistRef = useRef(THIRD_PERSON_PRESETS.thirdPersonClose.defaultDist);
  const wideDistRef = useRef(THIRD_PERSON_PRESETS.thirdPersonWide.defaultDist);
  const actualDistRef = useRef(
    cameraMode === 'firstPerson'
      ? 0.2
      : THIRD_PERSON_PRESETS[cameraMode].defaultDist
  );
  const smoothEyeYRef = useRef(1.22);
  const prevModeRef = useRef<CameraViewMode>(cameraMode);
  const appliedModeRef = useRef<CameraViewMode | null>(null);

  const smoothTarget = useRef(new THREE.Vector3(0, 1.2, 4));
  const rawTarget = useRef(new THREE.Vector3());
  const rayDir = useRef(new THREE.Vector3());
  const sideAxis = useRef(new THREE.Vector3());
  const desiredCamPos = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
  const vehicleFwd = useRef(new THREE.Vector3());

  const dragPointerId = useRef<number | null>(null);
  const lastPointer = useRef({ x: 0, y: 0 });
  const lastManualLookAtRef = useRef(0);
  const keyOrbit = useRef({ left: false, right: false });
  const initialized = useRef(false);
  const rayRef = useRef<InstanceType<typeof rapier.Ray> | null>(null);

  useEffect(() => {
    yawRef.current = DEFAULT_YAW;
    const mode = gameStore.getState().cameraMode;
    pitchRef.current =
      mode === 'firstPerson'
        ? FIRST_PERSON_LIMITS.defaultPitch
        : THIRD_PERSON_PRESETS[mode].defaultPitch;
    closeDistRef.current = THIRD_PERSON_PRESETS.thirdPersonClose.defaultDist;
    wideDistRef.current = THIRD_PERSON_PRESETS.thirdPersonWide.defaultDist;
    actualDistRef.current =
      mode === 'firstPerson' ? 0.2 : THIRD_PERSON_PRESETS[mode].defaultDist;
    initialized.current = false;
  }, [resetSignal]);

  // Preserve horizontal look direction & prevent stuck drag pointers when switching camera views
  useEffect(() => {
    if (prevModeRef.current === cameraMode) return;
    const fromMode = prevModeRef.current;
    prevModeRef.current = cameraMode;
    dragPointerId.current = null;

    if (cameraMode === 'firstPerson') {
      pitchRef.current = THREE.MathUtils.clamp(
        pitchRef.current,
        FIRST_PERSON_LIMITS.minPitch,
        FIRST_PERSON_LIMITS.maxPitch
      );
      actualDistRef.current = 0.2;
      if (targetSourceRef.current.getTargetPosition(rawTarget.current)) {
        smoothEyeYRef.current = rawTarget.current.y + 0.37;
      }
    } else {
      const preset = THIRD_PERSON_PRESETS[cameraMode];
      const basePitch = THREE.MathUtils.clamp(pitchRef.current, preset.minPitch, preset.maxPitch);
      pitchRef.current =
        fromMode === 'firstPerson' && Math.abs(basePitch) < 0.08
          ? preset.defaultPitch
          : basePitch;
      actualDistRef.current =
        cameraMode === 'thirdPersonClose' ? closeDistRef.current : wideDistRef.current;
      if (fromMode === 'firstPerson' && targetSourceRef.current.getTargetPosition(rawTarget.current)) {
        smoothTarget.current.set(
          rawTarget.current.x,
          rawTarget.current.y + preset.pivotHeight,
          rawTarget.current.z
        );
      }
    }
  }, [cameraMode, targetSourceRef]);

  useEffect(() => {
    const dom = gl.domElement;
    let aimPointerId: number | null = null;
    let leftTap: { id: number; x: number; y: number; time: number; request: InteractRequest } | null = null;
    let rightTap: { id: number; x: number; y: number; time: number } | null = null;
    let wasPointerLocked = document.pointerLockElement === dom;

    const applyLookDelta = (dx: number, dy: number) => {
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        lastManualLookAtRef.current = performance.now();
      }
      const mode = gameStore.getState().cameraMode;
      const limits = mode === 'firstPerson' ? FIRST_PERSON_LIMITS : THIRD_PERSON_PRESETS[mode];
      yawRef.current -= dx * limits.yawSens;
      pitchRef.current = THREE.MathUtils.clamp(
        pitchRef.current + dy * limits.pitchSens,
        limits.minPitch,
        limits.maxPitch
      );
    };

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === dom;
      if (wasPointerLocked && !locked) {
        playerInput.lastPointerLockExitAt = performance.now();
      }
      wasPointerLocked = locked;
      gameStore.setPointerLocked(locked);
      if (locked) {
        dragPointerId.current = null;
        leftTap = null;
      }
    };

    let mouseHoldActive = false;
    // Soldadora, amoladora y sierra solo trabajan con Ctrl + clic sostenido; el clic solo es agarre con el láser.
    const needsHold = (ctrl: boolean) => {
      const s = gameStore.getState();
      // El aerosol pinta con el clic solo (sin Ctrl): no agarra piezas.
      return s.assemblyInteraction === 'push' || (s.sprayEquipped && !s.carriedKind) || (ctrl && (s.welderEquipped || s.grinderEquipped || s.sawEquipped));
    };
    const usePrimaryAction = (request?: InteractRequest, ctrl = false) => {
      if (needsHold(ctrl)) {
        mouseHoldActive = true;
        playerInput.interactHeld = true;
        // Amoladora y sierra solo usan el clic sostenido: no deben agarrar ni mover la pieza.
        const s = gameStore.getState();
        if (s.assemblyInteraction !== 'push' && (s.grinderEquipped || s.sawEquipped)) return;
        if (s.assemblyInteraction !== 'push' && s.sprayEquipped && !s.carriedKind) return;
        // La soldadora solo necesita el clic para armar la soldadura de una pieza que llevás en la mano.
        if (s.assemblyInteraction !== 'push' && s.welderEquipped && !s.carriedKind) return;
      }
      playerInput.triggerInteract(request);
    };
    const stopMouseHold = () => {
      if (!mouseHoldActive) return;
      mouseHoldActive = false;
      playerInput.interactHeld = false;
    };
    const useSecondaryAction = () => {
      const s = gameStore.getState();
      if (s.seated) return;
      if (s.wiringActive) {
        if (s.pendingWireFrom) {
          clearPendingWire();
          gameStore.setWireHint('Cable cancelado');
        } else {
          gameStore.selectTool('hand');
        }
        playWoodClick();
        return;
      }
      if (s.carriedKind || (s.wrenchAiming && s.wrenchTarget === 'piece')) {
        gameStore.cycleWrenchAxis();
        playWoodClick();
        return;
      }
      if (s.wrenchEquipped) {
        gameStore.selectTool('hand');
        playWoodClick();
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.target !== dom) return;
      // En Cortar en escena los toques marcan el corte (los maneja SceneCutter).
      if (sceneCutStore.isActive()) return;
      if (e.button !== 0 && e.button !== 2 && e.pointerType === 'mouse') return;
      dom.focus({ preventScroll: true });
      if (e.pointerType === 'mouse' && document.pointerLockElement === dom) {
        if (e.button === 0 && !playerInput.menuOpen) {
          usePrimaryAction(undefined, e.ctrlKey);
          return;
        }
        if (e.button === 2 && !playerInput.menuOpen) {
          useSecondaryAction();
          return;
        }
      }
      if (e.pointerType === 'mouse' && e.button === 2 && !playerInput.menuOpen) {
        rightTap = { id: e.pointerId, x: e.clientX, y: e.clientY, time: performance.now() };
        if (gameStore.getState().wrenchEquipped && !gameStore.getState().wrenchAimLocked) {
          aimPointerId = e.pointerId;
          gameStore.setWrenchAiming(true);
        }
      }
      if (e.pointerType === 'mouse' && e.button === 0 && !playerInput.menuOpen) {
        if (needsHold(e.ctrlKey)) {
          usePrimaryAction(undefined, e.ctrlKey);
        } else {
          leftTap = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            time: performance.now(),
            request: snapshotPrimaryInteractRequest(gameStore.getState()),
          };
        }
        if (gameStore.getState().mouseLookMode === 'pointerLock' && document.pointerLockElement !== dom) {
          try {
            Promise.resolve(dom.requestPointerLock?.()).catch(() => {});
          } catch {
            // Fallback to drag if pointer lock is blocked
          }
        }
      }
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
      if (aimPointerId === e.pointerId && (e.buttons & 2) === 0) {
        aimPointerId = null;
        gameStore.setWrenchAiming(false);
      }
      if (document.pointerLockElement === dom) return;
      if (dragPointerId.current !== e.pointerId) return;
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current.x = e.clientX;
      lastPointer.current.y = e.clientY;
      applyLookDelta(dx, dy);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== dom || playerInput.menuOpen) return;
      const dx = e.movementX;
      const dy = e.movementY;
      if (Math.abs(dx) > 180 || Math.abs(dy) > 180) return;
      applyLookDelta(dx, dy);
    };

    const releaseDrag = (e: PointerEvent) => {
      if ((e.type === 'pointerup' || e.type === 'pointercancel') && e.pointerType === 'mouse' && e.button === 0) {
        stopMouseHold();
      }
      if (leftTap && leftTap.id === e.pointerId) {
        const moved = Math.hypot(e.clientX - leftTap.x, e.clientY - leftTap.y);
        if (e.type === 'pointerup' && moved < 6 && performance.now() - leftTap.time < 260 && !playerInput.menuOpen) {
          const st = gameStore.getState();
          // Toque corto con el aerosol: un disparo de pintura (no deja el gatillo apretado).
          if (st.sprayEquipped && !st.carriedKind) playerInput.sprayTap = true;
          else usePrimaryAction(leftTap.request);
        }
        leftTap = null;
      }
      if (rightTap && rightTap.id === e.pointerId) {
        const moved = Math.hypot(e.clientX - rightTap.x, e.clientY - rightTap.y);
        if (e.type === 'pointerup' && moved < 6 && performance.now() - rightTap.time < 260 && !playerInput.menuOpen) {
          useSecondaryAction();
        }
        rightTap = null;
      }
      if (aimPointerId === e.pointerId) {
        aimPointerId = null;
        gameStore.setWrenchAiming(false);
      }
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
      if (playerInput.menuOpen || !e.deltaY) return;
      const hud = gameStore.getState();
      if (!e.altKey && !hud.seated) {
        if (hud.carriedKind || (hud.wrenchAiming && hud.wrenchTarget)) {
          const backwards = e.deltaY > 0;
          playerInput.triggerCartAction(hud.wrenchTarget === 'base' && !hud.carriedKind
            ? backwards ? 'rotate-base-back' : 'rotate-base'
            : backwards ? 'rotate-back' : 'rotate');
        } else if (buildToolsLocked()) {
          gameStore.cycleInventory(Math.sign(e.deltaY));
        } else {
          gameStore.cycleHotbarTool(Math.sign(e.deltaY));
          playWoodClick();
        }
        return;
      }
      const mode = hud.cameraMode;
      if (mode === 'firstPerson') return;
      const preset = THIRD_PERSON_PRESETS[mode];
      if (mode === 'thirdPersonClose') {
        closeDistRef.current = THREE.MathUtils.clamp(
          closeDistRef.current + e.deltaY * 0.003,
          preset.minDist,
          preset.maxDist
        );
      } else {
        wideDistRef.current = THREE.MathUtils.clamp(
          wideDistRef.current + e.deltaY * 0.004,
          preset.minDist,
          preset.maxDist
        );
      }
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onMouseDown = (e: MouseEvent) => {
      // Pointerdown no se repite al agregar otro botón mientras se sostiene el derecho.
      if (e.button === 0 && (e.buttons & 2) !== 0 && aimPointerId !== null && !playerInput.menuOpen) {
        e.preventDefault();
        usePrimaryAction(undefined, e.ctrlKey);
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) stopMouseHold();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyC' && !e.shiftKey) keyOrbit.current.right = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Soltar Ctrl corta la herramienta aunque el clic siga apretado.
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
        const s = gameStore.getState();
        if (s.welderEquipped || s.grinderEquipped || s.sawEquipped) stopMouseHold();
      }
      if (e.code === 'KeyC') keyOrbit.current.right = false;
    };
    const onBlur = () => {
      stopMouseHold();
      aimPointerId = null;
      leftTap = null;
      rightTap = null;
      gameStore.setWrenchAiming(false);
      gameStore.setPointerLocked(false);
      dragPointerId.current = null;
      keyOrbit.current.left = false;
      keyOrbit.current.right = false;
    };

    document.addEventListener('pointerlockchange', onPointerLockChange);
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('mousedown', onMouseDown);
    dom.addEventListener('lostpointercapture', releaseDrag);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('pointerup', releaseDrag);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('pointercancel', releaseDrag);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      if (aimPointerId !== null) gameStore.setWrenchAiming(false);
      gameStore.setPointerLocked(false);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('mousedown', onMouseDown);
      dom.removeEventListener('lostpointercapture', releaseDrag);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('pointerup', releaseDrag);
      window.removeEventListener('mouseup', onMouseUp);
      stopMouseHold();
      window.removeEventListener('pointercancel', releaseDrag);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [gl]);

  // Runs every render frame AFTER Rapier FrameStepper interpolates RigidBody transforms
  // so camera, arms, and carried props share the exact same render timestamp (zero 60/120Hz stutter).
  useFrame(({ camera }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    // Cortar en escena: vista elevada fija sobre la pieza y lo que la rodea.
    const cutState = sceneCutStore.get();
    if (cutState.active && cutState.platformId) {
      const cutBody = grabbableRegistry.getById(cutState.platformId)?.getBody();
      if (cutBody?.isValid()) {
        // Encuadre: el centro de la creación (pieza + lo que tiene soldado), no solo de la plataforma.
        const t = cutCenter.current.copy(cutBody.translation());
        const parts = sceneCutStore.framingPoints();
        if (parts.length) {
          for (const p of parts) t.add(p);
          t.multiplyScalar(1 / (parts.length + 1));
        }
        const dist = 3.0;
        const pitch = 1.05;
        cutCamGoal.current.set(
          t.x + Math.sin(cutState.viewYaw) * Math.cos(pitch) * dist,
          t.y + Math.sin(pitch) * dist,
          t.z + Math.cos(cutState.viewYaw) * Math.cos(pitch) * dist,
        );
        camera.position.lerp(cutCamGoal.current, 1 - Math.exp(-6 * dt));
        camera.up.set(0, 1, 0);
        camera.lookAt(t.x, t.y, t.z);
        initialized.current = false;
        return;
      }
    }
    if (keyOrbit.current.left) yawRef.current += 1.65 * dt;
    if (keyOrbit.current.right) yawRef.current -= 1.65 * dt;

    const targetSource = targetSourceRef.current;
    // Al conducir, alinear suavemente la cámara detrás del vehículo (sin pelear con el ratón libre recién movido)
    if (
      gameStore.getState().seated &&
      dragPointerId.current === null &&
      !keyOrbit.current.left &&
      !keyOrbit.current.right &&
      performance.now() - lastManualLookAtRef.current > 1400 &&
      targetSource.getVehicleForward?.(vehicleFwd.current)
    ) {
      const fx = vehicleFwd.current.x;
      const fz = vehicleFwd.current.z;
      if (Math.hypot(fx, fz) > 0.05) {
        const behindYaw = Math.atan2(-fx, -fz);
        const diff = Math.atan2(Math.sin(behindYaw - yawRef.current), Math.cos(behindYaw - yawRef.current));
        yawRef.current += diff * (1 - Math.exp(-5.5 * dt));
      }
    }

    if (appliedModeRef.current !== cameraMode && camera instanceof THREE.PerspectiveCamera) {
      appliedModeRef.current = cameraMode;
      const targetFov =
        cameraMode === 'firstPerson'
          ? FIRST_PERSON_LIMITS.fov
          : THIRD_PERSON_PRESETS[cameraMode].fov;
      const targetNear =
        cameraMode === 'firstPerson'
          ? FIRST_PERSON_LIMITS.near
          : THIRD_PERSON_PRESETS[cameraMode].near;
      if (camera.fov !== targetFov || camera.near !== targetNear) {
        camera.fov = targetFov;
        camera.near = targetNear;
        camera.updateProjectionMatrix();
      }
    }

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
      if (targetSource.isExcludedBody?.(parentBody.handle)) {
        return false;
      }
      const userData = parentBody.userData as
        | { ecctrl?: { excludeRay?: boolean }; cameraIgnore?: boolean }
        | undefined;
      return !(userData?.ecctrl?.excludeRay || userData?.cameraIgnore);
    };

    const mode = gameStore.getState().cameraMode;
    const yaw = yawRef.current;
    const pitch = pitchRef.current;
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);

    if (mode === 'firstPerson') {
      const rawEyeY = rawTarget.current.y + 0.37;
      if (!initialized.current) {
        smoothEyeYRef.current = rawEyeY;
      } else {
        // Filter only tiny vertical spring micro-chatter while keeping jumps/drops crisp
        const yDelta = Math.abs(rawEyeY - smoothEyeYRef.current);
        const yRate = yDelta > 0.03 ? 42 : 16;
        smoothEyeYRef.current = THREE.MathUtils.lerp(
          smoothEyeYRef.current,
          rawEyeY,
          1 - Math.exp(-yRate * dt)
        );
      }

      let eyeY = smoothEyeYRef.current;
      const baseOriginY = rawTarget.current.y + 0.08;

      ray.origin = { x: rawTarget.current.x, y: baseOriginY, z: rawTarget.current.z };
      ray.dir = { x: 0, y: 1, z: 0 };
      const ceilingHit = world.castRay(
        ray,
        0.44,
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

      const fwdX = -sinYaw;
      const fwdZ = -cosYaw;
      ray.origin = { x: rawTarget.current.x, y: eyeY, z: rawTarget.current.z };
      ray.dir = { x: fwdX, y: 0, z: fwdZ };
      const wallHit = world.castRay(
        ray,
        0.26,
        true,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        undefined,
        rayFilter
      );
      let forwardOffset = 0.06;
      if (wallHit && wallHit.timeOfImpact > 0.01) {
        forwardOffset = Math.min(forwardOffset, Math.max(0, wallHit.timeOfImpact - 0.18));
      }

      desiredCamPos.current.set(
        rawTarget.current.x + fwdX * forwardOffset,
        eyeY,
        rawTarget.current.z + fwdZ * forwardOffset
      );

      const shake = targetSource.getShakeIntensity();
      if (shake > 0.01) {
        desiredCamPos.current.y -= Math.min(0.018, shake * 0.02);
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

    // Third-person views (close shoulder & wide elevated) with multi-probe wall + ceiling protection
    const preset = THIRD_PERSON_PRESETS[mode];
    const desiredDist = mode === 'thirdPersonClose' ? closeDistRef.current : wideDistRef.current;

    rawTarget.current.y += preset.pivotHeight;
    if (!initialized.current) {
      smoothTarget.current.copy(rawTarget.current);
      initialized.current = true;
    } else {
      smoothTarget.current.lerp(rawTarget.current, 1 - Math.exp(-18 * dt));
    }

    rayDir.current.set(cosPitch * sinYaw, sinPitch, cosPitch * cosYaw).normalize();
    sideAxis.current.set(cosYaw, 0, -sinYaw);

    let safeDist = desiredDist;
    const castLen = desiredDist + 0.35;
    const probeOffsets: readonly [number, number][] = [
      [0, 0],
      [0.2, 0.05],
      [-0.2, 0.05],
      [0, 0.22],
    ];

    ray.dir = { x: rayDir.current.x, y: rayDir.current.y, z: rayDir.current.z };
    for (const [lat, up] of probeOffsets) {
      ray.origin = {
        x: smoothTarget.current.x + sideAxis.current.x * lat,
        y: smoothTarget.current.y + up,
        z: smoothTarget.current.z + sideAxis.current.z * lat,
      };
      const hit = world.castRay(
        ray,
        castLen,
        true,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        undefined,
        rayFilter
      );
      if (hit && hit.timeOfImpact > 0.05) {
        safeDist = Math.min(safeDist, Math.max(preset.minSafeDist, hit.timeOfImpact - 0.32));
      }
    }

    const distRate = safeDist < actualDistRef.current ? 24 : 7;
    actualDistRef.current = THREE.MathUtils.lerp(
      actualDistRef.current,
      safeDist,
      1 - Math.exp(-distRate * dt)
    );

    desiredCamPos.current
      .copy(smoothTarget.current)
      .addScaledVector(rayDir.current, actualDistRef.current);

    ray.origin = {
      x: desiredCamPos.current.x,
      y: Math.min(desiredCamPos.current.y, smoothTarget.current.y + 0.35),
      z: desiredCamPos.current.z,
    };
    ray.dir = { x: 0, y: 1, z: 0 };
    const roofHit = world.castRay(
      ray,
      Math.max(0.25, desiredCamPos.current.y - ray.origin.y + 0.25),
      true,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      undefined,
      rayFilter
    );
    if (roofHit && roofHit.timeOfImpact > 0.05) {
      const maxSafeY = ray.origin.y + roofHit.timeOfImpact - 0.16;
      if (desiredCamPos.current.y > maxSafeY) {
        desiredCamPos.current.y = maxSafeY;
      }
    }

    camera.up.set(0, 1, 0);
    camera.position.copy(desiredCamPos.current);
    lookTarget.current.copy(smoothTarget.current);
    lookTarget.current.y += preset.lookOffsetY;
    camera.lookAt(lookTarget.current);
  });

  return null;
}
