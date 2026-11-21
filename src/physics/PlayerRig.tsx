import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAfterPhysicsStep, useBeforePhysicsStep, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { Ecctrl, type EcctrlHandle } from 'ecctrl';
import * as THREE from 'three';
import { playSpark, playSuccessChime, playWeldClank, playWireSnap, setEngineHum } from '../audio/sfxEngine';
import { buildCharacterAppearance } from '../character/characterCustomization';
import { DustPuffPool, type DustPuffHandle } from '../character/DustPuffPool';
import { InventorCharacter, type CharacterAnimData } from '../character/InventorCharacter';
import { CHARACTER_DIMENSIONS } from '../config/visualConfig';
import { playerInput, useKeyboardInput, type PlayerInputSnapshot } from '../controls/playerInput';
import type { CameraTargetSource } from '../controls/ThirdPersonCamera';
import { captureCartBlueprint, restoreCartBlueprint } from '../invention/cartBlueprints';
import {
  DRUM_STAND_ORIGIN,
  FREE_BUILD_ORIGIN,
  WORKSHOP_ORIGIN,
  WORKSHOP_PARTS,
  WORKSHOP_SLOTS,
  WorkshopAssembly,
  customRootId,
  isCustomStation,
  isRideableMount,
  workshopMarkerOffset,
  workshopPartTypeForKind,
  type WorkshopSlot,
  type WorkshopStation,
} from '../invention/workshopAssembly';
import { createWorkshopPhysics, getWorkshopSlotPose, LEVEL_ROTATION } from '../invention/workshopPhysics';
import {
  PART_LOGIC_SPECS,
  clearPendingWire,
  contraptionGraph,
  cycleTimerPeriod,
  disconnectAllWires,
  getWiredEngineSignal,
  getMotorDirection,
  invertMotorNode,
  isPartWired,
  pulseActuator,
  resetContraptionGraph,
  setTimerPeriod,
  stepContraptionLogic,
  stepWireConnection,
  toggleSwitchNode,
} from '../logic/contraptionRegistry';
import {
  listBlueprints,
  readBlueprintFromUrl,
  saveBlueprint,
  type ContraptionBlueprint,
} from '../logic/blueprintManager';
import { arenaAndBridgeStore, BRIDGE_SPAN_Z_MAX, BRIDGE_SPAN_Z_MIN } from '../modes/arenaAndBridge';
import { BOWLING_BARREL_IDS, contractStore } from '../modes/contracts';
import { isInTowerNutReach } from '../modes/towerMirador';
import { buildToolsLocked, gameModeStore } from '../modes/gameModes';
import { multiplayerStore } from '../multiplayer/multiplayerStore';
import { rotatedHalfHeight, rotatedSupportDistance, wrenchStep, WRENCH_STEP, type WrenchAxis } from '../invention/wrenchRotation';
import { wrenchMarkerScore, WRENCH_REACH } from '../invention/wrenchTargeting';
import {
  CARRY_PROFILES,
  grabbableRegistry,
  type GrabbableEntry,
  type GrabbableKind,
} from '../props/grabbableRegistry';
import { gameStore, useGameStore } from '../state/gameStore';

interface PlayerRigProps {
  maxDustPuffs: number;
  resetSignal: number;
  cameraSourceRef: React.MutableRefObject<CameraTargetSource>;
  cartBodyRef: React.RefObject<RapierRigidBody | null>;
  enabled?: boolean;
  teleportTarget?: [number, number, number] | null;
}

const SPAWN_POS: [number, number, number] = [-0.6, 1.15, 4.2];
const ENABLED_ROTATIONS: [boolean, boolean, boolean] = [false, true, false];
const BEAM_UP = new THREE.Vector3(0, 1, 0);
const WHEEL_AXIS = new THREE.Vector3(1, 0, 0);
const ZERO = { x: 0, y: 0, z: 0 };
const UP = new THREE.Vector3(0, 1, 0);
const SEAT_LOGIC_KEYS = { KeyW: false, KeyS: false, Space: false };
const EXIT_OFFSETS = [[2.1, 0], [-2.1, 0], [0, -2.0], [0, 2.0], [1.5, 1.5], [-1.5, 1.5]] as const;

export function PlayerRig({
  maxDustPuffs,
  resetSignal,
  cameraSourceRef,
  cartBodyRef,
  enabled = true,
  teleportTarget = null,
}: PlayerRigProps) {
  useKeyboardInput();
  const ecctrlRef = useRef<EcctrlHandle>(null);
  const visualCenterRef = useRef<THREE.Group>(null);
  const carryAnchorRef = useRef<THREE.Group | null>(null);
  const wrenchTipRef = useRef<THREE.Group>(null);
  const wrenchBeamRef = useRef<THREE.Mesh>(null);
  const wrenchDotRef = useRef<THREE.Mesh>(null);
  const wrenchBeamMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const wrenchDotMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const wrenchStart = useRef(new THREE.Vector3());
  const wrenchAim = useRef(new THREE.Vector3());
  const wrenchDirection = useRef(new THREE.Vector3());
  const wrenchCameraPos = useRef(new THREE.Vector3());
  const wrenchMarker = useRef(new THREE.Vector3());
  const wrenchMarkerDirection = useRef(new THREE.Vector3());
  const wrenchPlacedPosition = useRef(new THREE.Vector3());
  const wrenchPlacedRotation = useRef(new THREE.Quaternion());
  const partAxis = useRef(new THREE.Vector3());
  const partRotation = useRef(new THREE.Quaternion());
  const dustPoolRef = useRef<DustPuffHandle>(null);
  const cameraMode = useGameStore((s) => s.cameraMode);
  const wrenchEquipped = useGameStore((s) => s.wrenchEquipped);
  const characterConfig = useGameStore((s) => s.characterConfig);
  const activeEmote = useGameStore((s) => s.activeEmote);
  const customAppearance = useMemo(
    () => buildCharacterAppearance(characterConfig),
    [characterConfig]
  );
  const { camera } = useThree();
  const { rapier, world } = useRapier();
  const [workshop] = useState(() => new WorkshopAssembly());
  // Rapier owns these joints for the lifetime of the scene. Fast Refresh reruns effects
  // even though the scene and its rigid bodies are still alive.
  const [workshopPhysics] = useState(() => createWorkshopPhysics({ world, rapier }, getWiredEngineSignal, getMotorDirection));
  const seatedIdRef = useRef<string | null>(null);
  const lastCustomStationRef = useRef<WorkshopStation | null>(null);
  const lastIntactBlueprintRef = useRef<ContraptionBlueprint | null>(null);
  const sharedLoadedRef = useRef(false);
  const prevCartSpeedRef = useRef(0);
  const weldBreakCooldownRef = useRef(0);
  const seated = useGameStore((s) => s.seated);
  const seatOffset = useRef(new THREE.Vector3());
  const seatRotation = useRef(new THREE.Quaternion());
  const seatForward = useRef(new THREE.Vector3());
  const engineAudible = useRef(false);
  const lastEngineIntensityRef = useRef(-1);
  const processedReset = useRef(resetSignal);
  const workshopTime = useRef(0);
  const nextPoseTime = useRef(0);

  const leaveSeat = (ctrl: EcctrlHandle, position: { x: number; y: number; z: number }) => {
    seatedIdRef.current = null;
    ctrl.body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    ctrl.body.setTranslation(position, true);
    ctrl.body.setLinvel(ZERO, true);
    ctrl.body.setAngvel(ZERO, true);
    // Ecctrl deja la gravedad en 0 cuando pisa suelo y no la actualiza mientras va sentado:
    // al bajar en el aire el personaje quedaba flotando.
    ctrl.body.setGravityScale(1, true);
    ctrl.collider.setSensor(false);
    ctrl.collider.setEnabled(true);
    for (let i = 0; i < ctrl.body.numColliders(); i++) {
      ctrl.body.collider(i).setSensor(false);
      ctrl.body.collider(i).setEnabled(true);
    }
    world.propagateModifiedBodyPositionsToColliders();
    ctrl.body.wakeUp();
    playerInput.resetAll();
    gameStore.setSeated(false);
  };

  const seatLocalOffset = (kind: GrabbableKind): readonly [number, number, number] => {
    if (kind === 'woodBarrel') return [0, 0.56, 0.04];
    if (kind === 'crate') return [0, 0.42, 0.04];
    if (kind === 'chassis') return [0, 0.34, 0.04];
    return [0, 0.28, 0.06];
  };

  const enterSeat = (
    ctrl: EcctrlHandle,
    pickupId: string,
    entry: GrabbableEntry,
    station: WorkshopStation,
  ) => {
    if ((station === 'cart' || isCustomStation(station)) && contractStore.getState().brokenWeldsCount === 0) {
      const snap = captureCartBlueprint('Último armado', workshop, workshopPhysics, contraptionGraph, station);
      if (snap) {
        lastIntactBlueprintRef.current = snap;
        contractStore.setBrokenWelds(0, true);
      }
    }
    if (isCustomStation(station)) lastCustomStationRef.current = station;
    prevCartSpeedRef.current = 0;
    seatedIdRef.current = pickupId;
    inputSnapshotRef.current.forward = false;
    inputSnapshotRef.current.backward = false;
    inputSnapshotRef.current.leftward = false;
    inputSnapshotRef.current.rightward = false;
    inputSnapshotRef.current.jump = false;
    inputSnapshotRef.current.run = false;
    inputSnapshotRef.current.joystick.x = 0;
    inputSnapshotRef.current.joystick.y = 0;
    ctrl.setMovement(inputSnapshotRef.current);
    ctrl.body.setLinvel(ZERO, true);
    ctrl.body.setAngvel(ZERO, true);
    ctrl.collider.setSensor(true);
    ctrl.collider.setEnabled(false);
    for (let i = 0; i < ctrl.body.numColliders(); i++) {
      ctrl.body.collider(i).setSensor(true);
      ctrl.body.collider(i).setEnabled(false);
    }
    const [ox, oy, oz] = seatLocalOffset(entry.kind);
    const seatBody = entry.getBody();
    if (seatBody?.isValid()) {
      const rotation = seatRotation.current.copy(seatBody.rotation());
      const offset = seatOffset.current.set(ox, oy, oz).applyQuaternion(rotation).add(seatBody.translation());
      ctrl.body.setTranslation(offset, true);
      const forward = seatForward.current.set(0, 0, 1).applyQuaternion(rotation);
      if (Math.hypot(forward.x, forward.z) > 0.01) {
        rotation.setFromAxisAngle(UP, Math.atan2(forward.x, forward.z));
        ctrl.body.setRotation(rotation, true);
      }
      ctrl.body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      ctrl.body.setNextKinematicTranslation(offset);
      if (Math.hypot(forward.x, forward.z) > 0.01) {
        ctrl.body.setNextKinematicRotation(rotation);
      }
      // Un cuerpo dormido no actualiza su modelo visual: despertarlo para que el personaje suba con el vehículo.
      ctrl.body.wakeUp();
    } else {
      ctrl.body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
    }
    playerInput.resetTouchAndActions();
    clearPendingWire();
    grabbableRegistry.highlightedId = null;
    gameStore.setNearbyTarget(null, null, false, false);
    gameStore.setWorkshopSlot(null);
    if (wrenchBeamRef.current) wrenchBeamRef.current.visible = false;
    if (wrenchDotRef.current) wrenchDotRef.current.visible = false;
    const isFlight = workshop.hasFlightPropulsion(station) || workshop.hasGyro(station);
    gameStore.setSeated(true, isFlight);
    if (!workshopPhysics.isReleased(station)) {
      const rootId = customRootId(station);
      const root = rootId ? grabbableRegistry.getById(rootId)?.getBody() ?? null : cartBodyRef.current;
      if (root) workshopPhysics.toggleAssembly(station, root, workshop, true);
    }
  };

  useEffect(() => () => setEngineHum(false), []);

  useBeforePhysicsStep((physicsWorld) => {
    const dt = physicsWorld.timestep;
    workshopTime.current += dt;
    const seatId = seatedIdRef.current;
    const station = seatId ? workshop.stationOf(seatId) : undefined;
    const seatEntry = seatId ? grabbableRegistry.getById(seatId) : undefined;
    const seatBody = seatEntry?.getBody() ?? null;
    const ctrl = ecctrlRef.current;
    const keys = playerInput.keys;
    const touch = playerInput.touch;
    const throttle = station && enabled
      ? touch.joystickY || Number(keys.forward) - Number(keys.backward)
      : 0;
    SEAT_LOGIC_KEYS.KeyW = throttle > 0.05;
    SEAT_LOGIC_KEYS.KeyS = throttle < -0.05;
    SEAT_LOGIC_KEYS.Space = Boolean(station && enabled && (keys.jump || touch.jump));
    const descend = Boolean(station && enabled && (keys.run || touch.descend));
    const isFreeFlyer = Boolean(station && !workshop.hasWheels(station));
    stepContraptionLogic(
      dt,
      SEAT_LOGIC_KEYS,
      workshopPhysics.isDrivenWheel,
      station && SEAT_LOGIC_KEYS.Space ? workshop.idsOnStation(station) : undefined,
      (id) => workshop.isMounted(id),
      (id) => {
        const partStation = workshop.stationOf(id);
        if (!partStation) return false;
        // Nunca aplicar fuerzas de globos/alas/cohetes sobre creaciones fijas en el taller
        if (partStation !== 'drum' && !workshopPhysics.isReleased(partStation)) return true;
        // Las creaciones sin ruedas con vuelo libre las gobierna stabilizeAndFlyAssembly
        if (isCustomStation(partStation) && !workshop.hasWheels(partStation)) return true;
        return isFreeFlyer && partStation === station;
      },
    );
    const active = workshopPhysics.updateMotors(workshop, station ? { station, throttle } : undefined);
    if (!active) {
      if (engineAudible.current) {
        engineAudible.current = false;
        lastEngineIntensityRef.current = -1;
        setEngineHum(false);
      }
    } else {
      const soundRootId = station ? customRootId(station) : undefined;
      const soundBody = soundRootId ? grabbableRegistry.getById(soundRootId)?.getBody() : cartBodyRef.current;
      const cartVel = soundBody?.isValid() ? soundBody.linvel() : ZERO;
      const spd = Math.hypot(cartVel.x, cartVel.z);
      const intensity = THREE.MathUtils.clamp(
        0.25 + Math.abs(throttle) * 0.4 + Math.min(spd / 12, 1) * 0.35,
        0.2,
        1
      );
      if (!engineAudible.current || Math.abs(intensity - lastEngineIntensityRef.current) > 0.04) {
        engineAudible.current = true;
        lastEngineIntensityRef.current = intensity;
        setEngineHum(true, intensity);
      }
    }
    workshopPhysics.stepRunning(cartBodyRef.current, workshopTime.current);
    if (!seatId || !ctrl?.body) return;
    if (!station || !seatBody?.isValid()) {
      leaveSeat(ctrl, { x: SPAWN_POS[0], y: SPAWN_POS[1], z: SPAWN_POS[2] });
      return;
    }
    const rootId = customRootId(station);
    const root = rootId ? grabbableRegistry.getById(rootId)?.getBody() ?? null : cartBodyRef.current;
    const steer = enabled ? touch.joystickX || Number(keys.rightward) - Number(keys.leftward) : 0;
    if (!isFreeFlyer) {
      workshopPhysics.driveAssembly(station, root, throttle, dt, workshop, seatBody);
      workshopPhysics.steerAssembly(station, root, steer, dt, seatBody, workshop);
    }
    workshopPhysics.stabilizeAndFlyAssembly(
      station,
      root,
      { throttle, steer, ascend: SEAT_LOGIC_KEYS.Space, descend },
      dt,
      workshop,
      seatBody,
    );
    if (ctrl.body.bodyType() !== rapier.RigidBodyType.KinematicPositionBased) {
      ctrl.body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
    }
    for (let i = 0; i < ctrl.body.numColliders(); i++) {
      const col = ctrl.body.collider(i);
      if (!col.isSensor()) col.setSensor(true);
      if (col.isEnabled()) col.setEnabled(false);
    }
    const rotation = seatRotation.current.copy(seatBody.rotation());
    const [ox, oy, oz] = seatLocalOffset(seatEntry?.kind ?? 'seat');
    const offset = seatOffset.current.set(ox, oy, oz).applyQuaternion(rotation).add(seatBody.translation());
    // Posición directa además de la cinemática: si el cuerpo no quedó en modo cinemático
    // (p. ej. tras un cambio de tipo pendiente) el personaje se quedaba en el suelo mientras el vehículo volaba.
    ctrl.body.setTranslation(offset, true);
    ctrl.body.setLinvel(ZERO, true);
    ctrl.body.setNextKinematicTranslation(offset);
    const forward = seatForward.current.set(0, 0, 1).applyQuaternion(rotation);
    if (Math.hypot(forward.x, forward.z) > 0.01) {
      ctrl.body.setNextKinematicRotation(rotation.setFromAxisAngle(UP, Math.atan2(forward.x, forward.z)));
    }
  });

  const animDataRef = useRef<CharacterAnimData>({
    speed: 0,
    verticalSpeed: 0,
    isOnGround: true,
    isMoving: false,
    isRunning: false,
    isCarrying: false,
    carriedKind: null,
    carryDist: 0.72,
    carryLift: -0.04,
    accelForward: 0,
    turnRate: 0,
    takeoffImpulse: 0,
    landImpulse: 0,
    bumpImpulse: 0,
    dropBlockedImpulse: 0,
  });

  const inputSnapshotRef = useRef<PlayerInputSnapshot>({
    forward: false,
    backward: false,
    leftward: false,
    rightward: false,
    jump: false,
    run: false,
    joystick: { x: 0, y: 0 },
  });

  const wasOnGround = useRef(true);
  const prevHorizSpeed = useRef(0);
  const prevMinVerticalSpeed = useRef(0);
  const prevForwardVel = useRef(0);
  const prevYaw = useRef(0);
  const shakeRef = useRef(0);
  const bumpCooldown = useRef(0);
  const carriedIdRef = useRef<string | null>(null);
  const carriedKindRef = useRef<GrabbableKind | null>(null);
  const carriedRotationRef = useRef(new THREE.Quaternion());
  const previousCarryRotation = useRef(new THREE.Quaternion());
  const wrenchStepQuat = useRef(new THREE.Quaternion());
  const smoothCarryDistRef = useRef(0.72);
  const smoothCarryLiftRef = useRef(-0.04);
  const lastSafeYawRef = useRef(0);
  const resolvedDistRef = useRef(0.72);
  const resolvedLiftRef = useRef(-0.04);
  const safeVisualYawRef = useRef<number | null>(null);

  // Reusable scratch objects (zero per-frame allocations)
  const scratchPlayerPos = useRef(new THREE.Vector3());
  const scratchVisualPos = useRef(new THREE.Vector3());
  const scratchForward = useRef(new THREE.Vector3());
  const scratchCamFwd = useRef(new THREE.Vector3());
  const scratchCamRight = useRef(new THREE.Vector3());
  const scratchItemPos = useRef(new THREE.Vector3());
  const scratchToItem = useRef(new THREE.Vector3());
  const scratchRayDir = useRef(new THREE.Vector3());
  const scratchDropQuat = useRef(new THREE.Quaternion());
  const scratchShapeQuat = useRef(new THREE.Quaternion());
  const scratchBodyQuat = useRef(new THREE.Quaternion());
  const scratchPostFwd = useRef(new THREE.Vector3());
  const scratchWheelOffsetQuat = useRef(
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2))
  );
  const scratchDropEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const scratchCandDir = useRef(new THREE.Vector3());
  const dropRayRef = useRef<InstanceType<typeof rapier.Ray> | null>(null);
  const dropShapesRef = useRef<{
    crate: InstanceType<typeof rapier.Cuboid>;
    wheel: InstanceType<typeof rapier.Cylinder>;
    canister: InstanceType<typeof rapier.Cylinder>;
    part: InstanceType<typeof rapier.Cuboid>;
    battery: InstanceType<typeof rapier.Cuboid>;
    woodBarrel: InstanceType<typeof rapier.Cylinder>;
    wing: InstanceType<typeof rapier.Cuboid>;
    headlight: InstanceType<typeof rapier.Cuboid>;
    seat: InstanceType<typeof rapier.Cuboid>;
    thruster: InstanceType<typeof rapier.Cylinder>;
    chassis: InstanceType<typeof rapier.Cuboid>;
    cargoRack: InstanceType<typeof rapier.Cuboid>;
    logicAnd: InstanceType<typeof rapier.Cuboid>;
    timerBox: InstanceType<typeof rapier.Cuboid>;
    switchBox: InstanceType<typeof rapier.Cuboid>;
    magnet: InstanceType<typeof rapier.Cuboid>;
    spring: InstanceType<typeof rapier.Cylinder>;
    balloon: InstanceType<typeof rapier.Cylinder>;
    fan: InstanceType<typeof rapier.Cylinder>;
    horn: InstanceType<typeof rapier.Cuboid>;
    gyro: InstanceType<typeof rapier.Cuboid>;
    sweepBall: InstanceType<typeof rapier.Ball>;
  } | null>(null);

  // Wire up camera target source when active
  useEffect(() => {
    if (!enabled) return;
    cameraSourceRef.current = {
      getTargetPosition(out: THREE.Vector3) {
        if (visualCenterRef.current) {
          visualCenterRef.current.getWorldPosition(out);
          return true;
        }
        const ctrl = ecctrlRef.current;
        if (!ctrl) return false;
        const b = ctrl.body;
        if (b) {
          const t = b.translation();
          out.set(t.x, t.y, t.z);
        } else {
          out.copy(ctrl.currPos);
        }
        return true;
      },
      getExcludedBodyHandle() {
        return ecctrlRef.current?.body?.handle ?? null;
      },
      getVehicleForward(out: THREE.Vector3) {
        const seatId = seatedIdRef.current;
        if (!seatId) return false;
        const station = workshop.stationOf(seatId);
        const rootId = station ? customRootId(station) : undefined;
        const root = rootId ? grabbableRegistry.getById(rootId)?.getBody() : cartBodyRef.current;
        const body = root?.isValid() ? root : grabbableRegistry.getById(seatId)?.getBody();
        if (!body?.isValid()) return false;
        const r = body.rotation();
        scratchBodyQuat.current.set(r.x, r.y, r.z, r.w);
        out.set(0, 0, 1).applyQuaternion(scratchBodyQuat.current).setY(0);
        if (out.lengthSq() < 1e-4) return false;
        out.normalize();
        return true;
      },
      isExcludedBody(handle: number) {
        if (handle === ecctrlRef.current?.body?.handle) return true;
        const seatId = seatedIdRef.current;
        if (!seatId) return false;
        const st = workshop.stationOf(seatId);
        if (!st) return false;
        if (st === 'cart' && handle === cartBodyRef.current?.handle) return true;
        const rootId = customRootId(st);
        if (rootId && grabbableRegistry.getById(rootId)?.getBody()?.handle === handle) {
          return true;
        }
        for (const { id } of workshop.partsAt(st)) {
          if (grabbableRegistry.getById(id)?.getBody()?.handle === handle) {
            return true;
          }
        }
        return false;
      },
      getShakeIntensity() {
        return shakeRef.current;
      },
    };
  }, [cameraSourceRef, cartBodyRef, enabled, workshop]);

  // Teleport character safely when exiting vehicle or moving between modes
  useEffect(() => {
    if (!teleportTarget || !ecctrlRef.current?.body) return;
    const b = ecctrlRef.current.body;
    b.setTranslation({ x: teleportTarget[0], y: teleportTarget[1], z: teleportTarget[2] }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }, [teleportTarget]);

  // Reset player position & drop any carried prop when reset is triggered
  useEffect(() => {
    if (processedReset.current === resetSignal) return;
    processedReset.current = resetSignal;
    playerInput.resetAll();
    const cart = cartBodyRef.current;
    workshopPhysics.reset(cart);
    if (cart) {
      const [x, y, z] = WORKSHOP_ORIGIN;
      cart.setTranslation({ x, y, z }, true);
    }
    workshop.reset();
    resetContraptionGraph();
    lastCustomStationRef.current = null;
    lastIntactBlueprintRef.current = null;
    prevCartSpeedRef.current = 0;
    weldBreakCooldownRef.current = 0;
    contractStore.setBrokenWelds(0, false);
    arenaAndBridgeStore.reset();
    gameModeStore.resetRun();
    gameStore.setWorkshopSlot(null);
    gameStore.setWorkshopStatus(null);
    gameStore.setCartMode(null);
    gameStore.setCanUndoMount(false);
    gameStore.setLaserInteraction(null, null, false);
    gameStore.setWireHint(null);
    carriedRotationRef.current.identity();
    const ctrl = ecctrlRef.current;
    if (!ctrl || !ctrl.body) return;

    if (carriedIdRef.current) {
      const entry = grabbableRegistry.getById(carriedIdRef.current);
      const body = entry?.getBody();
      const col = entry?.getCollider();
      if (body && col) {
        col.setSensor(false);
        col.setEnabled(true);
        body.setEnabled(true);
        body.setBodyType(rapier.RigidBodyType.Dynamic, true);
      }
      carriedIdRef.current = null;
      carriedKindRef.current = null;
      grabbableRegistry.carriedId = null;
      gameStore.setCarried(null, null);
    }

    const spawn = { x: SPAWN_POS[0], y: SPAWN_POS[1], z: SPAWN_POS[2] };
    if (seatedIdRef.current) leaveSeat(ctrl, spawn);
    else ctrl.body.setTranslation(spawn, true);
    ctrl.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ctrl.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }, [resetSignal, rapier, workshop, workshopPhysics, cartBodyRef]);

  const ensureVolumeShapes = () => {
    if (!dropShapesRef.current) {
      const logicBox = new rapier.Cuboid(0.2, 0.16, 0.2);
      dropShapesRef.current = {
        crate: new rapier.Cuboid(0.34, 0.31, 0.34),
        wheel: new rapier.Cylinder(0.16, 0.4),
        canister: new rapier.Cylinder(0.39, 0.24),
        part: new rapier.Cuboid(0.29, 0.24, 0.24),
        battery: new rapier.Cuboid(0.29, 0.24, 0.24),
        woodBarrel: new rapier.Cylinder(0.49, 0.38),
        wing: new rapier.Cuboid(0.59, 0.085, 0.26),
        headlight: new rapier.Cuboid(0.17, 0.18, 0.17),
        seat: new rapier.Cuboid(0.27, 0.34, 0.28),
        thruster: new rapier.Cylinder(0.37, 0.18),
        chassis: new rapier.Cuboid(0.55, 0.08, 0.95),
        cargoRack: new rapier.Cuboid(0.46, 0.12, 0.36),
        logicAnd: logicBox,
        timerBox: logicBox,
        switchBox: logicBox,
        magnet: new rapier.Cuboid(0.24, 0.18, 0.24),
        spring: new rapier.Cylinder(0.24, 0.2),
        balloon: new rapier.Cylinder(0.36, 0.3),
        fan: new rapier.Cylinder(0.18, 0.28),
        horn: new rapier.Cuboid(0.2, 0.18, 0.26),
        gyro: new rapier.Cuboid(0.22, 0.22, 0.22),
        sweepBall: new rapier.Ball(0.16),
      };
    }
    if (!dropRayRef.current) {
      dropRayRef.current = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    }
    return dropShapesRef.current;
  };

  const carryOrientation = (yaw: number, tilt: number) => {
    scratchDropEuler.current.set(tilt, yaw, 0);
    return scratchDropQuat.current.setFromEuler(scratchDropEuler.current).multiply(carriedRotationRef.current);
  };

  const isCarryPoseClear = (
    px: number,
    py: number,
    pz: number,
    yaw: number,
    dist: number,
    lift: number,
    kind: GrabbableKind,
    ctrlBody: NonNullable<EcctrlHandle['body']>,
    carriedBodyHandle: number | null
  ): { clear: boolean; hitNormalX: number; hitNormalZ: number } => {
    const shapes = ensureVolumeShapes();
    const volumeShape = shapes[kind];
    const sweepBall = shapes.sweepBall;
    const profile = CARRY_PROFILES[kind];

    const dirX = Math.sin(yaw);
    const dirZ = Math.cos(yaw);
    const chestY = py - 0.08 + lift;
    const targetX = px + dirX * dist;
    const targetZ = pz + dirZ * dist;

    // 1. Continuous path check from player center out to target so object never crosses through a wall
    const pathHit = world.castShape(
      { x: px, y: chestY, z: pz },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: dirX, y: 0, z: dirZ },
      sweepBall,
      0,
      dist,
      true,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      ctrlBody,
      (collider) => {
        const parent = collider.parent();
        return parent ? parent.handle !== carriedBodyHandle : true;
      }
    );
    if (pathHit) {
      return {
        clear: false,
        hitNormalX: pathHit.normal1.x,
        hitNormalZ: pathHit.normal1.z,
      };
    }

    // 2. Full-volume intersection check at target pose
    carryOrientation(yaw, profile.tiltX);
    if (kind === 'wheel') {
      scratchShapeQuat.current
        .copy(scratchDropQuat.current)
        .multiply(scratchWheelOffsetQuat.current);
    } else {
      scratchShapeQuat.current.copy(scratchDropQuat.current);
    }

    const hitCollider = world.intersectionWithShape(
      { x: targetX, y: chestY, z: targetZ },
      {
        x: scratchShapeQuat.current.x,
        y: scratchShapeQuat.current.y,
        z: scratchShapeQuat.current.z,
        w: scratchShapeQuat.current.w,
      },
      volumeShape,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      ctrlBody,
      (collider) => {
        const parent = collider.parent();
        return parent ? parent.handle !== carriedBodyHandle : true;
      }
    );

    if (hitCollider) {
      // Recover true surface normal of the obstructed wall so sliding & backing out stay free
      const perpX = dirZ;
      const perpZ = -dirX;
      const maxRay = dist + profile.dropRadius + 0.35;
      const ray = dropRayRef.current!;
      ray.dir = { x: dirX, y: 0, z: dirZ };
      const offsets = [0, 0.22, -0.22];
      for (const lat of offsets) {
        ray.origin = { x: px + perpX * lat, y: chestY, z: pz + perpZ * lat };
        const nHit = world.castRayAndGetNormal(
          ray,
          maxRay,
          true,
          rapier.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined,
          undefined,
          ctrlBody,
          (collider) => {
            const parent = collider.parent();
            return parent ? parent.handle !== carriedBodyHandle : true;
          }
        );
        if (nHit && Math.hypot(nHit.normal.x, nHit.normal.z) > 0.25) {
          return { clear: false, hitNormalX: nHit.normal.x, hitNormalZ: nHit.normal.z };
        }
      }
      return { clear: false, hitNormalX: -dirX, hitNormalZ: -dirZ };
    }
    return { clear: true, hitNormalX: 0, hitNormalZ: 0 };
  };

  const findClearCarryAdjust = (
    px: number,
    py: number,
    pz: number,
    yaw: number,
    kind: GrabbableKind,
    ctrlBody: NonNullable<EcctrlHandle['body']>,
    carriedBodyHandle: number | null
  ): { dist: number; lift: number; hitNormalX: number; hitNormalZ: number } | null => {
    const profile = CARRY_PROFILES[kind];
    // Strict carry bounds within arm reach (never stretches upward away from hands)
    const minTuck = Math.max(0.46, CHARACTER_DIMENSIONS.capsuleRadius + 0.14);
    const midTuck = (minTuck + profile.holdDistance) * 0.5;
    const emergencyTuck = Math.max(0.42, CHARACTER_DIMENSIONS.capsuleRadius + 0.1);
    const adjustments: readonly [number, number][] = [
      [profile.holdDistance, profile.holdHeight],
      [midTuck, profile.holdHeight],
      [minTuck, profile.holdHeight],
      [minTuck, profile.holdHeight + 0.08],
      [minTuck, profile.holdHeight + 0.16],
      [minTuck, profile.holdHeight - 0.06],
      [emergencyTuck, profile.holdHeight],
    ];

    for (const [dist, lift] of adjustments) {
      const res = isCarryPoseClear(px, py, pz, yaw, dist, lift, kind, ctrlBody, carriedBodyHandle);
      if (res.clear) {
        return { dist, lift, hitNormalX: 0, hitNormalZ: 0 };
      }
    }
    return null;
  };

  const clearCarriedItem = () => {
    carriedIdRef.current = null;
    carriedKindRef.current = null;
    grabbableRegistry.carriedId = null;
    carriedRotationRef.current.identity();
    gameStore.setCarried(null, null);
  };

  const rotateCarriedItem = (axis: WrenchAxis, direction: number, ctrl: EcctrlHandle) => {
    const id = carriedIdRef.current;
    const kind = carriedKindRef.current;
    if (!id || !kind || !ctrl.body) return;
    const carriedBody = grabbableRegistry.getById(id)?.getBody();
    const { x, y, z } = ctrl.body.translation();
    const yaw = safeVisualYawRef.current ?? Math.atan2(ctrl.bodyZAxis.x, ctrl.bodyZAxis.z);
    const offset = carriedRotationRef.current;
    previousCarryRotation.current.copy(offset);
    for (const angleFraction of [0.5, 1]) {
      offset.copy(previousCarryRotation.current)
        .multiply(wrenchStep(wrenchStepQuat.current, axis, direction * angleFraction))
        .normalize();
      if (!isCarryPoseClear(x, y, z, yaw, smoothCarryDistRef.current, smoothCarryLiftRef.current, kind, ctrl.body, carriedBody?.handle ?? null).clear) {
        offset.copy(previousCarryRotation.current);
        gameStore.triggerDropBlocked('rotate');
        return;
      }
    }
    gameStore.triggerRotatingTarget(id);
  };

  const rotateAimedItem = (id: string, axis: WrenchAxis, direction: number) => {
    const entry = grabbableRegistry.getById(id);
    const body = entry?.getBody();
    const collider = entry?.getCollider();
    if (!entry || !body || !collider || workshop.isMounted(id)) return;
    const shape = collider.shape;
    if (!(shape instanceof rapier.Cylinder || shape instanceof rapier.Cuboid)) return;
    const origin = body.translation();
    const oldRotation = scratchBodyQuat.current.copy(body.rotation());
    scratchShapeQuat.current.copy(collider.rotation());
    const oldHeight = rotatedHalfHeight(shape, scratchShapeQuat.current);
    for (const fraction of [0.5, 1]) {
      scratchDropQuat.current.copy(oldRotation).multiply(wrenchStep(wrenchStepQuat.current, axis, direction * fraction));
      scratchShapeQuat.current.copy(scratchDropQuat.current);
      if (entry.kind === 'wheel') scratchShapeQuat.current.multiply(scratchWheelOffsetQuat.current);
      scratchItemPos.current.set(origin.x, origin.y + rotatedHalfHeight(shape, scratchShapeQuat.current) - oldHeight + 0.012, origin.z);
      if (world.intersectionWithShape(scratchItemPos.current, scratchShapeQuat.current, shape,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, collider, body)) {
        gameStore.triggerDropBlocked('rotate');
        return;
      }
    }
    gameStore.triggerRotatingTarget(id);
    body.setRotation(scratchDropQuat.current, true);
    body.setTranslation(scratchItemPos.current, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  };

  const castWrenchBeam = (ctrlBody: NonNullable<EcctrlHandle['body']>) => {
    const tip = wrenchTipRef.current;
    const beam = wrenchBeamRef.current;
    const dot = wrenchDotRef.current;
    if (!tip || !beam || !dot) return null;
    ensureVolumeShapes();
    const ray = dropRayRef.current!;
    const start = tip.getWorldPosition(wrenchStart.current);
    const end = wrenchAim.current;
    const cameraPosition = camera.getWorldPosition(wrenchCameraPos.current);
    const cameraDirection = camera.getWorldDirection(wrenchDirection.current);
    const budget = cameraPosition.distanceTo(start) + WRENCH_REACH;
    ray.origin = cameraPosition;
    ray.dir = cameraDirection;
    const seen = world.castRay(ray, budget, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, ctrlBody);
    end.copy(cameraPosition).addScaledVector(cameraDirection, seen ? seen.timeOfImpact + 0.025 : budget);
    const direction = wrenchDirection.current.subVectors(end, start);
    const maxDistance = Math.min(WRENCH_REACH, direction.length());
    if (maxDistance < 0.01) {
      beam.visible = false;
      dot.visible = false;
      return null;
    }
    direction.normalize();
    ray.origin = start;
    ray.dir = direction;
    const hit = world.castRayAndGetNormal(ray, maxDistance, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, ctrlBody);
    const length = hit?.timeOfImpact ?? maxDistance;
    beam.visible = length > 0.01;
    beam.position.copy(start).addScaledVector(direction, length * 0.5);
    beam.scale.y = length;
    beam.quaternion.setFromUnitVectors(BEAM_UP, direction);
    dot.visible = Boolean(hit) && beam.visible;
    dot.position.copy(start).addScaledVector(direction, length);
    return hit;
  };

  const findAimedSlot = (hitDistance: number, cart: RapierRigidBody | null, ctrlBody: RapierRigidBody) => {
    const ray = dropRayRef.current!;
    let bestSlot: WorkshopSlot | null = null;
    let bestScore = Infinity;
    for (const slot of WORKSHOP_SLOTS) {
      if (slot.station === 'cart' && !cart) continue;
      const pose = getWorkshopSlotPose(slot, cart);
      const rootRotation = slot.station === 'cart' && cart ? cart.rotation() : LEVEL_ROTATION;
      const marker = wrenchMarker.current.set(...workshopMarkerOffset(slot))
        .applyQuaternion(scratchShapeQuat.current.copy(rootRotation)).add(pose.position);
      const score = wrenchMarkerScore(wrenchStart.current, wrenchDirection.current, marker, hitDistance);
      if (score >= bestScore) continue;

      const direction = wrenchMarkerDirection.current.subVectors(marker, wrenchStart.current);
      const distance = direction.length();
      ray.origin = wrenchStart.current;
      ray.dir = direction.normalize();
      if (world.castRay(ray, Math.max(0, distance - 0.04), true,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, ctrlBody)) continue;
      bestSlot = slot;
      bestScore = score;
    }
    return bestSlot;
  };

  const alignWeldAxle = (hit: { normal: { x: number; y: number; z: number } }, parent: RapierRigidBody,
    type: ReturnType<typeof workshopPartTypeForKind>) => {
    if (type !== 'wheel' && type !== 'drum') return undefined;
    const orientation = partRotation.current.copy(parent.rotation());
    const axis = partAxis.current.copy(type === 'wheel' ? WHEEL_AXIS : BEAM_UP).applyQuaternion(orientation);
    const alignment = axis.dot(hit.normal);
    if (Math.abs(alignment) > 0.985) return axis;
    if (type !== 'wheel' || Math.abs(hit.normal.y) >= 0.45) return undefined;
    axis.copy(hit.normal).normalize();
    if (alignment < -0.001 || (Math.abs(alignment) <= 0.001 && axis.dot(scratchCandDir.current.set(0, 0, 1).applyQuaternion(orientation)) < 0)) {
      axis.negate();
    }
    orientation.setFromUnitVectors(WHEEL_AXIS, axis);
    return axis;
  };

  const prepareLaserPlacement = (
    hit: NonNullable<ReturnType<typeof world.castRayAndGetNormal>>,
    alignedRotation?: THREE.Quaternion,
  ) => {
    const id = carriedIdRef.current;
    const entry = id ? grabbableRegistry.getById(id) : undefined;
    const body = entry?.getBody();
    const collider = entry?.getCollider();
    if (!entry || !body || !collider || hit.timeOfImpact < 0.08) return false;
    const shape = collider.shape;
    if (!(shape instanceof rapier.Cuboid || shape instanceof rapier.Cylinder)) return false;
    const normal = wrenchMarkerDirection.current.copy(hit.normal);
    if (normal.lengthSq() < 0.5) return false;
    normal.normalize();
    const rotation = wrenchPlacedRotation.current.copy(alignedRotation ?? grabbableRegistry.carriedVisualQuat);
    const shapeRotation = scratchShapeQuat.current.copy(rotation);
    if (entry.kind === 'wheel') shapeRotation.multiply(scratchWheelOffsetQuat.current);
    const clearance = alignedRotation ? 0.02 : 0.045;
    const offset = rotatedSupportDistance(shape, shapeRotation, normal) + clearance;
    const position = wrenchPlacedPosition.current.copy(wrenchStart.current)
      .addScaledVector(wrenchDirection.current, hit.timeOfImpact).addScaledVector(normal, offset);
    return !world.intersectionWithShape(position, shapeRotation, shape,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, collider, body);
  };

  const finishDrop = (
    body: RapierRigidBody, collider: RapierCollider,
    position: { x: number; y: number; z: number }, rotation: THREE.Quaternion,
    velocity: { x: number; y: number; z: number }
  ) => {
    body.setTranslation(position, true);
    body.setRotation(rotation, true);
    body.setLinvel(velocity, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    collider.setSensor(false);
    collider.setEnabled(true);
    body.setEnabled(true);
    body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    body.wakeUp();
    grabbableRegistry.carriedVisualPos.copy(position);
    grabbableRegistry.carriedVisualQuat.copy(rotation);
    clearCarriedItem();
  };

  const mountCarriedItem = (slot: WorkshopSlot) => {
    const id = carriedIdRef.current;
    const entry = id ? grabbableRegistry.getById(id) : null;
    const body = entry?.getBody();
    const collider = entry?.getCollider();
    const type = entry ? WORKSHOP_PARTS[entry.kind] : undefined;
    if (!id || !body || !collider || !type) return;

    const cart = cartBodyRef.current;
    const { position, rotation } = getWorkshopSlotPose(slot, cart);
    const shapeRotation = slot.type === 'wheel'
      ? scratchShapeQuat.current.copy(rotation).multiply(scratchWheelOffsetQuat.current)
      : rotation;
    const obstruction = world.intersectionWithShape(
      position,
      shapeRotation,
      collider.shape,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      collider,
      body
    );
    if (obstruction) {
      gameStore.triggerDropBlocked('mount');
      return;
    }
    if (!workshop.mount(id, slot, type)) return;
    if (type === 'engine') {
      dustPoolRef.current?.spawnBurst(position.x, position.y + 0.2, position.z, 'spark');
    }

    body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    body.setTranslation(position, true);
    body.setRotation(rotation, true);
    collider.setSensor(false);
    collider.setEnabled(true);
    body.setEnabled(true);
    workshopPhysics.attach(id, slot, body, cart);
    playWeldClank();
    workshopPhysics.updateMotors(workshop);
    const visual = entry?.getVisualGroup();
    if (visual) {
      const { x, y, z } = position;
      visual.position.set(x, y, z);
      visual.quaternion.copy(rotation);
    }
    gameStore.setWorkshopSlot(null);
    gameStore.setCanUndoMount(workshop.canUndo());
    clearCarriedItem();
  };

  const mountCarriedItemOnPart = (
    parentId: string,
    parentBody: RapierRigidBody,
    axle?: THREE.Vector3,
  ) => {
    const id = carriedIdRef.current;
    const entry = id ? grabbableRegistry.getById(id) : null;
    const body = entry?.getBody();
    const collider = entry?.getCollider();
    if (!id || !entry || !body || !collider) return;

    const mountType = workshopPartTypeForKind(entry.kind);
    const parentEntry = parentId === '__cart__' ? undefined : grabbableRegistry.getById(parentId);
    const parentType = parentEntry ? workshopPartTypeForKind(parentEntry.kind) : 'fixture';
    const axis = axle ? { x: axle.x, y: axle.y, z: axle.z } : undefined;
    const station = parentId === '__cart__' ? 'cart' : workshop.stationOf(parentId);
    if (station && workshopPhysics.isReleased(station)) return;
    const mount = parentId === '__cart__'
      ? workshop.mountFreeOnCart(id, mountType, axis)
      : workshop.mountOnPart(id, parentId, mountType, axis, parentType);
    if (!mount) return;
    if (isCustomStation(mount.station)) {
      lastCustomStationRef.current = mount.station;
      if (!workshopPhysics.isReleased(mount.station)) {
        const rootId = customRootId(mount.station);
        const root = rootId ? grabbableRegistry.getById(rootId)?.getBody() : null;
        if (root?.isValid() && root.isDynamic()) workshopPhysics.fixCustomRoot(root);
      }
    }

    const position = wrenchPlacedPosition.current;
    const rotation = wrenchPlacedRotation.current;
    if (mountType === 'engine') {
      dustPoolRef.current?.spawnBurst(position.x, position.y + 0.2, position.z, 'spark');
    }
    body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    body.setTranslation(position, true);
    body.setRotation(rotation, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    collider.setSensor(false);
    collider.setEnabled(true);
    body.setEnabled(true);
    workshopPhysics.attachOnPart(id, mount, body, parentBody, position, rotation, axis);
    playWeldClank();
    workshopPhysics.updateMotors(workshop);
    const visual = entry.getVisualGroup();
    if (visual) {
      visual.position.set(position.x, position.y, position.z);
      visual.quaternion.copy(rotation);
    }
    gameStore.setWorkshopSlot(null);
    gameStore.setCanUndoMount(workshop.canUndo());
    clearCarriedItem();
  };

  const dropCarriedItem = () => {
    const carriedId = carriedIdRef.current;
    const carriedKind = carriedKindRef.current ?? 'crate';
    if (!carriedId) return;
    const entry = grabbableRegistry.getById(carriedId);
    const body = entry?.getBody();
    const col = entry?.getCollider();
    const ctrl = ecctrlRef.current;

    if (!body || !col || !ctrl || !ctrl.body) {
      clearCarriedItem();
      return;
    }

    const shapes = ensureVolumeShapes();

    const profile = CARRY_PROFILES[carriedKind];
    const volumeShape = shapes[carriedKind];
    scratchPlayerPos.current.copy(ctrl.currPos);
    scratchForward.current.copy(ctrl.bodyZAxis).setY(0).normalize();
    if (scratchForward.current.lengthSq() < 0.01) {
      scratchForward.current.set(0, 0, 1);
    }

    const baseYaw = Math.atan2(scratchForward.current.x, scratchForward.current.z);
    const hasCustomRotation = Math.abs(carriedRotationRef.current.w) < 0.999999;
    const objectYaw = safeVisualYawRef.current ?? baseYaw;
    const dropTilt = hasCustomRotation ? profile.tiltX : 0;
    scratchShapeQuat.current.copy(carryOrientation(objectYaw, dropTilt));
    if (carriedKind === 'wheel') scratchShapeQuat.current.multiply(scratchWheelOffsetQuat.current);
    const halfHeight = hasCustomRotation ? rotatedHalfHeight(volumeShape, scratchShapeQuat.current) : profile.dropHalfExtents[1];
    // Guarantee radial separation outside player's 0.32m capsule + object's footprint
    const minHorizDist = CHARACTER_DIMENSIONS.capsuleRadius + profile.dropRadius + 0.16;
    const primaryDist = Math.max(profile.holdDistance + 0.12, minHorizDist);
    const playerFeetY =
      scratchPlayerPos.current.y -
      CHARACTER_DIMENSIONS.capsuleHalfHeight -
      CHARACTER_DIMENSIONS.capsuleRadius;

    // Candidate offsets: (yawAngleOffset, distance, extraHeightAboveFeet)
    const candidates: readonly [number, number, number][] = [
      [0, primaryDist, halfHeight + 0.06],
      [0, primaryDist, halfHeight + 0.38],
      [0, primaryDist, halfHeight + 0.72],
      [0, primaryDist + 0.34, halfHeight + 0.06],
      [0.58, primaryDist, halfHeight + 0.06],
      [-0.58, primaryDist, halfHeight + 0.06],
      [0.58, primaryDist, halfHeight + 0.42],
      [-0.58, primaryDist, halfHeight + 0.42],
      [1.25, primaryDist, halfHeight + 0.08],
      [-1.25, primaryDist, halfHeight + 0.08],
      [Math.PI, primaryDist, halfHeight + 0.08],
    ];

    const ray = dropRayRef.current!;
    const sweepBall = shapes.sweepBall;
    let foundPose: { x: number; y: number; z: number; q: THREE.Quaternion } | null = null;

    for (const [yawOffset, dist, heightAboveFeet] of candidates) {
      const candYaw = baseYaw + yawOffset;
      scratchCandDir.current.set(Math.sin(candYaw), 0, Math.cos(candYaw));

      const candX = scratchPlayerPos.current.x + scratchCandDir.current.x * dist;
      let candY = playerFeetY + heightAboveFeet;
      const candZ = scratchPlayerPos.current.z + scratchCandDir.current.z * dist;

      // 1. Check line-of-sight from player chest to candidate spot so we never drop through a wall
      const chestY = scratchPlayerPos.current.y + 0.25;
      const toCandX = candX - scratchPlayerPos.current.x;
      const toCandY = candY - chestY;
      const toCandZ = candZ - scratchPlayerPos.current.z;
      const toCandLen = Math.hypot(toCandX, toCandY, toCandZ);

      if (toCandLen > 0.05) {
        const losHit = world.castShape(
          { x: scratchPlayerPos.current.x, y: chestY, z: scratchPlayerPos.current.z },
          { x: 0, y: 0, z: 0, w: 1 },
          { x: toCandX / toCandLen, y: toCandY / toCandLen, z: toCandZ / toCandLen },
          sweepBall,
          0,
          toCandLen,
          true,
          rapier.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined,
          undefined,
          ctrl.body,
          (collider) => collider.parent()?.handle !== body.handle
        );
        if (losHit) {
          continue;
        }
      }

      // 2. Check ground beneath candidate spot so object is never placed overlapping below floor
      ray.origin.x = candX;
      ray.origin.y = candY + 0.4;
      ray.origin.z = candZ;
      ray.dir.x = 0;
      ray.dir.y = -1;
      ray.dir.z = 0;
      const groundHit = world.castRay(
        ray,
        3.2,
        true,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        ctrl.body,
        (collider) => collider.parent()?.handle !== body.handle
      );
      if (!groundHit) {
        continue;
      }
      const surfaceY = ray.origin.y - groundHit.timeOfImpact;
      if (candY < surfaceY + halfHeight + 0.04) {
        candY = surfaceY + halfHeight + 0.05;
      }

      // 3. Full-volume intersection test against ALL colliders INCLUDING player capsule!
      carryOrientation(hasCustomRotation ? objectYaw : candYaw, dropTilt);
      if (carriedKind === 'wheel') {
        scratchShapeQuat.current
          .copy(scratchDropQuat.current)
          .multiply(scratchWheelOffsetQuat.current);
      } else {
        scratchShapeQuat.current.copy(scratchDropQuat.current);
      }

      const overlapping = world.intersectionWithShape(
        { x: candX, y: candY, z: candZ },
        {
          x: scratchShapeQuat.current.x,
          y: scratchShapeQuat.current.y,
          z: scratchShapeQuat.current.z,
          w: scratchShapeQuat.current.w,
        },
        volumeShape,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        undefined,
        (collider) => collider.parent()?.handle !== body.handle
      );

      if (!overlapping) {
        foundPose = { x: candX, y: candY, z: candZ, q: scratchDropQuat.current.clone() };
        break;
      }
    }

    if (!foundPose) {
      // No free non-overlapping volume available: keep holding and alert player briefly
      animDataRef.current.dropBlockedImpulse = 1;
      gameStore.triggerDropBlocked();
      return;
    }

    // Gentle drop velocity: NO automatic launch! Cap horizontal carry-over speed cleanly.
    const gentleVx = THREE.MathUtils.clamp(ctrl.currLinVel.x * 0.15, -0.65, 0.65);
    const gentleVz = THREE.MathUtils.clamp(ctrl.currLinVel.z * 0.15, -0.65, 0.65);

    finishDrop(body, col, foundPose, foundPose.q, { x: gentleVx, y: -0.05, z: gentleVz });
  };

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const ctrl = ecctrlRef.current;
    if (!ctrl || !ctrl.body) return;

    const clearedExtras = gameStore.clearExtraParts(({ id }) => {
      if (workshop.isMounted(id) || workshop.idsOnStation(`custom:${id}`).length > 0) return false;
      for (const node of contraptionGraph.getNodes()) {
        if (node.bodyId === id) contraptionGraph.removeNode(node.id);
      }
      return true;
    });
    if (clearedExtras !== undefined) {
      gameStore.setWireHint(clearedExtras > 0 ? 'Piezas extra sueltas retiradas' : 'Las piezas extra están en uso');
    }

    if (enabled && !sharedLoadedRef.current && cartBodyRef.current?.isValid()) {
      sharedLoadedRef.current = true;
      const shared = readBlueprintFromUrl();
      if (shared) {
        const error = restoreCartBlueprint(
          shared,
          cartBodyRef.current,
          workshop,
          workshopPhysics,
          contraptionGraph,
          { world, rapier },
          new Set()
        );
        if (!error) {
          lastIntactBlueprintRef.current = shared;
          lastCustomStationRef.current = shared.rootPartId ? `custom:${shared.rootPartId}` : null;
          contractStore.setBrokenWelds(0, true);
          clearPendingWire();
          gameStore.setCanUndoMount(workshop.canUndo());
          playWeldClank();
          gameStore.setWireHint(`Plano compartido cargado · ${shared.name}`);
        } else {
          gameStore.setWireHint(error);
        }
      }
    }

    const blueprintAction = playerInput.consumeBlueprintAction();
    if (blueprintAction && enabled) {
      const cart = cartBodyRef.current;
      if (!cart?.isValid() || seatedIdRef.current || carriedIdRef.current) {
        gameStore.setWireHint('Bajá del asiento y liberá las manos para usar planos');
      } else if (blueprintAction.type === 'save') {
        const hasCart = !workshop.partsAt('cart').next().done;
        const customStations = workshop.customStations();
        const preferredCustom =
          lastCustomStationRef.current && customStations.includes(lastCustomStationRef.current)
            ? lastCustomStationRef.current
            : customStations[0];
        const saveStation: WorkshopStation =
          gameStore.getState().activeStationType === 'custom' && preferredCustom
            ? preferredCustom
            : hasCart
              ? 'cart'
              : (preferredCustom ?? 'cart');
        const blueprint = captureCartBlueprint(
          blueprintAction.name,
          workshop,
          workshopPhysics,
          contraptionGraph,
          saveStation,
        );
        if (blueprint) {
          saveBlueprint(blueprint);
          gameStore.setWireHint(listBlueprints().some((plan) => plan.id === blueprint.id)
            ? `Plano guardado · ${blueprint.name}` : 'El navegador no pudo guardar el plano');
          gameStore.refreshBlueprints();
        } else {
          gameStore.setWireHint('Montá una pieza en el carrito o creá un invento libre para guardar un plano');
        }
      } else {
        const unavailableIds = new Set(gameStore.getState().inventorySlots.flatMap((item) => item ? [item.id] : []));
        const error = restoreCartBlueprint(blueprintAction.blueprint, cart, workshop, workshopPhysics,
          contraptionGraph, { world, rapier }, unavailableIds);
        if (!error) {
          lastIntactBlueprintRef.current = blueprintAction.blueprint;
          lastCustomStationRef.current = blueprintAction.blueprint.rootPartId
            ? `custom:${blueprintAction.blueprint.rootPartId}`
            : null;
          contractStore.setBrokenWelds(0, true);
          clearPendingWire();
          gameStore.setCanUndoMount(workshop.canUndo());
          playWeldClank();
        }
        gameStore.setWireHint(error ?? `Plano cargado · ${blueprintAction.blueprint.name}`);
      }
    }

    const cartAction = enabled ? playerInput.consumeCartAction() : null;
    if (cartAction === 'repair') {
      const cart = cartBodyRef.current;
      const blueprint = lastIntactBlueprintRef.current;
      if (!cart?.isValid() || !blueprint) {
        gameStore.setWireHint('Todavía no hay un armado para reparar');
      } else if (carriedIdRef.current) {
        gameStore.setWireHint('Dejá la pieza que llevás para reparar');
      } else {
        const invSlots = gameStore.getState().inventorySlots;
        const blueprintPartIds = new Set(blueprint.parts.map((part) => part.partId));
        const unavailableIds = new Set(invSlots.flatMap((item) => item ? [item.id] : []));
        const retrieve = new Set([...unavailableIds].filter((id) => blueprintPartIds.has(id)));
        const repairPoint = blueprint.rootPartId ? FREE_BUILD_ORIGIN : WORKSHOP_ORIGIN;
        const error = restoreCartBlueprint(blueprint, cart, workshop, workshopPhysics, contraptionGraph,
          { world, rapier }, unavailableIds, repairPoint, retrieve);
        if (error) {
          gameStore.setWireHint(error);
        } else {
          invSlots.forEach((item, index) => {
            if (item && retrieve.has(item.id)) gameStore.removeInventory(index);
          });
          if (seatedIdRef.current) leaveSeat(ctrl, { x: SPAWN_POS[0], y: SPAWN_POS[1], z: SPAWN_POS[2] });
          lastCustomStationRef.current = blueprint.rootPartId ? `custom:${blueprint.rootPartId}` : null;
          clearPendingWire();
          gameStore.setCanUndoMount(workshop.canUndo());
          prevCartSpeedRef.current = 0;
          weldBreakCooldownRef.current = 0;
          contractStore.setBrokenWelds(0, true);
          playWeldClank();
          gameStore.setWireHint(blueprint.rootPartId ? 'Invento reparado en el taller' : 'Vehículo reparado en el taller');
        }
      }
      return;
    }

    if (seatedIdRef.current) {
      // Mientras va sentado, el modelo del personaje debe estar siempre sobre su cuerpo físico.
      // Si la librería no lo sincronizó (cuerpo dormido, cambio de tipo pendiente), lo colocamos a mano.
      if (ctrl.body.isSleeping()) ctrl.body.wakeUp();
      const modelRoot = visualCenterRef.current?.parent;
      if (modelRoot) {
        const bodyPos = ctrl.body.translation();
        const dx = modelRoot.position.x - bodyPos.x;
        const dy = modelRoot.position.y - bodyPos.y;
        const dz = modelRoot.position.z - bodyPos.z;
        if (dx * dx + dy * dy + dz * dz > 0.25) {
          modelRoot.position.set(bodyPos.x, bodyPos.y, bodyPos.z);
          modelRoot.updateMatrixWorld(true);
        }
      }
      if (!enabled) return;
      const seatBody = grabbableRegistry.getById(seatedIdRef.current)?.getBody();
      const cart = cartBodyRef.current;
      if (workshop.stationOf(seatedIdRef.current) === 'cart' && cart?.isValid() && workshopPhysics.isCartReleased()) {
        weldBreakCooldownRef.current = Math.max(0, weldBreakCooldownRef.current - dt);
        const lv = cart.linvel();
        const speed = Math.hypot(lv.x, lv.y, lv.z);
        if (
          prevCartSpeedRef.current - speed > 7.5 &&
          prevCartSpeedRef.current > 8.5 &&
          weldBreakCooldownRef.current <= 0
        ) {
          weldBreakCooldownRef.current = 1.2;
          const outerKinds = new Set([
            'wheel',
            'wing',
            'headlight',
            'thruster',
            'cargoRack',
            'magnet',
            'bumper',
            'stabilizer',
          ]);
          let victimId: string | null = null;
          let fallbackId: string | null = null;
          const mounts = Array.from(workshop.partsAt('cart'));
          const occupiedSeatChain = new Set<string>();
          let ancestor: string | undefined = seatedIdRef.current;
          while (ancestor && !occupiedSeatChain.has(ancestor)) {
            occupiedSeatChain.add(ancestor);
            ancestor = mounts.find((part) => part.id === ancestor)?.mount.parentId;
          }
          for (const { id } of mounts) {
            if (occupiedSeatChain.has(id)) continue;
            const kind = grabbableRegistry.getById(id)?.kind;
            if (kind && outerKinds.has(kind)) {
              victimId = id;
              break;
            }
            if (!fallbackId) fallbackId = id;
          }
          victimId = victimId ?? fallbackId;
          if (victimId) {
            const victimPos = grabbableRegistry.getById(victimId)?.getBody()?.translation();
            for (const remId of workshop.remove(victimId)) {
              workshopPhysics.detach(remId);
              const b = grabbableRegistry.getById(remId)?.getBody();
              if (b?.isValid()) {
                b.setBodyType(rapier.RigidBodyType.Dynamic, true);
                b.wakeUp();
              }
            }
            workshopPhysics.updateMotors(workshop);
            if (victimPos) {
              dustPoolRef.current?.spawnBurst(victimPos.x, victimPos.y + 0.2, victimPos.z, 'spark');
            }
            playSpark();
            contractStore.setBrokenWelds(
              contractStore.getState().brokenWeldsCount + 1,
              Boolean(lastIntactBlueprintRef.current)
            );
            gameStore.setWireHint('¡Choque fuerte! Se soltó una pieza · Tocá Reparar (1 clic)');
          }
        }
        prevCartSpeedRef.current = speed;
      } else {
        prevCartSpeedRef.current = 0;
      }

      const exit = playerInput.consumeInteract();
      if (exit) {
        if (!seatBody?.isValid()) return;
        const position = seatBody.translation();
        const rotation = seatRotation.current.copy(seatBody.rotation());
        for (const [x, z] of EXIT_OFFSETS) {
          const candidate = seatOffset.current.set(x, 0, z).applyQuaternion(rotation).add(position);
          candidate.y = position.y + 0.7;
          if (!world.intersectionWithShape(candidate, LEVEL_ROTATION, ctrl.collider.shape,
            rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, ctrl.body)) {
            leaveSeat(ctrl, candidate);
            return;
          }
        }
        gameStore.setWireHint('No hay espacio para bajar');
      }
      return;
    }

    if (!enabled) {
      inputSnapshotRef.current.forward = false;
      inputSnapshotRef.current.backward = false;
      inputSnapshotRef.current.leftward = false;
      inputSnapshotRef.current.rightward = false;
      inputSnapshotRef.current.jump = false;
      inputSnapshotRef.current.run = false;
      inputSnapshotRef.current.joystick.x = 0;
      inputSnapshotRef.current.joystick.y = 0;
      ctrl.setMovement(inputSnapshotRef.current);
      return;
    }

    const isFirstPerson = gameStore.getState().cameraMode === 'firstPerson';
    ctrl.setLockForward(isFirstPerson);

    // 1. Feed unified keyboard + touch input to Ecctrl (preventing only inward carry wall penetration)
    const inputSnapshot = inputSnapshotRef.current;
    playerInput.fillMovement(inputSnapshot);
    if (carriedIdRef.current && carriedKindRef.current) {
      inputSnapshot.run = false;

      const carriedEntry = grabbableRegistry.getById(carriedIdRef.current);
      const carriedBodyHandle = carriedEntry?.getBody()?.handle ?? null;
      const carryKind = carriedKindRef.current;
      const carryProf = CARRY_PROFILES[carryKind];
      const p = ctrl.currPos;
      const yawForMove = Math.atan2(ctrl.bodyZAxis.x, ctrl.bodyZAxis.z);

      camera.getWorldDirection(scratchCamFwd.current);
      scratchCamFwd.current.y = 0;
      if (scratchCamFwd.current.lengthSq() > 1e-6) {
        scratchCamFwd.current.normalize();
      } else {
        scratchCamFwd.current.set(0, 0, -1);
      }
      scratchCamRight.current.set(-scratchCamFwd.current.z, 0, scratchCamFwd.current.x);

      let rawRight =
        inputSnapshot.joystick.x !== 0 || inputSnapshot.joystick.y !== 0
          ? inputSnapshot.joystick.x
          : (inputSnapshot.rightward ? 1 : 0) - (inputSnapshot.leftward ? 1 : 0);
      let rawFwd =
        inputSnapshot.joystick.x !== 0 || inputSnapshot.joystick.y !== 0
          ? inputSnapshot.joystick.y
          : (inputSnapshot.forward ? 1 : 0) - (inputSnapshot.backward ? 1 : 0);
      const rawMag = Math.hypot(rawRight, rawFwd);
      if (rawMag > 1) {
        rawRight /= rawMag;
        rawFwd /= rawMag;
      }

      if (rawMag > 0.01) {
        let worldX = scratchCamRight.current.x * rawRight + scratchCamFwd.current.x * rawFwd;
        let worldZ = scratchCamRight.current.z * rawRight + scratchCamFwd.current.z * rawFwd;
        const stepLen = Math.hypot(worldX, worldZ);
        const dirX = worldX / stepLen;
        const dirZ = worldZ / stepLen;

        const aheadClear = findClearCarryAdjust(
          p.x + dirX * 0.14,
          p.y,
          p.z + dirZ * 0.14,
          yawForMove,
          carryKind,
          ctrl.body,
          carriedBodyHandle
        );
        if (!aheadClear) {
          const probeAhead = isCarryPoseClear(
            p.x + dirX * 0.14,
            p.y,
            p.z + dirZ * 0.14,
            yawForMove,
            Math.max(0.46, CHARACTER_DIMENSIONS.capsuleRadius + 0.14),
            carryProf.holdHeight,
            carryKind,
            ctrl.body,
            carriedBodyHandle
          );
          const nLen = Math.hypot(probeAhead.hitNormalX, probeAhead.hitNormalZ);
          if (nLen > 0.01) {
            const nx = probeAhead.hitNormalX / nLen;
            const nz = probeAhead.hitNormalZ / nLen;
            const inwardDot = worldX * nx + worldZ * nz;
            if (inwardDot < 0) {
              worldX -= inwardDot * nx;
              worldZ -= inwardDot * nz;
              const safeRight =
                worldX * scratchCamRight.current.x + worldZ * scratchCamRight.current.z;
              const safeFwd =
                worldX * scratchCamFwd.current.x + worldZ * scratchCamFwd.current.z;
              inputSnapshot.forward = false;
              inputSnapshot.backward = false;
              inputSnapshot.leftward = false;
              inputSnapshot.rightward = false;
              inputSnapshot.joystick.x = Math.hypot(safeRight, safeFwd) > 0.04 ? safeRight : 0;
              inputSnapshot.joystick.y = Math.hypot(safeRight, safeFwd) > 0.04 ? safeFwd : 0;
            }
          }
        }
      }
    }
    ctrl.setMovement(inputSnapshot);

    // 2. Decay camera shake & bump cooldown
    shakeRef.current = Math.max(0, shakeRef.current - dt * 3.8);
    bumpCooldown.current = Math.max(0, bumpCooldown.current - dt);

    // 3. Detect jump takeoff, landing impact, acceleration & turning rate
    const onGround = ctrl.isOnGround;
    const vertVel = ctrl.currLinVel.y;
    const horizSpeed = Math.hypot(ctrl.currLinVel.x, ctrl.currLinVel.z);

    scratchForward.current.copy(ctrl.bodyZAxis).setY(0).normalize();
    const forwardVel = ctrl.currLinVel.x * scratchForward.current.x + ctrl.currLinVel.z * scratchForward.current.z;
    const accelForward = dt > 0.001 ? (forwardVel - prevForwardVel.current) / dt : 0;
    prevForwardVel.current = forwardVel;

    const currYaw = Math.atan2(scratchForward.current.x, scratchForward.current.z);
    let deltaYaw = currYaw - prevYaw.current;
    if (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
    if (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
    const turnRate = dt > 0.001 ? deltaYaw / dt : 0;
    prevYaw.current = currYaw;

    if (!onGround) {
      prevMinVerticalSpeed.current = Math.min(prevMinVerticalSpeed.current, vertVel);
    }

    if (wasOnGround.current && !onGround && vertVel > 2.0) {
      animDataRef.current.takeoffImpulse = 0.85;
      dustPoolRef.current?.spawnBurst(ctrl.currPos.x, ctrl.currPos.y - 0.5, ctrl.currPos.z, 'dust');
    }

    if (!wasOnGround.current && onGround) {
      const impactStrength = THREE.MathUtils.clamp(Math.abs(prevMinVerticalSpeed.current) / 8.5, 0.3, 1.2);
      animDataRef.current.landImpulse = impactStrength;
      shakeRef.current = Math.max(shakeRef.current, impactStrength * 0.42);
      dustPoolRef.current?.spawnBurst(ctrl.currPos.x, ctrl.currPos.y - 0.52, ctrl.currPos.z, 'dust');
      if (impactStrength > 0.65) {
        gameStore.triggerImpact('land');
      }
      prevMinVerticalSpeed.current = 0;
    }

    // Sudden horizontal stop while moving fast = solid bump reaction!
    const speedDrop = prevHorizSpeed.current - horizSpeed;
    if (speedDrop > 2.7 && prevHorizSpeed.current > 3.2 && bumpCooldown.current <= 0) {
      bumpCooldown.current = 0.55;
      animDataRef.current.bumpImpulse = 0.85;
      shakeRef.current = Math.max(shakeRef.current, 0.7);
      dustPoolRef.current?.spawnBurst(
        ctrl.currPos.x + ctrl.bodyZAxis.x * 0.35,
        ctrl.currPos.y + 0.1,
        ctrl.currPos.z + ctrl.bodyZAxis.z * 0.35,
        'spark'
      );
      gameStore.triggerImpact('bump');
    }

    wasOnGround.current = onGround;
    prevHorizSpeed.current = horizSpeed;

    // 4. Update procedural character animation data
    animDataRef.current.speed = horizSpeed;
    animDataRef.current.verticalSpeed = vertVel;
    animDataRef.current.isOnGround = onGround;
    animDataRef.current.isMoving = ctrl.isMoving;
    animDataRef.current.isRunning = inputSnapshot.run && !carriedIdRef.current;
    animDataRef.current.isCarrying = carriedIdRef.current !== null;
    animDataRef.current.carriedKind = carriedKindRef.current;
    animDataRef.current.accelForward = THREE.MathUtils.clamp(accelForward, -14, 14);
    animDataRef.current.turnRate = THREE.MathUtils.clamp(turnRate, -8, 8);

    // 5. Find best grabbable candidate when hands are free (unified reach + wall line-of-sight across all views)
    scratchPlayerPos.current.copy(ctrl.currPos);
    const inventoryAction = playerInput.consumeInventoryAction();
    let inventoryPickup: number | null = null;
    if (inventoryAction !== null) {
      const inventory = gameStore.getState();
      const index = inventoryAction === 'store' ? inventory.inventorySelection : inventoryAction;
      if (inventoryAction !== 'store') gameStore.selectInventory(index);
      const id = carriedIdRef.current;
      const kind = carriedKindRef.current;
      if (id && kind && (inventoryAction === 'store' || !inventory.inventorySlots[index])) {
        if (isPartWired(id)) {
          gameStore.triggerDropBlocked('wired');
        } else if (gameStore.storeInventory({ id, kind, rotation: carriedRotationRef.current.toArray() }, index, inventoryAction !== 'store')) {
          clearCarriedItem();
        } else {
          gameStore.triggerDropBlocked('inventory');
        }
      } else if (!id && inventoryAction !== 'store' && inventory.inventorySlots[index]) {
        if (inventory.inventorySlots[index]?.kind !== 'blueprint') {
          inventoryPickup = index;
        }
      }
    }
    const cart = cartBodyRef.current;
    const cartPosition = cart?.translation();
    const { x, z } = scratchPlayerPos.current;
    const cartDistanceSq = cartPosition ? (x - cartPosition.x) ** 2 + (z - cartPosition.z) ** 2 : Infinity;
    const drumDistanceSq = (x - DRUM_STAND_ORIGIN[0]) ** 2 + (z - DRUM_STAND_ORIGIN[2]) ** 2;
    const canUseCart = cartDistanceSq < 2.6 ** 2;
    const { wrenchEquipped: usingWrench, wrenchAiming: aiming, wrenchAxis } = gameStore.getState();
    const laserHit = aiming ? castWrenchBeam(ctrl.body) : null;
    const hitBody = laserHit?.collider.parent();
    const aimedId = (hitBody?.userData as { grabbableId?: string } | undefined)?.grabbableId;
    const aimedStation = aimedId ? workshop.stationOf(aimedId) : undefined;
    const aimedCustomRootId = aimedStation ? customRootId(aimedStation) : undefined;
    const aimedCustomRoot = aimedCustomRootId ? grabbableRegistry.getById(aimedCustomRootId)?.getBody() ?? null : null;
    const aimedBase = Boolean(
      (cart && hitBody && (hitBody.handle === cart.handle || aimedStation === 'cart')) ||
      (aimedStation && isCustomStation(aimedStation) && aimedCustomRoot)
    );
    const activeStation: WorkshopStation | null =
      aiming && aimedStation && isCustomStation(aimedStation) && aimedCustomRoot
        ? aimedStation
        : (canUseCart || (aiming && aimedStation === 'cart') || (aiming && cart && hitBody?.handle === cart.handle))
          ? (cart ? 'cart' : null)
          : (aimedStation && isCustomStation(aimedStation) && aimedCustomRoot ? aimedStation : null);
    const activeRoot = activeStation === 'cart' ? cart : activeStation ? aimedCustomRoot : null;
    if (activeStation && isCustomStation(activeStation)) {
      lastCustomStationRef.current = activeStation;
    }
    const aimedLoosePiece = aimedId && !workshop.isMounted(aimedId) ? aimedId : null;
    const canControlCart = Boolean(activeStation && activeRoot);
    gameStore.setWrenchTarget(aiming && aimedBase ? 'base' : aiming && aimedLoosePiece ? 'piece' : null);
    if (!aiming) {
      if (wrenchBeamRef.current) wrenchBeamRef.current.visible = false;
      if (wrenchDotRef.current) wrenchDotRef.current.visible = false;
    }
    if (cartAction === 'undo') {
      const lastId = workshop.popLastMounted();
      if (lastId) {
        for (const removedId of workshop.remove(lastId)) {
          workshopPhysics.detach(removedId);
          const remBody = grabbableRegistry.getById(removedId)?.getBody();
          if (remBody && remBody.isValid()) {
            if (remBody.bodyType() === rapier.RigidBodyType.Fixed) {
              remBody.setBodyType(rapier.RigidBodyType.Dynamic, true);
            }
            remBody.wakeUp();
          }
        }
        workshopPhysics.updateMotors(workshop);
        gameStore.setCanUndoMount(workshop.canUndo());
      }
    }
    const isRotateAction = cartAction === 'rotate' || cartAction === 'rotate-back';
    const rotatesPiece = isRotateAction && carriedIdRef.current !== null;
    const direction = cartAction === 'rotate-back' || cartAction === 'rotate-base-back' ? -1 : 1;
    if (rotatesPiece) rotateCarriedItem(wrenchAxis, direction, ctrl);
    if (usingWrench && isRotateAction && !rotatesPiece && aimedLoosePiece) {
      rotateAimedItem(aimedLoosePiece, wrenchAxis, direction);
    }
    const activeReleased = activeStation ? workshopPhysics.isReleased(activeStation) : false;
    if (canControlCart && activeStation && activeRoot && cartAction) {
      if (cartAction === 'toggle') {
        const wasReleased = workshopPhysics.isReleased(activeStation);
        workshopPhysics.toggleAssembly(activeStation, activeRoot, workshop);
        if ((activeStation === 'cart' || isCustomStation(activeStation)) && !wasReleased && workshopPhysics.isReleased(activeStation) &&
            contractStore.getState().brokenWeldsCount === 0) {
          const snap = captureCartBlueprint('Último armado', workshop, workshopPhysics, contraptionGraph, activeStation);
          if (snap) {
            lastIntactBlueprintRef.current = snap;
            contractStore.setBrokenWelds(0, true);
          }
        }
      }
      if (cartAction === 'push') workshopPhysics.pushAssembly(activeStation, activeRoot, scratchPlayerPos.current);
      const requestsBaseRotation = (isRotateAction && !rotatesPiece && (!aiming || aimedBase)) ||
        (usingWrench && (cartAction === 'rotate-base' || cartAction === 'rotate-base-back'));
      if (requestsBaseRotation && !activeReleased) {
        const step = usingWrench ? WRENCH_STEP : Math.PI / 4;
        if (!workshopPhysics.rotateAssembly(activeStation, activeRoot, step * direction)) gameStore.triggerDropBlocked('rotate');
      }
      if (!activeReleased && cartAction.startsWith('move-')) {
        const MOVE_STEP = 0.25;
        const fwd = scratchRayDir.current.copy(scratchCamFwd.current).setY(0);
        if (fwd.lengthSq() < 1e-4) fwd.copy(scratchForward.current).setY(0);
        fwd.normalize();
        const delta = { x: 0, y: 0, z: 0 };
        if (cartAction === 'move-fwd') { delta.x = fwd.x * MOVE_STEP; delta.z = fwd.z * MOVE_STEP; }
        else if (cartAction === 'move-back') { delta.x = -fwd.x * MOVE_STEP; delta.z = -fwd.z * MOVE_STEP; }
        else if (cartAction === 'move-right') { delta.x = -fwd.z * MOVE_STEP; delta.z = fwd.x * MOVE_STEP; }
        else if (cartAction === 'move-left') { delta.x = fwd.z * MOVE_STEP; delta.z = -fwd.x * MOVE_STEP; }
        else if (cartAction === 'move-up') { delta.y = MOVE_STEP; }
        else if (cartAction === 'move-down') { delta.y = -MOVE_STEP; }
        if (!workshopPhysics.moveAssembly(activeStation, activeRoot, delta)) gameStore.triggerDropBlocked('move');
      }
    }
    const cartReleased = workshopPhysics.isCartReleased();
    const assemblyReleased = activeStation ? workshopPhysics.isReleased(activeStation) : cartReleased;
    gameStore.setCartMode(
      canControlCart ? (assemblyReleased ? 'free' : 'fixed') : null,
      activeStation ? (activeStation === 'cart' ? 'cart' : 'custom') : null,
    );
    camera.getWorldDirection(scratchCamFwd.current);
    if (scratchCamFwd.current.lengthSq() > 1e-6) {
      scratchCamFwd.current.normalize();
    } else {
      scratchCamFwd.current.copy(scratchForward.current);
    }

    let bestId: string | null = null;
    let bestKind: GrabbableKind | null = null;
    let bestScore = Infinity;
    let mountSlot: WorkshopSlot | null = null;
    const carriedKind = carriedKindRef.current;
    const partType = carriedKind ? WORKSHOP_PARTS[carriedKind] : undefined;
    const aimedSlot = aiming && wrenchBeamRef.current?.visible
      ? findAimedSlot(laserHit?.timeOfImpact ?? WRENCH_REACH, cart, ctrl.body) : null;
    if (aimedSlot && partType && !(aimedSlot.station === 'cart' && cartReleased) && workshop.canMount(aimedSlot, partType)) {
      mountSlot = aimedSlot;
    }
    if (partType && !aiming) {
      ensureVolumeShapes();
      const ray = dropRayRef.current!;
      const playerPos = scratchPlayerPos.current;
      const eyeY = playerPos.y + 0.28;
      const facing = isFirstPerson ? scratchCamFwd.current : scratchForward.current;
      for (const slot of WORKSHOP_SLOTS) {
        if (slot.type !== partType) continue;
        if (slot.station === 'cart' && (!cart || cartReleased || cartDistanceSq >= 3.2 ** 2)) continue;
        const { x, y, z } = getWorkshopSlotPose(slot, cart).position;
        const toSlot = scratchRayDir.current.set(x - playerPos.x, y - eyeY, z - playerPos.z);
        const dist = toSlot.length();
        if (dist > (usingWrench ? 2.08 : 1.85) || dist < 0.1) continue;
        toSlot.divideScalar(dist);
        const aim = facing.dot(toSlot);
        const score = dist - aim;
        if (aim < (usingWrench ? 0.12 : 0.3) || score >= bestScore || !workshop.canMount(slot, partType)) continue;

        ray.origin = { x: playerPos.x, y: eyeY, z: playerPos.z };
        ray.dir = { x: toSlot.x, y: toSlot.y, z: toSlot.z };
        if (world.castRay(ray, dist - 0.06, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, ctrl.body)) continue;

        bestScore = score;
        mountSlot = slot;
      }
    }

    const hitCartFree = Boolean(cart && hitBody && hitBody.handle === cart.handle);
    const freeTargetId = aimedId ?? (hitCartFree ? '__cart__' : undefined);
    const aimedPartMount = Boolean(aiming && carriedKind && !aimedSlot && laserHit && hitBody && freeTargetId);
    const partMountType = carriedKind ? workshopPartTypeForKind(carriedKind) : null;
    const aimedPartStation = aimedId ? workshop.stationOf(aimedId) : hitCartFree ? 'cart' : undefined;
    const aimedPartReleased = Boolean(aimedPartStation && workshopPhysics.isReleased(aimedPartStation));
    const partMountAllowed = Boolean(
      aimedPartMount && freeTargetId && partMountType &&
      !aimedPartReleased &&
      (freeTargetId === '__cart__' || workshop.canMountOnPart(freeTargetId, partMountType))
    );
    const joinedAxle = partMountAllowed && laserHit && hitBody && partMountType
      ? alignWeldAxle(laserHit, hitBody, partMountType) : undefined;
    const partMountReady = Boolean(
      partMountAllowed && laserHit &&
      prepareLaserPlacement(laserHit, joinedAxle ? partRotation.current : undefined)
    );
    const placementReady = partMountReady || Boolean(
      aiming && carriedKind && !aimedSlot && !aimedPartMount && laserHit && prepareLaserPlacement(laserHit)
    );
    let laserHint: string | null = null;
    if (aimedSlot) laserHint = workshop.describeSlot(aimedSlot, cartReleased);
    else if (aimedPartMount && freeTargetId && partMountType) {
      if (freeTargetId === '__cart__') {
        laserHint = aimedPartReleased
          ? 'Fijá el carrito para soldar'
          : partMountReady
            ? (joinedAxle ? 'Soldar rueda libre' : 'Soldar al carrito')
            : 'Sin espacio en ese punto';
      } else {
        laserHint = partMountAllowed
          ? (partMountReady ? workshop.describePartMount(freeTargetId, partMountType, aimedPartReleased, Boolean(joinedAxle)) : 'Sin espacio en ese punto')
          : workshop.describePartMount(freeTargetId, partMountType, aimedPartReleased);
      }
    } else if (aiming && carriedKind && !placementReady) {
      laserHint = laserHit ? 'Sin espacio en ese punto' : 'Apuntá a una superficie al alcance';
    }
    gameStore.setLaserInteraction(aimedSlot?.id ?? null, laserHint, placementReady, partMountReady);
    if (wrenchBeamMatRef.current && wrenchDotMatRef.current) {
      if (partMountReady || Boolean(mountSlot)) {
        wrenchBeamMatRef.current.color.set('#ffe066');
        wrenchDotMatRef.current.color.set('#fff2a6');
      } else if (aiming && carriedKind && !placementReady) {
        wrenchBeamMatRef.current.color.set('#ff7b54');
        wrenchDotMatRef.current.color.set('#ff9e7d');
      } else {
        wrenchBeamMatRef.current.color.set('#82ffda');
        wrenchDotMatRef.current.color.set('#b7ffe7');
      }
    }

    if (!carriedIdRef.current && aiming && aimedId) {
      const entry = grabbableRegistry.getById(aimedId);
      const aimedSt = workshop.stationOf(aimedId);
      if (
        !(cartReleased && aimedSt === 'cart') ||
        (entry && isRideableMount(aimedId, entry.kind, workshop)) ||
        (aimedSt && isCustomStation(aimedSt))
      ) {
        bestId = entry?.id ?? null;
        bestKind = entry?.kind ?? null;
      }
    }

    if (!carriedIdRef.current && (!aiming || !aimedId)) {
      const shapesReady = ensureVolumeShapes();
      void shapesReady;
      const sightRay = dropRayRef.current!;
      const originY = scratchPlayerPos.current.y + (isFirstPerson ? 0.34 : 0.28);

      for (const item of grabbableRegistry.getAll()) {
        if (gameStore.getState().inventorySlots.some((stored) => stored?.id === item.id)) continue;
        const itemSt = workshop.stationOf(item.id);
        const itemRideable = isRideableMount(item.id, item.kind, workshop);
        if (aiming && !itemRideable) continue;
        if (cartReleased && itemSt === 'cart' && !itemRideable) continue;
        if (itemSt && isCustomStation(itemSt) && workshopPhysics.isReleased(itemSt) && !itemRideable) continue;
        if (!item.getWorldPos(scratchItemPos.current)) continue;
        scratchToItem.current.subVectors(scratchItemPos.current, scratchPlayerPos.current);
        const dist = scratchToItem.current.length();
        if (dist > (itemRideable ? 2.9 : 2.4)) continue;

        scratchRayDir.current.set(
          scratchItemPos.current.x - scratchPlayerPos.current.x,
          scratchItemPos.current.y - originY,
          scratchItemPos.current.z - scratchPlayerPos.current.z
        );
        const sightLen = scratchRayDir.current.length();
        if (sightLen < 0.01) continue;
        scratchRayDir.current.divideScalar(sightLen);

        let lookDot = 0;
        if (isFirstPerson) {
          if (itemRideable) {
            scratchCandDir.current.set(scratchRayDir.current.x, 0, scratchRayDir.current.z).normalize();
            lookDot = scratchForward.current.dot(scratchCandDir.current);
            if (dist > 1.8 && lookDot < 0) continue;
          } else {
            lookDot = scratchCamFwd.current.dot(scratchRayDir.current);
            if (lookDot < 0.1) continue;
          }
        } else {
          scratchCandDir.current.set(scratchToItem.current.x, 0, scratchToItem.current.z).normalize();
          lookDot = scratchForward.current.dot(scratchCandDir.current);
        }

        // Prevent grabbing through solid walls/obstacles in any view
        const itemBodyHandle = item.getBody()?.handle ?? null;
        if (sightLen > 0.22) {
          sightRay.origin = {
            x: scratchPlayerPos.current.x,
            y: originY,
            z: scratchPlayerPos.current.z,
          };
          sightRay.dir = {
            x: scratchRayDir.current.x,
            y: scratchRayDir.current.y,
            z: scratchRayDir.current.z,
          };
          const blocked = world.castRay(
            sightRay,
            sightLen - 0.14,
            true,
            rapier.QueryFilterFlags.EXCLUDE_SENSORS,
            undefined,
            undefined,
            ctrl.body,
            (collider) => {
              const parent = collider.parent();
              if (!parent) return true;
              if (itemBodyHandle !== null && parent.handle === itemBodyHandle) return false;
              if (itemRideable && itemSt === 'cart' && parent.handle === cart?.handle) return false;
              const colItemId = (parent.userData as { grabbableId?: string } | undefined)?.grabbableId;
              // Allow line of sight past other nearby loose grabbables (only solid walls/furniture block)
              return !colItemId;
            }
          );
          if (blocked) continue;
        }

        const weight = isFirstPerson ? 1.35 : 0.7;
        const score = dist - lookDot * weight - (itemRideable && dist <= 2.4 ? 1.25 : 0);
        if (score < bestScore) {
          bestScore = score;
          bestId = item.id;
          bestKind = item.kind;
        }
      }
    }

    grabbableRegistry.highlightedId = bestId;
    const bestRideable = Boolean(bestId && bestKind && isRideableMount(bestId, bestKind, workshop));
    gameStore.setNearbyTarget(bestId, bestKind, bestId !== null && workshop.isMounted(bestId), bestRideable);

    const actionTargetId = aimedId ?? bestId;
    if (playerInput.consumeWire()) {
      const result = stepWireConnection(actionTargetId);
      gameStore.setWireHint(result.message);
      if (result.status === 'connected' || result.status === 'disconnected') playWireSnap();
      if (result.status === 'connected') {
        setTimeout(() => playSpark(), 25);
        const pos = actionTargetId ? grabbableRegistry.getById(actionTargetId)?.getBody()?.translation() : null;
        if (pos) dustPoolRef.current?.spawnBurst(pos.x, pos.y + 0.2, pos.z, 'spark');
      }
    }

    const performLaserWeld = () => {
      if (aiming) {
        if (mountSlot) mountCarriedItem(mountSlot);
        else if (partMountReady && freeTargetId && hitBody) mountCarriedItemOnPart(freeTargetId, hitBody, joinedAxle);
      } else {
        ensureVolumeShapes();
        const ray = dropRayRef.current!;
        const camPos = camera.getWorldPosition(wrenchStart.current);
        const camDir = camera.getWorldDirection(wrenchDirection.current).normalize();
        ray.origin = camPos;
        ray.dir = camDir;
        const player = ctrl.body.translation();
        const reach = WRENCH_REACH + camPos.distanceTo(player);
        const directHit = world.castRayAndGetNormal(ray, reach, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, ctrl.body);
        const dBody = directHit?.collider.parent();
        const dGrabbable = (dBody?.userData as { grabbableId?: string } | undefined)?.grabbableId;
        const isCartHit = Boolean(cart && dBody && dBody.handle === cart.handle);
        const freeId = dGrabbable ?? (isCartHit ? '__cart__' : undefined);
        const inReach = directHit && wrenchAim.current.copy(camPos).addScaledVector(camDir, directHit.timeOfImpact)
          .distanceToSquared(player) <= WRENCH_REACH ** 2;
        const directSlot = partType ? findAimedSlot(directHit?.timeOfImpact ?? reach, cart, ctrl.body) : null;
        const directPose = directSlot ? getWorkshopSlotPose(directSlot, cart) : null;
        if (directSlot && directPose && partType && !workshopPhysics.isReleased(directSlot.station) &&
            scratchItemPos.current.copy(directPose.position).distanceToSquared(player) <= WRENCH_REACH ** 2 &&
            workshop.canMount(directSlot, partType)) {
          mountCarriedItem(directSlot);
        } else if (inReach && directHit && dBody && freeId && partMountType) {
          const weldAxle = alignWeldAxle(directHit, dBody, partMountType);
          if (prepareLaserPlacement(directHit, weldAxle ? partRotation.current : undefined)) {
            mountCarriedItemOnPart(freeId, dBody, weldAxle);
          }
        }
      }
      if (carriedIdRef.current) gameStore.triggerDropBlocked('mount');
      else {
        playSpark();
        gameStore.setWireHint('Pieza soldada');
      }
    };

    const partAction = playerInput.consumePartAction();
    if (partAction) {
      if ((partAction === 'weld' || partAction === 'smart-use') && carriedIdRef.current) {
        // En Entrega Delicada no hay soldadura libre: se arma por slots.
        if (!buildToolsLocked()) performLaserWeld();
      } else if (partAction === 'ride' && !carriedIdRef.current && actionTargetId) {
        const entry = grabbableRegistry.getById(actionTargetId);
        const targetStation = workshop.stationOf(actionTargetId);
        if (entry && targetStation && isRideableMount(actionTargetId, entry.kind, workshop)) {
          enterSeat(ctrl, actionTargetId, entry, targetStation);
          return;
        }
      } else if (partAction === 'smart-use' && !carriedIdRef.current && actionTargetId) {
        const entry = grabbableRegistry.getById(actionTargetId);
        const targetStation = workshop.stationOf(actionTargetId);
        if (entry && targetStation && isRideableMount(actionTargetId, entry.kind, workshop)) {
          enterSeat(ctrl, actionTargetId, entry, targetStation);
          return;
        } else if (entry?.kind === 'switchBox' || entry?.kind === 'crate') {
          const msg = toggleSwitchNode(actionTargetId);
          gameStore.setWireHint(msg);
          playWireSnap();
        } else if (entry) {
          const nodeKind = PART_LOGIC_SPECS[entry.kind]?.nodeKind;
          if (nodeKind === 'thruster' || nodeKind === 'light' || nodeKind === 'magnet' || nodeKind === 'piston') {
            gameStore.setWireHint(pulseActuator(actionTargetId));
            playSpark();
          }
        }
      } else if (actionTargetId) {
        let msg = '';
        if (partAction === 'toggle-switch') msg = toggleSwitchNode(actionTargetId);
        else if (partAction === 'timer-fast') msg = setTimerPeriod(actionTargetId, 0.6);
        else if (partAction === 'timer-med') msg = setTimerPeriod(actionTargetId, 1.4);
        else if (partAction === 'timer-slow') msg = setTimerPeriod(actionTargetId, 3.0);
        else if (partAction === 'cycle-timer') {
          const entry = grabbableRegistry.getById(actionTargetId);
          if (entry?.kind === 'timerBox') msg = cycleTimerPeriod(actionTargetId);
          else if (entry?.kind === 'wheel' || entry?.kind === 'part') msg = invertMotorNode(actionTargetId);
        } else if (partAction === 'test-pulse') { msg = pulseActuator(actionTargetId); playSpark(); }
        else if (partAction === 'invert-motor') msg = invertMotorNode(actionTargetId);
        else if (partAction === 'unwire') msg = disconnectAllWires(actionTargetId);
        if (msg) {
          gameStore.setWireHint(msg);
          playWireSnap();
        }
      }
    }
    gameStore.setWorkshopSlot(mountSlot?.id ?? null);
    gameStore.setWorkshopStatus(
      aiming && aimedBase && activeStation
        ? activeStation === 'cart' && cartReleased
          ? workshop.releasedCartStatus(getWiredEngineSignal)
          : workshop.status(activeStation, getWiredEngineSignal, workshopPhysics.isReleased(activeStation))
        : Math.min(cartDistanceSq, drumDistanceSq) < 3.1 ** 2
        ? cartDistanceSq < drumDistanceSq && cartReleased
          ? workshop.releasedCartStatus(getWiredEngineSignal)
          : workshop.status(cartDistanceSq < drumDistanceSq ? 'cart' : 'drum', getWiredEngineSignal)
        : null
    );

    // 6. Handle Grab / Drop interaction trigger
    const interact = playerInput.consumeInteract();
    if ((interact && inventoryAction === null) || inventoryPickup !== null) {
      if (carriedIdRef.current) {
        if (mountSlot) mountCarriedItem(mountSlot);
        else if (!aiming) dropCarriedItem();
        else if (partMountReady && freeTargetId && hitBody) {
          mountCarriedItemOnPart(freeTargetId, hitBody, joinedAxle);
        } else if (placementReady) {
          const entry = grabbableRegistry.getById(carriedIdRef.current);
          const body = entry?.getBody();
          const collider = entry?.getCollider();
          if (body && collider) finishDrop(body, collider, wrenchPlacedPosition.current, wrenchPlacedRotation.current, { x: 0, y: 0, z: 0 });
        } else if (aimedSlot || aimedPartMount) gameStore.triggerDropBlocked('mount');
        else gameStore.triggerDropBlocked('laser');
      } else {
        const stored = inventoryPickup === null ? null : gameStore.getState().inventorySlots[inventoryPickup];
        const pickupId = stored?.id ?? bestId;
        const entry = pickupId ? grabbableRegistry.getById(pickupId) : undefined;
        const station = pickupId ? workshop.stationOf(pickupId) : undefined;
        if (inventoryPickup === null && entry && pickupId && station && isRideableMount(pickupId, entry.kind, workshop)) {
          enterSeat(ctrl, pickupId, entry, station);
        } else {
        const body = entry?.getBody();
        const col = entry?.getCollider();
        if (pickupId && entry && body && col) {
          if (inventoryPickup !== null) gameStore.removeInventory(inventoryPickup);
          if (workshop.isMounted(pickupId)) {
            for (const removedId of workshop.remove(pickupId)) {
              workshopPhysics.detach(removedId);
              if (removedId !== pickupId) {
                const remBody = grabbableRegistry.getById(removedId)?.getBody();
                if (remBody && remBody.isValid()) {
                  if (remBody.bodyType() === rapier.RigidBodyType.Fixed) {
                    remBody.setBodyType(rapier.RigidBodyType.Dynamic, true);
                  }
                  remBody.wakeUp();
                }
              }
            }
            workshopPhysics.updateMotors(workshop);
            gameStore.setCanUndoMount(workshop.canUndo());
          }
          // Completely disable the physics body & collider while carried so Rapier NEVER generates
          // contacts, ShapeCast hits, or kinematic depenetration forces against the player.
          col.setSensor(true);
          col.setEnabled(false);
          body.setEnabled(false);
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          carriedIdRef.current = pickupId;
          carriedKindRef.current = entry.kind;
          carriedRotationRef.current.identity();
          if (stored) carriedRotationRef.current.fromArray(stored.rotation);
          grabbableRegistry.carriedId = pickupId;
          grabbableRegistry.highlightedId = null;
          gameStore.setCarried(pickupId, entry.kind);

          const prof = CARRY_PROFILES[entry.kind];
          const grabYaw = Math.atan2(scratchForward.current.x, scratchForward.current.z);
          const clearGrab = findClearCarryAdjust(
            scratchPlayerPos.current.x,
            scratchPlayerPos.current.y,
            scratchPlayerPos.current.z,
            grabYaw,
            entry.kind,
            ctrl.body,
            body.handle
          );
          const fallbackDist = Math.max(0.46, CHARACTER_DIMENSIONS.capsuleRadius + 0.14);
          const initDist = clearGrab ? clearGrab.dist : fallbackDist;
          const initLift = clearGrab ? clearGrab.lift : prof.holdHeight;
          smoothCarryDistRef.current = initDist;
          smoothCarryLiftRef.current = initLift;
          resolvedDistRef.current = initDist;
          resolvedLiftRef.current = initLift;
          safeVisualYawRef.current = null;
          lastSafeYawRef.current = grabYaw;

          const wx = scratchPlayerPos.current.x + Math.sin(grabYaw) * initDist;
          const wy = scratchPlayerPos.current.y - 0.08 + initLift;
          const wz = scratchPlayerPos.current.z + Math.cos(grabYaw) * initDist;
          carryOrientation(grabYaw, prof.tiltX);
          grabbableRegistry.carriedVisualPos.set(wx, wy, wz);
          grabbableRegistry.carriedVisualQuat.copy(scratchDropQuat.current);
          const vis = entry.getVisualGroup();
          if (vis) {
            vis.position.set(wx, wy, wz);
            vis.quaternion.copy(scratchDropQuat.current);
          }
          animDataRef.current.carryDist = initDist;
          animDataRef.current.carryLift = initLift;

          dustPoolRef.current?.spawnBurst(
            scratchPlayerPos.current.x,
            scratchPlayerPos.current.y + 0.1,
            scratchPlayerPos.current.z,
            'dust'
          );
        }
        }
      }
    }

    // 7. Render-frame sync: place carried prop using exact Rapier-interpolated capsule center
    // so hands & object share the exact same render timestamp as Chispa (zero 60/120Hz jitter).
    if (carriedIdRef.current && carriedKindRef.current) {
      const entry = grabbableRegistry.getById(carriedIdRef.current);
      const kind = carriedKindRef.current;
      const prof = CARRY_PROFILES[kind];

      if (visualCenterRef.current) {
        visualCenterRef.current.getWorldPosition(scratchVisualPos.current);
        visualCenterRef.current.getWorldQuaternion(scratchBodyQuat.current);
      } else {
        const bp = ctrl.body.translation();
        const br = ctrl.body.rotation();
        scratchVisualPos.current.set(bp.x, bp.y, bp.z);
        scratchBodyQuat.current.set(br.x, br.y, br.z, br.w);
      }

      scratchPostFwd.current.set(0, 0, 1).applyQuaternion(scratchBodyQuat.current).setY(0);
      if (scratchPostFwd.current.lengthSq() > 1e-6) {
        scratchPostFwd.current.normalize();
      } else {
        scratchPostFwd.current.set(0, 0, 1);
      }

      const activeYaw =
        safeVisualYawRef.current !== null
          ? safeVisualYawRef.current
          : Math.atan2(scratchPostFwd.current.x, scratchPostFwd.current.z);

      const targetDist = resolvedDistRef.current;
      const targetLift = resolvedLiftRef.current;
      const distRate = targetDist < smoothCarryDistRef.current ? 45 : 14;
      smoothCarryDistRef.current = THREE.MathUtils.lerp(
        smoothCarryDistRef.current,
        targetDist,
        1 - Math.exp(-distRate * dt)
      );
      smoothCarryLiftRef.current = THREE.MathUtils.lerp(
        smoothCarryLiftRef.current,
        targetLift,
        1 - Math.exp(-22 * dt)
      );

      const wx = scratchVisualPos.current.x + Math.sin(activeYaw) * smoothCarryDistRef.current;
      const wy = scratchVisualPos.current.y - 0.08 + smoothCarryLiftRef.current;
      const wz = scratchVisualPos.current.z + Math.cos(activeYaw) * smoothCarryDistRef.current;
      carryOrientation(activeYaw, prof.tiltX);

      grabbableRegistry.carriedVisualPos.set(wx, wy, wz);
      grabbableRegistry.carriedVisualQuat.copy(scratchDropQuat.current);
      const vis = entry?.getVisualGroup();
      if (vis) {
        vis.position.set(wx, wy, wz);
        vis.quaternion.copy(scratchDropQuat.current);
      }

      animDataRef.current.carryDist = smoothCarryDistRef.current;
      animDataRef.current.carryLift = smoothCarryLiftRef.current;
    }

    if (typeof window !== 'undefined') {
      const carriedEntry = carriedIdRef.current ? grabbableRegistry.getById(carriedIdRef.current) : null;
      const carriedBody = carriedEntry?.getBody();
      const carriedCol = carriedEntry?.getCollider();
      const cPos = carriedBody?.translation();
      const pTele = visualCenterRef.current ? scratchVisualPos.current : ctrl.currPos;
      if (!carriedIdRef.current && visualCenterRef.current) {
        visualCenterRef.current.getWorldPosition(scratchVisualPos.current);
      }
      (window as unknown as Record<string, unknown>).__desguaceTelemetry = {
        px: Number(pTele.x.toFixed(3)),
        py: Number(pTele.y.toFixed(3)),
        pz: Number(pTele.z.toFixed(3)),
        vx: Number(ctrl.currLinVel.x.toFixed(3)),
        vy: Number(ctrl.currLinVel.y.toFixed(3)),
        vz: Number(ctrl.currLinVel.z.toFixed(3)),
        fx: Number(scratchForward.current.x.toFixed(3)),
        fz: Number(scratchForward.current.z.toFixed(3)),
        uy: Number(ctrl.bodyYAxis.y.toFixed(3)),
        isOnGround: onGround,
        standHandle: ctrl.standCollider?.handle ?? null,
        floatY: Number(ctrl.floatingImpulse.y.toFixed(4)),
        moveY: Number(ctrl.moveImpulse.y.toFixed(4)),
        gravityScale: ctrl.body.gravityScale(),
        slopeAngleDeg: Number(((ctrl.actualSlopeAngle * 180) / Math.PI).toFixed(1)),
        seatedId: seatedIdRef.current,
        bodyType: ctrl.body.bodyType(),
        bodyY: Number(ctrl.body.translation().y.toFixed(3)),
        seatBodyPos: (() => {
          const sb = seatedIdRef.current ? grabbableRegistry.getById(seatedIdRef.current)?.getBody() : null;
          const p = sb?.isValid() ? sb.translation() : null;
          return p ? [Number(p.x.toFixed(2)), Number(p.y.toFixed(2)), Number(p.z.toFixed(2))] : null;
        })(),
        carriedId: carriedIdRef.current,
        carriedKind: carriedKindRef.current,
        carriedBodyEnabled: carriedBody?.isEnabled() ?? null,
        carriedColEnabled: carriedCol?.isEnabled() ?? null,
        carriedColSensor: carriedCol?.isSensor() ?? null,
        cx: cPos ? Number(cPos.x.toFixed(3)) : null,
        cy: cPos ? Number(cPos.y.toFixed(3)) : null,
        cz: cPos ? Number(cPos.z.toFixed(3)) : null,
        vxCarry: carriedIdRef.current ? Number(grabbableRegistry.carriedVisualPos.x.toFixed(3)) : null,
        vyCarry: carriedIdRef.current ? Number(grabbableRegistry.carriedVisualPos.y.toFixed(3)) : null,
        vzCarry: carriedIdRef.current ? Number(grabbableRegistry.carriedVisualPos.z.toFixed(3)) : null,
        carryDist: Number(animDataRef.current.carryDist.toFixed(3)),
      };
    }
  });

  // Physics-step carry wall & rotation safety (pure Rapier constraints, separate from render interpolation)
  useAfterPhysicsStep((physicsWorld) => {
    const ctrl = ecctrlRef.current;
    if (!ctrl || !ctrl.body) return;

    // Sincronizar el cuerpo del jugador con el asiento DESPUÉS del step físico para que
    // personaje, cámara y vehículo compartan exactamente la misma posición en el render (cero temblor).
    const activeSeatId = seatedIdRef.current;
    if (activeSeatId) {
      const seatEntry = grabbableRegistry.getById(activeSeatId);
      const seatBody = seatEntry?.getBody();
      if (seatBody?.isValid()) {
        const rotation = seatRotation.current.copy(seatBody.rotation());
        const [ox, oy, oz] = seatLocalOffset(seatEntry?.kind ?? 'seat');
        const offset = seatOffset.current.set(ox, oy, oz).applyQuaternion(rotation).add(seatBody.translation());
        ctrl.body.setTranslation(offset, true);
        ctrl.body.setNextKinematicTranslation(offset);
        const forward = seatForward.current.set(0, 0, 1).applyQuaternion(rotation);
        if (Math.hypot(forward.x, forward.z) > 0.01) {
          rotation.setFromAxisAngle(UP, Math.atan2(forward.x, forward.z));
          ctrl.body.setRotation(rotation, true);
          ctrl.body.setNextKinematicRotation(rotation);
        }
      }
    }

    const p = ctrl.body.translation();
    const r = ctrl.body.rotation();
    const v = ctrl.body.linvel();
    if (enabled && isInTowerNutReach(p) && gameStore.collectTowerNut()) {
      gameStore.setWireHint('¡Tuerca Dorada! Atardecer del Mirador disponible en el Vestidor');
      playSuccessChime();
    }
    const activeContractId = contractStore.getState().activeContractId;
    const hasSeatedContract = Boolean(seatedIdRef.current && activeContractId);
    const shouldTickMode = gameModeStore.getState().mode !== 'sandbox' && (!activeContractId || Boolean(seatedIdRef.current));
    if (enabled) {
      const seatedStation = seatedIdRef.current ? workshop.stationOf(seatedIdRef.current) : undefined;
      const seatedRootId = seatedStation && customRootId(seatedStation);
      const seatedRoot = seatedRootId ? grabbableRegistry.getById(seatedRootId)?.getBody() : cartBodyRef.current;
      const activePos = seatedIdRef.current && seatedRoot?.isValid()
        ? seatedRoot.translation()
        : p;
      arenaAndBridgeStore.stepDrones(physicsWorld.timestep, activePos);
      const onBridge =
        Math.abs(activePos.x + 12) < 2.2 &&
        activePos.z >= BRIDGE_SPAN_Z_MIN &&
        activePos.z <= BRIDGE_SPAN_Z_MAX &&
        activePos.y > 0.2 &&
        activePos.y < 3.0;
      if (onBridge) {
        let mass = seatedRoot?.isValid() ? seatedRoot.mass() : 0;
        if (seatedStation) {
          for (const { id } of workshop.partsAt(seatedStation)) {
            const part = grabbableRegistry.getById(id)?.getBody();
            if (part?.isValid()) mass += part.mass();
          }
        }
        const loadFactor = seatedStation ? mass / 42 : 0.45;
        arenaAndBridgeStore.updateBridgeStress(loadFactor, physicsWorld.timestep);
      } else {
        arenaAndBridgeStore.updateBridgeStress(0, physicsWorld.timestep);
      }
    }
    if (enabled && (shouldTickMode || hasSeatedContract)) {
      const station = seatedIdRef.current ? workshop.stationOf(seatedIdRef.current) : undefined;
      const driveRootId = station && customRootId(station);
      const root = driveRootId ? grabbableRegistry.getById(driveRootId)?.getBody() : cartBodyRef.current;
      if (root?.isValid() && root.isDynamic()) {
        const position = root.translation();
        if (shouldTickMode) gameModeStore.tick(physicsWorld.timestep, position);
        if (hasSeatedContract) {
          let wheels = 0;
          let displacedBarrels = 0;
          if (activeContractId === 'no-wheels' && station) {
            for (const { mount } of workshop.partsAt(station)) {
              if (mount.type === 'wheel') wheels++;
            }
          }
          if (activeContractId === 'barrel-smash') {
            for (const id of BOWLING_BARREL_IDS) {
              const barrel = grabbableRegistry.getById(id);
              const body = barrel?.getBody();
              if (!barrel || !body?.isValid() || !body.isEnabled() || workshop.isMounted(id)) continue;
              const at = body.translation();
              if (Math.hypot(at.x - barrel.initialPos[0], at.z - barrel.initialPos[2]) > 0.85) displacedBarrels++;
            }
          }
          contractStore.tickContract(physicsWorld.timestep, position, { wheels, displacedBarrels });
        }
      }
    }

    scratchBodyQuat.current.set(r.x, r.y, r.z, r.w);
    scratchPostFwd.current.set(0, 0, 1).applyQuaternion(scratchBodyQuat.current).setY(0);
    if (scratchPostFwd.current.lengthSq() > 1e-6) {
      scratchPostFwd.current.normalize();
    } else {
      scratchPostFwd.current.set(0, 0, 1);
    }

    if (enabled && multiplayerStore.getState().role !== 'offline' && workshopTime.current >= nextPoseTime.current) {
      nextPoseTime.current = workshopTime.current + 1 / 15;
      const hudState = gameStore.getState();
      multiplayerStore.sendLocalPose({
        pos: [p.x, p.y, p.z],
        yaw: Math.atan2(scratchPostFwd.current.x, scratchPostFwd.current.z),
        speed: Math.hypot(v.x, v.z),
        isOnGround: ctrl.isOnGround,
        isCarrying: carriedIdRef.current !== null,
        seatedId: seatedIdRef.current,
        emote: hudState.activeEmote,
        characterConfig: hudState.characterConfig,
      }, gameModeStore.getState().mode);
    }

    if (carriedIdRef.current && carriedKindRef.current) {
      const entry = grabbableRegistry.getById(carriedIdRef.current);
      const carriedBodyHandle = entry?.getBody()?.handle ?? null;
      const kind = carriedKindRef.current;
      const prof = CARRY_PROFILES[kind];

      const yawNow = Math.atan2(scratchPostFwd.current.x, scratchPostFwd.current.z);

      let resolved = findClearCarryAdjust(
        p.x,
        p.y,
        p.z,
        yawNow,
        kind,
        ctrl.body,
        carriedBodyHandle
      );

      let clampedYaw: number | null = null;

      if (!resolved) {
        const probe = isCarryPoseClear(
          p.x,
          p.y,
          p.z,
          yawNow,
          prof.holdDistance,
          prof.holdHeight,
          kind,
          ctrl.body,
          carriedBodyHandle
        );
        const nLen = Math.hypot(probe.hitNormalX, probe.hitNormalZ);
        const nx = nLen > 0.01 ? probe.hitNormalX / nLen : -Math.sin(yawNow);
        const nz = nLen > 0.01 ? probe.hitNormalZ / nLen : -Math.cos(yawNow);

        const nowDot = Math.sin(yawNow) * nx + Math.cos(yawNow) * nz;
        const safeDot = Math.sin(lastSafeYawRef.current) * nx + Math.cos(lastSafeYawRef.current) * nz;
        const turningDeeperIntoWall = nowDot < safeDot - 0.015;

        const safeTurnCheck = turningDeeperIntoWall
          ? findClearCarryAdjust(
              p.x,
              p.y,
              p.z,
              lastSafeYawRef.current,
              kind,
              ctrl.body,
              carriedBodyHandle
            )
          : null;

        if (safeTurnCheck && turningDeeperIntoWall) {
          clampedYaw = lastSafeYawRef.current;
          scratchDropEuler.current.set(0, clampedYaw, 0);
          scratchDropQuat.current.setFromEuler(scratchDropEuler.current);
          ctrl.body.setRotation(
            {
              x: scratchDropQuat.current.x,
              y: scratchDropQuat.current.y,
              z: scratchDropQuat.current.z,
              w: scratchDropQuat.current.w,
            },
            true
          );
          ctrl.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          resolved = safeTurnCheck;
        } else {
          const inwardDot = v.x * nx + v.z * nz;
          if (inwardDot < 0) {
            ctrl.body.setLinvel(
              { x: v.x - inwardDot * nx, y: v.y, z: v.z - inwardDot * nz },
              true
            );
          }
        }
      }

      const minBoundDist = Math.max(0.42, CHARACTER_DIMENSIONS.capsuleRadius + 0.1);
      resolvedDistRef.current = resolved
        ? resolved.dist
        : Math.min(minBoundDist, resolvedDistRef.current);
      resolvedLiftRef.current = THREE.MathUtils.clamp(
        resolved ? resolved.lift : prof.holdHeight,
        prof.holdHeight - 0.06,
        prof.holdHeight + 0.16
      );
      safeVisualYawRef.current = clampedYaw;
      if (resolved && clampedYaw === null) {
        lastSafeYawRef.current = yawNow;
      }
    }
  });

  return (
    <>
      <Ecctrl
        ref={ecctrlRef}
        enable={enabled && !seated}
        type={seated ? 'kinematicPosition' : 'dynamic'}
        canSleep={false}
        applyCounterMass={!seated}
        applyCounterMoveImp={!seated}
        applyCounterJumpImp={!seated}
        enabledRotations={ENABLED_ROTATIONS}
        position={SPAWN_POS}
        capsuleHalfHeight={CHARACTER_DIMENSIONS.capsuleHalfHeight}
        capsuleRadius={CHARACTER_DIMENSIONS.capsuleRadius}
        floatHeight={CHARACTER_DIMENSIONS.floatHeight}
        rayLength={0.58}
        rayHitForgiveness={0.08}
        slopeMaxAngle={0.55}
        maxWalkVel={4.3}
        maxRunVel={6.6}
        jumpVel={6.4}
        jumpDuration={0.12}
        fallingGravityScale={2.6}
        enableToggleRun={false}
        springK={95}
        dampingC={10.5}
        autoBalance={false}
        autoBalanceSpringOnY={0.14}
        autoBalanceDampingOnY={0.032}
        angularDamping={3.5}
        moveImpulsePointOffset={0}
        onCollisionEnter={({ other }) => {
          const ctrl = ecctrlRef.current;
          if (!ctrl || !enabled || bumpCooldown.current > 0) return;
          const speed = Math.hypot(ctrl.currLinVel.x, ctrl.currLinVel.z);
          if (speed > 3.6 && other.rigidBody) {
            const otherUserData = other.rigidBody.userData as { grabbableId?: string } | undefined;
            if (otherUserData?.grabbableId === carriedIdRef.current) return;
            bumpCooldown.current = 0.5;
            animDataRef.current.bumpImpulse = 0.65;
            shakeRef.current = Math.max(shakeRef.current, 0.5);
            dustPoolRef.current?.spawnBurst(
              ctrl.currPos.x,
              ctrl.currPos.y + 0.1,
              ctrl.currPos.z,
              'spark'
            );
            gameStore.triggerImpact('bump');
          }
        }}
      >
        <group ref={visualCenterRef} />
        {enabled && (
          <InventorCharacter
            animDataRef={animDataRef}
            carryAnchorRef={carryAnchorRef}
            appearance={customAppearance}
            headId={characterConfig.headShape}
            outfitId={characterConfig.outfitId}
            activeEmote={activeEmote}
            firstPersonHideHead={cameraMode === 'firstPerson'}
            wrenchEquipped={wrenchEquipped}
            seated={seated}
            wrenchTipRef={wrenchTipRef}
          />
        )}
      </Ecctrl>

      <mesh ref={wrenchBeamRef} visible={false}>
        <cylinderGeometry args={[0.006, 0.01, 1, 6, 1, true]} />
        <meshBasicMaterial ref={wrenchBeamMatRef} color="#82ffda" toneMapped={false} transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <mesh ref={wrenchDotRef} visible={false}>
        <sphereGeometry args={[0.027, 8, 6]} />
        <meshBasicMaterial ref={wrenchDotMatRef} color="#b7ffe7" toneMapped={false} />
      </mesh>
      <DustPuffPool ref={dustPoolRef} maxCount={maxDustPuffs} />
    </>
  );
}
