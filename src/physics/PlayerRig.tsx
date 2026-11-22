import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAfterPhysicsStep, useBeforePhysicsStep, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { Ecctrl, type EcctrlHandle } from 'ecctrl';
import * as THREE from 'three';
import {
  playAxleSeatClank,
  playBlockedClick,
  playGrabThud,
  playImpact,
  playRotateTick,
  playSpark,
  playSuccessChime,
  playWeldClank,
  playWireSnap,
  setEngineHum,
  setRollingAudio,
  setSprayHiss,
  playWoodClick,
} from '../audio/sfxEngine';
import { fillPart, sprayAt, sprayFx, sprayUi, tickPaint } from '../invention/paintStore';
import { SprayMist } from '../invention/SprayMist';
import { RoboticRopes } from '../invention/RoboticRopes';
import { anyWinchHooked, releaseWinchHooks, resetRoboticTools, stepRoboticTools } from '../invention/roboticsRuntime';
import { buildCharacterAppearance } from '../character/characterCustomization';
import { DustPuffPool, type DustPuffHandle } from '../character/DustPuffPool';
import { InventorCharacter, type CharacterAnimData } from '../character/InventorCharacter';
import { CHARACTER_DIMENSIONS } from '../config/visualConfig';
import { playerInput, useKeyboardInput, type PlayerInputSnapshot } from '../controls/playerInput';
import type { CameraTargetSource } from '../controls/ThirdPersonCamera';
import { captureCartBlueprint, restoreCartBlueprint } from '../invention/cartBlueprints';
import { MAX_YARD_TRIES, yardAssembly } from '../invention/yardAssembly';
import {
  DRUM_STAND_ORIGIN,
  FREE_BUILD_ORIGIN,
  FREE_BUILD_SPARE_ORIGIN,
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
import { createWorkshopPhysics, getWorkshopSlotPose, LEVEL_ROTATION, qualifiesForSteering } from '../invention/workshopPhysics';
import { bodyworkKindFromId, bodyworkStore } from '../invention/bodywork';
import { platformStore, type ReleasedPart } from '../invention/platformStore';
import { laserTableBridge, type PlatformChildInfo } from '../invention/laserTableBridge';
import { cutRefund, fabricateCost, laserEconomy } from '../invention/laserEconomy';
import { cutFromEdge, forkGap, gridBounds, gridToRects, rasterize, validateOutline } from '../invention/platformShape';
import { forkPivotFor, steerLimitsOnPlatform, unsupportedAfterCut } from '../invention/platformRules';
import { resolveBodyworkSnap, resolvePrimaryInteract } from '../invention/interactResolution';
import {
  clearMountSettle,
  computeBenchAudioIntensity,
  computeChassisDynamics,
  getCarryWeightSpec,
  resetVehicleFeel,
  triggerMountSettle,
  vehicleFeelState,
} from '../invention/vehicleFeel';
import {
  BOXING_REACH,
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
  syncPartConditionToGraph,
  toggleSwitchNode,
  toggleForcedSignal,
} from '../logic/contraptionRegistry';
import {
  listBlueprints,
  PRESET_BLUEPRINTS,
  readBlueprintFromUrl,
  saveBlueprint,
  type ContraptionBlueprint,
} from '../logic/blueprintManager';
import { arenaAndBridgeStore, BRIDGE_SPAN_Z_MAX, BRIDGE_SPAN_Z_MIN } from '../modes/arenaAndBridge';
import { BOWLING_BARREL_IDS, contractStore } from '../modes/contracts';
import { isInTowerNutReach } from '../modes/towerMirador';
import { defaultJointBreakFor, presetsAllowedFor } from '../modes/devAccess';
import { nearestChargeStation } from '../props/chargeStations';
import { onJointBroken } from '../props/jointEvents';
import { hasSceneJoint, releaseSceneJoint } from './sceneJoints';
import { isCuttableTarget } from '../props/worldTags';
import { getPartCondition, partIdsWithCondition, setPartCondition } from '../props/partCondition';
import { buildToolsLocked, gameModeStore } from '../modes/gameModes';
import { multiplayerStore } from '../multiplayer/multiplayerStore';
import { rotatedHalfHeight, rotatedSupportDistance, wrenchStep, WRENCH_STEP, type WrenchAxis } from '../invention/wrenchRotation';
import { wrenchMarkerScore, WRENCH_REACH } from '../invention/wrenchTargeting';
import {
  CARRY_PROFILES,
  grabbableRegistry,
  NEW_PROP_BOUNDS,
  type GrabbableEntry,
  type GrabbableKind,
} from '../props/grabbableRegistry';
import { gameStore, useGameStore, MAX_EXTRA_PROPS } from '../state/gameStore';
import { EXPEDITION_LEVEL_BY_ID, expeditionStore, mudDragMultiplier } from '../modes/expeditionLevels';
import { fragmentColors, fragmentStore } from '../invention/fragmentStore';
import { liveCut } from '../invention/liveCut';
import {
  ballPoints,
  buildFragmentGeometry,
  clipPlaneForSide,
  cuboidPoints,
  cylinderPoints,
  planeRelativeTo,
  slicePoints,
  type CutPlane,
  type V3,
} from '../invention/sliceGeometry';

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
/** Segundos que hay que mantener la tecla para soldar con la soldadora. */
const WELD_SECONDS = 0.36;
/** Segundos que hay que mantener la tecla para cortar una soldadura con la amoladora. */
const GRIND_SECONDS = 0.36;
const AIM_PROJECTED = new THREE.Vector3();
const WHEEL_AXIS = new THREE.Vector3(1, 0, 0);
/** Altura de trabajo de una plataforma recién fabricada (radio de rueda + margen). */
const PLATFORM_WORK_HEIGHT = 0.46;
const WRENCH_AXIS_VECTORS = {
  vertical: new THREE.Vector3(0, 1, 0),
  lateral: new THREE.Vector3(1, 0, 0),
  frontal: new THREE.Vector3(0, 0, 1),
} as const;
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1);
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
  const placementPreviewRef = useRef<THREE.Group>(null);
  const placementModelRef = useRef<THREE.Group>(null);
  const placementSourceRef = useRef<THREE.Object3D | null>(null);
  const placementInverseRef = useRef(new THREE.Matrix4());
  const placementBoxRef = useRef<THREE.Mesh>(null);
  const placementCylinderRef = useRef<THREE.Mesh>(null);
  const placementAxisRef = useRef<THREE.Mesh>(null);
  const placementCandidateRef = useRef(false);
  const wrenchBeamMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const wrenchDotMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const wrenchStart = useRef(new THREE.Vector3());
  const sprayHeldRef = useRef(false);
  const sprayFxTimerRef = useRef(0);
  const sprayRaycaster = useRef(new THREE.Raycaster());
  const sprayDir = useRef(new THREE.Vector3());
  const wrenchAim = useRef(new THREE.Vector3());
  const wrenchDirection = useRef(new THREE.Vector3());
  const wrenchCameraPos = useRef(new THREE.Vector3());
  const wrenchMarker = useRef(new THREE.Vector3());
  const wrenchMarkerDirection = useRef(new THREE.Vector3());
  const wrenchPlacedPosition = useRef(new THREE.Vector3());
  const scratchSawDir = useRef(new THREE.Vector3());
  const sawRef = useRef({
    phase: 'idle' as 'idle' | 'trace' | 'cut',
    id: null as string | null,
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    plane: new THREE.Vector3(),
    offset: 0,
    t: 0,
    duration: 1,
    spark: 0,
    sound: 0,
    wasHeld: false,
  });
  const wrenchPlacedRotation = useRef(new THREE.Quaternion());
  const partAxis = useRef(new THREE.Vector3());
  const weldSnapParentRef = useRef<RapierRigidBody | null>(null);
  const scratchSnapQuat = useRef(new THREE.Quaternion());
  const scratchSnapVec = useRef(new THREE.Vector3());
  const scratchSnapNormal = useRef(new THREE.Vector3());
  const partRotation = useRef(new THREE.Quaternion());
  const dustPoolRef = useRef<DustPuffHandle>(null);
  const cameraMode = useGameStore((s) => s.cameraMode);
  const wrenchEquipped = useGameStore((s) => s.wrenchEquipped);
  const welderEquipped = useGameStore((s) => s.welderEquipped);
  const grinderEquipped = useGameStore((s) => s.grinderEquipped);
  const sawEquipped = useGameStore((s) => s.sawEquipped);
  const wireToolEquipped = useGameStore((s) => s.wireToolEquipped);
  const sprayEquipped = useGameStore((s) => s.sprayEquipped);
  const toolWorking = useGameStore((s) => s.weldProgress > 0 || s.sawPhase === 'trace' || s.sawPhase === 'cut');
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
  const [workshopPhysics] = useState(() => createWorkshopPhysics({ world, rapier }, getWiredEngineSignal, getMotorDirection,
    (_id, mount, pose) => {
      const platform = mount.parentId ? platformStore.get(mount.parentId) : undefined;
      return platform ? steerLimitsOnPlatform(platform.grid, pose) : undefined;
    },
    // Rueda en horquilla: la mangueta gira sobre el centro de la rueda, no sobre su borde.
    (_id, mount, pose) => {
      const platform = mount.parentId ? platformStore.get(mount.parentId) : undefined;
      return platform ? forkPivotFor(platform.grid, pose) : undefined;
    }));
  const seatedIdRef = useRef<string | null>(null);
  const heldAssemblyRef = useRef<{
    station: WorkshopStation;
    root: RapierRigidBody;
    editing: boolean;
    distance: number;
    heightOffset: number;
  } | null>(null);
  const seatMountedAt = useRef(0);
  const pushedAssemblyRef = useRef<WorkshopStation | null>(null);
  const lastCustomStationRef = useRef<WorkshopStation | null>(null);
  const lastIntactBlueprintRef = useRef<ContraptionBlueprint | null>(null);
  /** true si el objetivo de `H` vino de un preset y no de algo armado por el jugador. */
  const lastIntactIsPresetRef = useRef(false);
  const sharedLoadedRef = useRef(false);
  const prevCartSpeedRef = useRef(0);
  const weldBreakCooldownRef = useRef(0);
  const brokenSparkTimerRef = useRef(0);
  const weldArmedRef = useRef(false);
  const weldChargeRef = useRef(0);
  const weldSparkClockRef = useRef(0);
  const grindChargeRef = useRef(0);
  const grindTargetRef = useRef<string | null>(null);
  const seated = useGameStore((s) => s.seated);
  const seatOffset = useRef(new THREE.Vector3());
  const seatRotation = useRef(new THREE.Quaternion());
  const seatForward = useRef(new THREE.Vector3());
  const engineAudible = useRef(false);
  const lastEngineIntensityRef = useRef(-1);
  const rollingAudibleRef = useRef(false);
  const prevDriveFwdSpeedRef = useRef(0);
  const prevDriveVertVelRef = useRef(0);
  const wasDriveGroundedRef = useRef(true);
  const driveImpactCooldownRef = useRef(0);
  const skidDustCooldownRef = useRef(0);
  const scratchDriveFwd = useRef(new THREE.Vector3());
  const scratchDriveRot = useRef(new THREE.Quaternion());
  const reachableRideableIdsRef = useRef(new Set<string>());
  const carryStridePhaseRef = useRef(0);
  const carryHeftDipRef = useRef(0);
  const carryHeftVelRef = useRef(0);
  const carryVisualQuatSmoothRef = useRef(new THREE.Quaternion());
  const carryExactQuatRef = useRef(new THREE.Quaternion());
  const carryVisualQuatInitRef = useRef(false);
  const processedReset = useRef(resetSignal);
  const workshopTime = useRef(0);
  const nextBenchSample = useRef(0);
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
    if (rollingAudibleRef.current) {
      rollingAudibleRef.current = false;
      setRollingAudio(false);
    }
    vehicleFeelState.chassisActive = false;
    vehicleFeelState.chassisPitch = 0;
    vehicleFeelState.chassisRoll = 0;
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
        lastIntactIsPresetRef.current = false;
        contractStore.setBrokenWelds(0, true);
      }
    }
    if (isCustomStation(station)) lastCustomStationRef.current = station;
    prevCartSpeedRef.current = 0;
    prevDriveFwdSpeedRef.current = 0;
    prevDriveVertVelRef.current = 0;
    wasDriveGroundedRef.current = true;
    seatMountedAt.current = workshopTime.current;
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

  useEffect(() => () => {
    setEngineHum(false);
    setRollingAudio(false);
    resetVehicleFeel();
  }, []);

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
    const seatAge = workshopTime.current - seatMountedAt.current;
    const controlRamp = THREE.MathUtils.clamp((seatAge - 0.10) / 0.23, 0, 1);
    const throttle = station && enabled
      ? (touch.joystickY || Number(keys.forward) - Number(keys.backward)) * controlRamp
      : 0;
    SEAT_LOGIC_KEYS.KeyW = throttle > 0.05;
    SEAT_LOGIC_KEYS.KeyS = throttle < -0.05;
    SEAT_LOGIC_KEYS.Space = Boolean(station && enabled && seatAge > 0.23 && (keys.jump || touch.jump));
    const descend = Boolean(station && enabled && (keys.run || touch.descend));
    // Una sola regla para todo invento: manda el control de vuelo si no tiene ruedas o si está despegado.
    const isFreeFlyer = Boolean(station && workshopPhysics.usesFlightControl(station, workshop));
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
        // El rotor de dron empuja según su orientación física, incluso en bases sin ruedas.
        if (grabbableRegistry.getById(id)?.kind === 'droneRotor') return false;
        // Las creaciones sin ruedas con vuelo libre las gobierna stabilizeAndFlyAssembly
        if (isCustomStation(partStation) && !workshop.hasWheels(partStation)) return true;
        return isFreeFlyer && partStation === station;
      },
      (_id, body, direction) => {
        const ray = new rapier.Ray(body.translation(), direction);
        const hit = world.castRay(
          ray, BOXING_REACH, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined, undefined, body, (collider) => collider.parent()?.handle !== ctrl?.body.handle,
        );
        return hit?.collider.parent() ?? null;
      },
    );
    const benchState = gameStore.getState().testBench;
    const benchPower = benchState?.power;
    const active = workshopPhysics.updateMotors(workshop, station ? { station, throttle } : undefined, benchPower);
    vehicleFeelState.benchMotors = workshopPhysics.benchMotors();
    vehicleFeelState.driveMotor = !benchState && station ? workshop.engineOnStation(station) ?? null : null;
    if (benchState) {
      const liveRpm = workshopPhysics.benchRpm();
      const benchAudio = computeBenchAudioIntensity(liveRpm, benchPower ?? 0);
      vehicleFeelState.motorRpmNorm = Math.min(1, liveRpm / 96);
      if (!benchAudio.active) {
        if (engineAudible.current) {
          engineAudible.current = false;
          lastEngineIntensityRef.current = -1;
          setEngineHum(false);
        }
      } else if (!engineAudible.current || Math.abs(benchAudio.intensity - lastEngineIntensityRef.current) > 0.025) {
        engineAudible.current = true;
        lastEngineIntensityRef.current = benchAudio.intensity;
        setEngineHum(true, benchAudio.intensity);
      }
    } else if (!active) {
      vehicleFeelState.motorRpmNorm = Math.max(0, vehicleFeelState.motorRpmNorm - dt * 3.5);
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
      vehicleFeelState.motorRpmNorm = THREE.MathUtils.clamp(0.2 + Math.abs(throttle) * 0.45 + Math.min(spd / 12, 1) * 0.35, 0, 1);
      if (!engineAudible.current || Math.abs(intensity - lastEngineIntensityRef.current) > 0.04) {
        engineAudible.current = true;
        lastEngineIntensityRef.current = intensity;
        setEngineHum(true, intensity);
      }
    }
    workshopPhysics.stepRunning(cartBodyRef.current, workshopTime.current);
    // Bisagras, pistones y bases giratorias siguen su señal; pinzas y cabrestantes agarran/enrollan.
    workshopPhysics.stepRobotics(dt);
    stepRoboticTools({ world, rapier }, dt, (id) => {
      const st = workshop.stationOf(id);
      const out = new Set<number>();
      if (!st) return out;
      for (const pid of workshop.idsOnStation(st)) {
        const b = grabbableRegistry.getById(pid)?.getBody();
        if (b?.isValid()) out.add(b.handle);
      }
      const rid = customRootId(st);
      const rb = rid ? grabbableRegistry.getById(rid)?.getBody() : st === 'cart' ? cartBodyRef.current : null;
      if (rb?.isValid()) out.add(rb.handle);
      return out;
    });
    driveImpactCooldownRef.current = Math.max(0, driveImpactCooldownRef.current - dt);
    skidDustCooldownRef.current = Math.max(0, skidDustCooldownRef.current - dt);
    if (!seatId || !ctrl?.body) {
      if (rollingAudibleRef.current) {
        rollingAudibleRef.current = false;
        setRollingAudio(false);
      }
      vehicleFeelState.chassisActive = false;
      vehicleFeelState.chassisPitch = 0;
      vehicleFeelState.chassisRoll = 0;
      return;
    }
    if (!station || !seatBody?.isValid()) {
      leaveSeat(ctrl, { x: SPAWN_POS[0], y: SPAWN_POS[1], z: SPAWN_POS[2] });
      return;
    }
    const rootId = customRootId(station);
    const root = rootId ? grabbableRegistry.getById(rootId)?.getBody() ?? null : cartBodyRef.current;
    const steer = enabled ? (touch.joystickX || Number(keys.rightward) - Number(keys.leftward)) * controlRamp : 0;
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
    if (!isFreeFlyer && root?.isValid()) {
      const headingBody = isCustomStation(station) && seatBody?.isValid() ? seatBody : root;
      const fwd = scratchDriveFwd.current.set(0, 0, 1).applyQuaternion(scratchDriveRot.current.copy(headingBody.rotation()));
      fwd.y = 0;
      if (fwd.lengthSq() > 1e-4) fwd.normalize();
      else fwd.set(0, 0, 1);
      const rightX = fwd.z;
      const rightZ = -fwd.x;
      const lv = root.linvel();
      const av = root.angvel();
      const pos = root.translation();
      const fwdSpeed = lv.x * fwd.x + lv.z * fwd.z;
      const sideSpeed = lv.x * rightX + lv.z * rightZ;
      const grounded = pos.y < 1.15;
      const dyn = computeChassisDynamics({
        fwdSpeed,
        prevFwdSpeed: prevDriveFwdSpeedRef.current,
        sideSpeed,
        vertVel: lv.y,
        prevVertVel: prevDriveVertVelRef.current,
        yawRate: av.y,
        throttle,
        steer,
        grounded,
        wasGrounded: wasDriveGroundedRef.current,
        dt,
      });
      prevDriveFwdSpeedRef.current = fwdSpeed;
      prevDriveVertVelRef.current = lv.y;
      wasDriveGroundedRef.current = grounded;

      vehicleFeelState.chassisActive = station === 'cart';
      vehicleFeelState.chassisPitch = dyn.targetPitch;
      vehicleFeelState.chassisRoll = dyn.targetRoll;
      if (dyn.landingImpact > 0.08) {
        vehicleFeelState.chassisHeaveImpulse = Math.max(vehicleFeelState.chassisHeaveImpulse, dyn.landingImpact);
      }

      const rollActive = grounded && (dyn.speedNorm > 0.02 || dyn.slipNorm > 0.12);
      if (rollActive || rollingAudibleRef.current) {
        rollingAudibleRef.current = rollActive;
        setRollingAudio(rollActive, dyn.speedNorm, dyn.slipNorm);
      }

      if (dyn.hardImpact > 0.12 && driveImpactCooldownRef.current <= 0) {
        driveImpactCooldownRef.current = 0.28;
        playImpact(0.32 + dyn.hardImpact * 0.62);
        shakeRef.current = Math.max(shakeRef.current, dyn.hardImpact * 0.34);
      }
      if ((dyn.slipNorm > 0.36 || dyn.landingImpact > 0.25) && skidDustCooldownRef.current <= 0) {
        skidDustCooldownRef.current = 0.18;
        dustPoolRef.current?.spawnBurst(pos.x - fwd.x * 0.65, Math.max(0.15, pos.y - 0.15), pos.z - fwd.z * 0.65, 'dust');
      }
    } else if (rollingAudibleRef.current) {
      rollingAudibleRef.current = false;
      setRollingAudio(false);
      vehicleFeelState.chassisActive = false;
    }
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
    boxingGlove: InstanceType<typeof rapier.Cuboid>;
    droneRotor: InstanceType<typeof rapier.Cuboid>;
    flag: InstanceType<typeof rapier.Cuboid>;
    platform: InstanceType<typeof rapier.Cuboid>;
    fragment: InstanceType<typeof rapier.Cuboid>;
    bodywork: InstanceType<typeof rapier.Cuboid>;
    robotic: InstanceType<typeof rapier.Cuboid>;
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

  /** Puntos del casco de una pieza en el espacio local de su cuerpo (para rebanarla). */
  const sliceLocalPoints = (id: string): { points: THREE.Vector3[] } | { error: string } => {
    const entry = grabbableRegistry.getById(id);
    const collider = entry?.getCollider();
    const record = fragmentStore.get(id);
    if (record) return { points: record.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)) };
    if (!entry || !collider?.isValid()) return { error: 'Esta pieza no se puede rebanar' };
    const shape = collider.shape;
    let points: THREE.Vector3[];
    if (shape instanceof rapier.Cuboid) points = cuboidPoints(shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z);
    else if (shape instanceof rapier.Cylinder) points = cylinderPoints(shape.halfHeight, shape.radius);
    else if (shape instanceof rapier.Ball) points = ballPoints(shape.radius);
    else return { error: 'Esta pieza no se puede rebanar' };
    const lr = collider.rotationWrtParent();
    const lt = collider.translationWrtParent();
    const q = lr ? new THREE.Quaternion(lr.x, lr.y, lr.z, lr.w) : new THREE.Quaternion();
    const offset = lt ? new THREE.Vector3(lt.x, lt.y, lt.z) : new THREE.Vector3();
    return { points: points.map((p) => p.applyQuaternion(q).add(offset)) };
  };

  // Mesa de Corte Láser: fabricar plataformas, recortarlas en el lugar y deshacer.
  const lastPlatformRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const offRebuilt = platformStore.onRebuilt((id) => {
      const body = grabbableRegistry.getById(id)?.getBody();
      if (body?.isValid()) workshopPhysics.refreshBodyContacts(body);
      workshopPhysics.refreshSteerLimits(id);
    });
    const unparkIfLoose = (id: string) => {
      const body = grabbableRegistry.getById(id)?.getBody();
      if (!body?.isValid()) return;
      if (body.bodyType() === rapier.RigidBodyType.Fixed) body.setBodyType(rapier.RigidBodyType.Dynamic, true);
      body.wakeUp();
    };
    const offBridge = laserTableBridge.register({
      info(id) {
        const entry = grabbableRegistry.getById(id);
        const record = platformStore.get(id);
        if (!entry || entry.kind !== 'platform' || !record) return null;
        const station = workshop.stationOf(id);
        const children: PlatformChildInfo[] = [];
        for (const childId of station ? workshop.idsOnStation(station) : []) {
          const mount = workshop.mountOf(childId);
          if (mount?.parentId !== id) continue;
          const pose = workshopPhysics.getLocalAttachment(childId);
          const childEntry = grabbableRegistry.getById(childId);
          if (!pose || !childEntry) continue;
          children.push({
            id: childId,
            kind: childEntry.kind,
            pose: {
              position: { x: pose.position.x, y: pose.position.y, z: pose.position.z },
              axis: pose.axis ? { x: pose.axis.x, y: pose.axis.y, z: pose.axis.z } : undefined,
            },
            steer: workshopPhysics.steerInfo(childId),
          });
        }
        return {
          id,
          inAssembly: Boolean(station),
          released: Boolean(station && station !== 'drum' && workshopPhysics.isReleased(station)),
          carried: carriedIdRef.current === id || gameStore.getState().inventorySlots.some((item) => item?.id === id),
          children,
        };
      },
      fabricate(template, outline) {
        const error = validateOutline(outline);
        if (error) return { error };
        const grid = rasterize(outline);
        const cost = fabricateCost(gridToRects(grid));
        const unlimited = gameModeStore.getState().mode === 'sandbox';
        if (!laserEconomy.canAfford(cost, unlimited)) {
          return { error: `Falta chapa: necesitás ${cost} u (tenés ${laserEconomy.get().scrap} u)` };
        }
        const ctrl = ecctrlRef.current;
        const at = ctrl?.body?.translation() ?? { x: FREE_BUILD_ORIGIN[0], y: 0, z: FREE_BUILD_ORIGIN[2] };
        const fwd = scratchRayDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0);
        if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, 1);
        fwd.normalize();
        // Buscar un lugar libre cerca (adelante, a los costados o en la zona de creación libre).
        const b = gridBounds(grid);
        const probe = new rapier.Cuboid((b.maxX - b.minX) / 2 + 0.1, 0.25, (b.maxZ - b.minZ) / 2 + 0.1);
        const side = { x: fwd.z, z: -fwd.x };
        const candidates = [
          [at.x + fwd.x * 2.2, at.z + fwd.z * 2.2], [at.x + side.x * 2.2, at.z + side.z * 2.2],
          [at.x - side.x * 2.2, at.z - side.z * 2.2], [at.x + fwd.x * 3.6, at.z + fwd.z * 3.6],
          [FREE_BUILD_ORIGIN[0], FREE_BUILD_ORIGIN[2]], [FREE_BUILD_ORIGIN[0] + 2.5, FREE_BUILD_ORIGIN[2]],
        ];
        const yaw = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(fwd.x, fwd.z));
        let spot = candidates[0];
        for (const c of candidates) {
          const hit = world.intersectionWithShape({ x: c[0], y: 0.42, z: c[1] }, yaw, probe,
            rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, ctrl?.body ?? undefined);
          if (!hit) { spot = c; break; }
        }
        const entry = gameStore.spawnExtraPart('platform', [spot[0], PLATFORM_WORK_HEIGHT, spot[1]]);
        if (!entry) return { error: 'El dispensador está lleno: retirá piezas extra' };
        laserEconomy.consume(cost, unlimited);
        platformStore.create(entry.id, template, outline);
        // Sale de la mesa sostenida a altura de trabajo (como sobre caballetes) para poder soldarle
        // ruedas a los costados y adelante sin que choquen con el piso. Al agarrarla vuelve a ser suelta.
        let tries = 0;
        const holdAtWorkHeight = () => {
          const body = grabbableRegistry.getById(entry.id)?.getBody();
          if (body?.isValid()) {
            body.setTranslation({ x: spot[0], y: PLATFORM_WORK_HEIGHT, z: spot[1] }, true);
            body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
            body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            body.setAngvel({ x: 0, y: 0, z: 0 }, true);
            body.setBodyType(rapier.RigidBodyType.Fixed, true);
            return;
          }
          if (++tries < 60) requestAnimationFrame(holdAtWorkHeight);
        };
        requestAnimationFrame(holdAtWorkHeight);
        lastPlatformRef.current = entry.id;
        playWeldClank();
        return { id: entry.id };
      },
      cut(id, cutOutline) {
        const record = platformStore.get(id);
        const info = this.info(id);
        if (!record || !info) return { error: 'Elegí una plataforma' };
        if (info.carried) return { error: 'Soltá la plataforma antes de recortarla' };
        if (info.released) return { error: 'Fijá la creación en el taller para recortar' };
        const result = cutFromEdge(record.grid, cutOutline);
        if (result.error) return { error: result.error };
        const refund = cutRefund(result.removed.length, record.grid.cell);
        if (refund > 0) laserEconomy.addScrap(refund);
        const loose = unsupportedAfterCut(record.grid, result.grid, info.children);
        const station = workshop.stationOf(id);
        const snapshot = new Map<string, { parentId: string; type: string; pose: NonNullable<ReturnType<typeof workshopPhysics.getLocalAttachment>>; steer: boolean }>();
        if (station) {
          for (const childId of workshop.idsOnStation(station)) {
            const mount = workshop.mountOf(childId);
            const pose = workshopPhysics.getLocalAttachment(childId);
            if (mount?.parentId && pose) {
              snapshot.set(childId, {
                parentId: mount.parentId, type: mount.type, steer: workshopPhysics.isSteerable(childId),
                pose: { position: pose.position.clone(), rotation: pose.rotation.clone(), axis: pose.axis?.clone() },
              });
            }
          }
        }
        const released: ReleasedPart[] = [];
        for (const childId of loose) {
          for (const removedId of workshop.remove(childId)) {
            workshopPhysics.detach(removedId);
            unparkIfLoose(removedId);
            const saved = snapshot.get(removedId);
            if (!saved) continue;
            const parentEntry = grabbableRegistry.getById(saved.parentId);
            released.push({
              id: removedId,
              parentId: saved.parentId,
              type: saved.type,
              parentType: parentEntry ? workshopPartTypeForKind(parentEntry.kind) : 'fixture',
              position: { x: saved.pose.position.x, y: saved.pose.position.y, z: saved.pose.position.z },
              rotation: { x: saved.pose.rotation.x, y: saved.pose.rotation.y, z: saved.pose.rotation.z, w: saved.pose.rotation.w },
              axis: saved.pose.axis ? { x: saved.pose.axis.x, y: saved.pose.axis.y, z: saved.pose.axis.z } : undefined,
              steer: saved.steer,
            });
          }
        }
        if (!workshop.isMounted(id)) unparkIfLoose(id);
        platformStore.applyCut(id, result.grid, released);
        workshopPhysics.refreshSteerLimits(id);
        workshopPhysics.updateMotors(workshop);
        gameStore.setCanUndoMount(workshop.canUndo());
        dustPoolRef.current?.spawnBurst(...(() => {
          const t = grabbableRegistry.getById(id)?.getBody()?.translation() ?? { x: 0, y: 0, z: 0 };
          return [t.x, t.y + 0.1, t.z] as const;
        })(), 'spark');
        playWeldClank();
        lastPlatformRef.current = id;
        return { released: released.map((r) => r.id) };
      },
      undo(id) {
        const platformBody = grabbableRegistry.getById(id)?.getBody();
        const info = this.info(id);
        if (!platformBody?.isValid() || !info) return { error: 'Elegí una plataforma' };
        if (info.carried) return { error: 'Soltá la plataforma antes de deshacer' };
        if (info.released) return { error: 'Fijá la creación en el taller para deshacer' };
        const parts = platformStore.undoCut(id);
        if (!parts) return { error: 'No hay cortes para deshacer' };
        workshopPhysics.refreshSteerLimits(id);
        let restored = 0;
        const parentRot = new THREE.Quaternion();
        for (const part of parts) {
          const entry = grabbableRegistry.getById(part.id);
          const body = entry?.getBody();
          const collider = entry?.getCollider();
          const parentBody = grabbableRegistry.getById(part.parentId)?.getBody();
          if (!entry || !body?.isValid() || !collider || !parentBody?.isValid() || workshop.isMounted(part.id)) continue;
          if (carriedIdRef.current === part.id || gameStore.getState().inventorySlots.some((item) => item?.id === part.id)) continue;
          parentRot.copy(parentBody.rotation());
          const p0 = parentBody.translation();
          const position = new THREE.Vector3(part.position.x, part.position.y, part.position.z).applyQuaternion(parentRot).add(p0);
          const rotation = parentRot.clone().multiply(new THREE.Quaternion(part.rotation.x, part.rotation.y, part.rotation.z, part.rotation.w));
          const axis = part.axis ? new THREE.Vector3(part.axis.x, part.axis.y, part.axis.z).applyQuaternion(parentRot) : undefined;
          const mount = workshop.mountOnPart(part.id, part.parentId, part.type as ReturnType<typeof workshopPartTypeForKind>,
            axis ? { x: axis.x, y: axis.y, z: axis.z } : undefined, part.parentType as ReturnType<typeof workshopPartTypeForKind>);
          if (!mount) continue;
          if (isCustomStation(mount.station) && !workshopPhysics.isReleased(mount.station)) {
            const rootId = customRootId(mount.station);
            const root = rootId ? grabbableRegistry.getById(rootId)?.getBody() : null;
            if (root?.isValid() && root.isDynamic()) workshopPhysics.fixCustomRoot(root);
          }
          body.setBodyType(rapier.RigidBodyType.Dynamic, true);
          body.setTranslation(position, true);
          body.setRotation(rotation, true);
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          collider.setSensor(false);
          collider.setEnabled(true);
          body.setEnabled(true);
          workshopPhysics.attachOnPart(part.id, mount, body, parentBody, position, rotation, axis, { steer: part.steer });
          const visual = entry.getVisualGroup();
          if (visual) { visual.position.copy(position); visual.quaternion.copy(rotation); }
          restored++;
          const rootId = customRootId(mount.station);
          const root = rootId ? grabbableRegistry.getById(rootId)?.getBody() : null;
          if (root?.isValid() && !workshopPhysics.isReleased(mount.station)) workshopPhysics.parkRestoredAssembly(mount.station, root);
        }
        world.propagateModifiedBodyPositionsToColliders();
        workshopPhysics.updateMotors(workshop);
        gameStore.setCanUndoMount(workshop.canUndo());
        playWeldClank();
        return { restored };
      },
      aimedNear() {
        const at = ecctrlRef.current?.body?.translation();
        if (!at || seatedIdRef.current || carriedIdRef.current) return null;
        let best: string | null = null;
        let bestD = 3.2 * 3.2;
        const highlighted = grabbableRegistry.highlightedId;
        for (const id of platformStore.ids()) {
          const body = grabbableRegistry.getById(id)?.getBody();
          if (!body?.isValid()) continue;
          const t = body.translation();
          const d = (t.x - at.x) ** 2 + (t.z - at.z) ** 2 - (id === highlighted ? 4 : 0);
          if (d < bestD) { bestD = d; best = id; }
        }
        return best;
      },
      prepareSceneCut(id) {
        const info = this.info(id);
        if (!info) return { error: 'Apuntá a una plataforma' };
        if (info.carried) return { error: 'Soltá la plataforma antes de cortarla' };
        const station = workshop.stationOf(id);
        if (station && info.released) {
          const rootId = customRootId(station);
          const root = rootId ? grabbableRegistry.getById(rootId)?.getBody() : null;
          if (!root?.isValid()) return { error: 'No se pudo fijar la creación' };
          workshopPhysics.toggleAssembly(station, root, workshop);
        }
        if (document.pointerLockElement) document.exitPointerLock?.();
        const t = grabbableRegistry.getById(id)?.getBody()?.translation();
        const me = ecctrlRef.current?.body?.translation();
        const viewYaw = t && me ? Math.atan2(me.x - t.x, me.z - t.z) : 0;
        return { viewYaw };
      },
      slice(id, normalIn, offset, preview = false) {
        const entry = grabbableRegistry.getById(id);
        const body = entry?.getBody();
        if (!entry || !body?.isValid()) return { error: 'Elegí una pieza' };
        if (!isCuttableTarget(id, entry.kind)) return { error: 'Ese material no se puede cortar con la sierra' };
        if (carriedIdRef.current === id || gameStore.getState().inventorySlots.some((item) => item?.id === id)) {
          return { error: 'Soltá la pieza en el piso para rebanarla' };
        }
        const station = workshop.stationOf(id) ?? (workshop.idsOnStation(`custom:${id}`).length ? (`custom:${id}` as const) : null);
        if (station && station !== 'drum' && workshopPhysics.isReleased(station)) {
          return { error: 'Fijá la creación en el taller para rebanar una de sus piezas' };
        }
        const shape = sliceLocalPoints(id);
        if ('error' in shape) return { error: shape.error };
        const origin = new THREE.Vector3().copy(body.translation() as THREE.Vector3);
        const rot = new THREE.Quaternion().copy(body.rotation() as THREE.Quaternion);
        const world = shape.points.map((p) => p.clone().applyQuaternion(rot).add(origin));
        const normal = new THREE.Vector3(normalIn.x, normalIn.y, normalIn.z).normalize();
        const d = normal.dot(origin) + offset;
        const result = slicePoints(world, normal, d);
        if ('error' in result) return { error: result.error };

        const originalIsExtra = gameStore.getState().spawnedProps.some((item) => item.id === id);
        if (gameStore.getState().spawnedProps.length + (originalIsExtra ? 1 : 2) > MAX_EXTRA_PROPS) {
          return { error: 'El dispensador está lleno: retirá piezas extra' };
        }
        if (preview) return {};

        // Todo lo soldado a la pieza se suelta (ella misma y lo que colgaba de ella).
        const dependents = station ? workshop.idsOnStation(station).filter((childId) => workshop.mountOf(childId)?.parentId === id) : [];
        for (const rootId of [id, ...dependents]) {
          for (const removedId of workshop.remove(rootId)) {
            workshopPhysics.detach(removedId);
            if (removedId !== id) unparkIfLoose(removedId);
          }
        }
        workshopPhysics.updateMotors(workshop);
        gameStore.setCanUndoMount(workshop.canUndo());

        const parentRecord = fragmentStore.get(id);
        const colors = parentRecord ? { base: parentRecord.base, cut: parentRecord.cut } : fragmentColors(entry.kind);
        const parentPlanes = parentRecord?.cutPlanes.map((plane) => ({
          n: new THREE.Vector3(...plane.n).applyQuaternion(rot), d: plane.d,
        })) ?? [];
        const parentClipPlanes = parentRecord?.clipPlanes?.map((plane) => ({
          n: new THREE.Vector3(...plane.n).applyQuaternion(rot), d: plane.d,
        })) ?? [];
        const parentSourceOffset = parentRecord?.sourceOffset
          ? new THREE.Vector3(...parentRecord.sourceOffset).applyQuaternion(rot).add(origin)
          : origin.clone();
        const parentSourceQuat = parentRecord?.sourceQuat
          ? rot.clone().multiply(new THREE.Quaternion(...parentRecord.sourceQuat))
          : rot.clone();
        const sourceMass = body.mass();
        const totalVolume = result.above.volume + result.below.volume;
        const linvel = body.linvel();
        const spawned: string[] = [];
        for (const [half, sign] of [[result.above, 1], [result.below, -1]] as const) {
          const gap = normal.clone().multiplyScalar(0.03 * sign);
          const at = half.centroid.clone().add(gap);
          const entryNew = gameStore.spawnExtraPart('fragment', [at.x, at.y, at.z]);
          if (!entryNew) continue;
          const local = half.points.map((p) => p.clone().sub(half.centroid));
          const planes = [
            ...parentPlanes.map((plane) => planeRelativeTo(plane.n, plane.n.dot(origin) + plane.d, half.centroid)),
            planeRelativeTo(normal, d, half.centroid),
          ];
          const deltaFromOrigin = half.centroid.clone().sub(origin);
          const clipPlanes: CutPlane[] = [
            ...parentClipPlanes.map((plane) => ({
              n: [plane.n.x, plane.n.y, plane.n.z] as V3,
              d: plane.n.dot(deltaFromOrigin) + plane.d,
            })),
            clipPlaneForSide(normal, d, half.centroid, sign),
          ];
          const sourceOffsetVec = parentSourceOffset.clone().sub(half.centroid);
          fragmentStore.create({
            id: entryNew.id,
            points: local.map((p) => [p.x, p.y, p.z] as V3),
            cutPlanes: planes,
            clipPlanes,
            sourceOffset: [sourceOffsetVec.x, sourceOffsetVec.y, sourceOffsetVec.z],
            sourceQuat: [parentSourceQuat.x, parentSourceQuat.y, parentSourceQuat.z, parentSourceQuat.w],
            mass: Math.max(0.15, sourceMass * (half.volume / totalVolume)),
            sourceKind: parentRecord?.sourceKind ?? entry.kind,
            base: colors.base,
            cut: colors.cut,
          });
          spawned.push(entryNew.id);
        }
        // Mantener la velocidad de la pieza original en los trozos (cuando ya existan sus cuerpos).
        let tries = 0;
        const inherit = () => {
          const bodies = spawned.map((fid) => grabbableRegistry.getById(fid)?.getBody());
          if (bodies.every((b) => b?.isValid())) {
            bodies.forEach((b, index) => {
              b!.setLinvel({ x: linvel.x, y: linvel.y, z: linvel.z }, true);
              const push = normal.clone().multiplyScalar(index === 0 ? 0.6 : -0.6);
              b!.applyImpulse({ x: push.x * b!.mass(), y: push.y * b!.mass(), z: push.z * b!.mass() }, true);
            });
            return;
          }
          if (++tries < 30) requestAnimationFrame(inherit);
        };
        requestAnimationFrame(inherit);

        // La pieza original desaparece.
        fragmentStore.consume(id);
        if (originalIsExtra) gameStore.removeExtraPart(id);
        if (parentRecord) fragmentStore.forget(id);
        dustPoolRef.current?.spawnBurst(origin.x, origin.y + 0.1, origin.z, 'spark');
        playWeldClank();
        return {};
      },
      aimed() {
        const highlighted = grabbableRegistry.highlightedId;
        if (highlighted && grabbableRegistry.getById(highlighted)?.kind === 'platform') return highlighted;
        const station = lastCustomStationRef.current;
        const rootId = station ? customRootId(station) : undefined;
        if (rootId && grabbableRegistry.getById(rootId)?.kind === 'platform') return rootId;
        const last = lastPlatformRef.current;
        return last && grabbableRegistry.getById(last) ? last : null;
      },
    });
    return () => { offRebuilt(); offBridge(); };
  }, [enabled, workshop, workshopPhysics, rapier, world, camera]);

  // Gancho solo de desarrollo para pruebas automáticas: usa las funciones reales de agarrar y
  // soldar, simulando únicamente hacia dónde apunta el láser. No existe en el build publicado.
  useEffect(() => {
    if (!import.meta.env.DEV || !enabled) return;
    const dev = {
      teleport(x: number, y: number, z: number) {
        const b = ecctrlRef.current?.body;
        b?.setTranslation({ x, y, z }, true);
        b?.setLinvel({ x: 0, y: 0, z: 0 }, true);
      },
      bodyPose(id: string) {
        const b = grabbableRegistry.getById(id)?.getBody();
        if (!b?.isValid()) return null;
        return { t: b.translation(), r: b.rotation(), v: b.linvel(), av: b.angvel(), type: b.bodyType() };
      },
      ids(kind?: string) {
        return [...grabbableRegistry.getAll()].filter((e) => !kind || e.kind === kind).map((e) => e.id);
      },
      steer(id: string) { return workshopPhysics.steerInfo(id); },
      /** Posición y dirección de la cámara (para apuntar el láser en pruebas). */
      camera() {
        const p = camera.getWorldPosition(new THREE.Vector3());
        const d = camera.getWorldDirection(new THREE.Vector3());
        return { p: [p.x, p.y, p.z], d: [d.x, d.y, d.z] };
      },
      /** Deja una pieza quieta en un punto (para barrer el láser sobre ella en pruebas). */
      pin(id: string, x: number, y: number, z: number) {
        const b = grabbableRegistry.getById(id)?.getBody();
        if (!b?.isValid()) return false;
        b.setBodyType(rapier.RigidBodyType.Fixed, true);
        b.setTranslation({ x, y, z }, true);
        b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        return true;
      },
      rotateMounted(id: string, axis: { x: number; y: number; z: number }, angle: number) {
        return workshopPhysics.rotateMountedPart(id, axis, angle);
      },
      seated() { return seatedIdRef.current; },
      highlighted() { return grabbableRegistry.highlightedId; },
      free(x: number, z: number, hx: number, hz: number) {
        const shape = new rapier.Cuboid(hx, 0.6, hz);
        return !world.intersectionWithShape({ x, y: 0.75, z }, { x: 0, y: 0, z: 0, w: 1 }, shape,
          rapier.QueryFilterFlags.EXCLUDE_SENSORS);
      },
      /** Lleva la creación fija a (x, z) con rumbo yaw (mismas funciones que mover/girar base). */
      place(id: string, x: number, z: number, yaw: number) {
        const st = workshop.stationOf(id);
        const rootId = st ? customRootId(st) : undefined;
        const root = rootId ? grabbableRegistry.getById(rootId)?.getBody() : null;
        if (!st || !root?.isValid() || workshopPhysics.isReleased(st)) return 'suelta o inexistente';
        const t = root.translation();
        if (!workshopPhysics.moveAssembly(st, root, { x: x - t.x, y: 0.46 - t.y, z: z - t.z })) return 'lugar ocupado';
        const target = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
        const delta = target.multiply(new THREE.Quaternion().copy(root.rotation()).invert()).normalize();
        if (delta.w < 0) { delta.x = -delta.x; delta.y = -delta.y; delta.z = -delta.z; delta.w = -delta.w; }
        const angle = 2 * Math.acos(Math.min(1, delta.w));
        if (angle > 1e-3) {
          const sinHalf = Math.sqrt(Math.max(1e-9, 1 - delta.w * delta.w));
          const axis = new THREE.Vector3(delta.x / sinHalf, delta.y / sinHalf, delta.z / sinHalf);
          if (!workshopPhysics.rotateAssembly(st, root, angle, axis)) return 'no pudo girar';
        }
        return 'ok';
      },
      ray(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) {
        const hit = world.castRayAndGetNormal(new rapier.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz }), 4, true);
        if (!hit) return null;
        return { toi: hit.timeOfImpact, n: hit.normal, id: (hit.collider.parent()?.userData as { grabbableId?: string } | undefined)?.grabbableId ?? null };
      },
      colliders(id: string) {
        const b = grabbableRegistry.getById(id)?.getBody();
        if (!b?.isValid()) return null;
        const out = [];
        for (let i = 0; i < b.numColliders(); i++) {
          const c = b.collider(i);
          out.push({ en: c.isEnabled(), sensor: c.isSensor(), t: c.translation(), g: c.collisionGroups(), he: (c.shape as unknown as { halfExtents?: unknown }).halfExtents });
        }
        return out;
      },
      toggle(id: string) {
        const st = workshop.stationOf(id);
        const rootId = st ? customRootId(st) : undefined;
        const root = rootId ? grabbableRegistry.getById(rootId)?.getBody() : null;
        if (!st || !root) return null;
        workshopPhysics.toggleAssembly(st, root, workshop);
        return workshopPhysics.isReleased(st);
      },
      station(id: string) { return workshop.stationOf(id) ?? null; },
      released(id: string) { const st = workshop.stationOf(id); return st ? workshopPhysics.isReleased(st) : null; },
      /** Agarra `partId` y lo suelda sobre `parentId` como si el láser pegara en `localPoint` con normal `localNormal`. */
      weld(partId: string, parentId: string, localPoint: { x: number; y: number; z: number },
        localNormal: { x: number; y: number; z: number }, rot?: { x: number; y: number; z: number; w: number }) {
        const entry = grabbableRegistry.getById(partId);
        const parentBody = grabbableRegistry.getById(parentId)?.getBody();
        const body = entry?.getBody();
        const col = entry?.getCollider();
        if (!entry || !body || !col || !parentBody?.isValid()) return 'pieza o base inexistente';
        col.setSensor(true);
        col.setEnabled(false);
        body.setEnabled(false);
        carriedIdRef.current = partId;
        carriedKindRef.current = entry.kind;
        carriedRotationRef.current.identity();
        grabbableRegistry.carriedId = partId;
        gameStore.setCarried(partId, entry.kind);
        const parentRot = new THREE.Quaternion().copy(parentBody.rotation());
        const hitPoint = new THREE.Vector3(localPoint.x, localPoint.y, localPoint.z).applyQuaternion(parentRot).add(parentBody.translation());
        const normal = new THREE.Vector3(localNormal.x, localNormal.y, localNormal.z).applyQuaternion(parentRot).normalize();
        carryExactQuatRef.current.copy(parentRot).multiply(new THREE.Quaternion(
          rot?.x ?? 0, rot?.y ?? 0, rot?.z ?? 0, rot?.w ?? 1));
        wrenchDirection.current.copy(normal).negate();
        wrenchStart.current.copy(hitPoint).addScaledVector(normal, 1);
        world.propagateModifiedBodyPositionsToColliders();
        const ray = new rapier.Ray(wrenchStart.current, wrenchDirection.current);
        const hit = world.castRayAndGetNormal(ray, 2, true, undefined, undefined, undefined, undefined,
          (c) => c.parent()?.handle === parentBody.handle);
        if (!hit) return 'el láser no pega en la base';
        const type = workshopPartTypeForKind(entry.kind);
        const axle = alignWeldAxle(hit, parentBody, type);
        if (!prepareLaserPlacement(hit, axle ? partRotation.current : undefined)) {
          return 'lugar ocupado';
        }
        mountCarriedItemOnPart(parentId, parentBody, axle);
        return workshop.isMounted(partId) ? 'ok' : 'no se soldó';
      },
    };
    (window as unknown as Record<string, unknown>).__desguaceDev = dev;
    return () => { delete (window as unknown as Record<string, unknown>).__desguaceDev; };
  });

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
    heldAssemblyRef.current = null;
    pushedAssemblyRef.current = null;
    gameStore.setAssemblyInteraction(null);
    workshopPhysics.reset(cart);
    setRollingAudio(false);
    rollingAudibleRef.current = false;
    resetVehicleFeel();
    gameStore.setTestBench(false);
    if (cart) {
      const [x, y, z] = WORKSHOP_ORIGIN;
      cart.setTranslation({ x, y, z }, true);
    }
    workshop.reset();
    resetContraptionGraph();
    lastCustomStationRef.current = null;
    lastIntactBlueprintRef.current = null;
    lastIntactIsPresetRef.current = false;
    prevCartSpeedRef.current = 0;
    weldBreakCooldownRef.current = 0;
    contractStore.setBrokenWelds(0, false);
    arenaAndBridgeStore.reset();
    const activeContract = contractStore.getState().activeContractId;
    if (activeContract) contractStore.startContract(activeContract);
    else gameModeStore.resetRun();
    gameStore.setStarterBuildStep('wheels');
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
        boxingGlove: new rapier.Cuboid(...NEW_PROP_BOUNDS.boxingGlove),
        droneRotor: new rapier.Cuboid(...NEW_PROP_BOUNDS.droneRotor),
        flag: new rapier.Cuboid(...NEW_PROP_BOUNDS.flag),
        platform: new rapier.Cuboid(0.5, 0.05, 0.6),
        fragment: new rapier.Cuboid(0.25, 0.25, 0.25),
        bodywork: new rapier.Cuboid(0.5, 0.18, 0.4),
        robotic: new rapier.Cuboid(0.28, 0.17, 0.3),
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
        playBlockedClick();
        gameStore.triggerDropBlocked('rotate');
        return;
      }
    }
    animDataRef.current.rotateImpulse = direction;
    carryExactQuatRef.current.copy(carryOrientation(yaw, CARRY_PROFILES[kind].tiltX));
    playRotateTick(kind === 'wheel');
    gameStore.triggerRotatingTarget(id);
  };

  const carryVolumeFor = (id: string, shape: RapierCollider['shape']) => {
    if (shape instanceof rapier.Cuboid || shape instanceof rapier.Cylinder) return shape;
    const rec = fragmentStore.get(id);
    if (rec?.points?.length) return { points: rec.points };
    return null;
  };

  const effectivePartType = (id: string | null, kind: GrabbableKind) => {
    if (kind === 'fragment' && id) {
      const src = fragmentStore.get(id)?.sourceKind;
      if (src === 'wheel') return 'wheel' as const;
    }
    return workshopPartTypeForKind(kind);
  };

  const rotateAimedItem = (id: string, axis: WrenchAxis, direction: number) => {
    const entry = grabbableRegistry.getById(id);
    const body = entry?.getBody();
    const collider = entry?.getCollider();
    if (!entry || !body || !collider || workshop.isMounted(id)) return;
    const shape = collider.shape;
    const volume = carryVolumeFor(id, shape);
    if (!volume) return;
    const origin = body.translation();
    const oldRotation = scratchBodyQuat.current.copy(body.rotation());
    scratchShapeQuat.current.copy(collider.rotation());
    const oldHeight = rotatedHalfHeight(volume, scratchShapeQuat.current);
    for (const fraction of [0.5, 1]) {
      scratchDropQuat.current.copy(oldRotation).multiply(wrenchStep(wrenchStepQuat.current, axis, direction * fraction));
      scratchShapeQuat.current.copy(scratchDropQuat.current);
      if (entry.kind === 'wheel') scratchShapeQuat.current.multiply(scratchWheelOffsetQuat.current);
      scratchItemPos.current.set(origin.x, origin.y + rotatedHalfHeight(volume, scratchShapeQuat.current) - oldHeight + 0.012, origin.z);
      if (world.intersectionWithShape(scratchItemPos.current, scratchShapeQuat.current, shape,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, collider, body)) {
        playBlockedClick();
        gameStore.triggerDropBlocked('rotate');
        return;
      }
    }
    playRotateTick(entry.kind === 'wheel');
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

  const findAimedSlot = (hitDistance: number, cart: RapierRigidBody | null, ctrlBody: RapierRigidBody,
    partType?: WorkshopSlot['type']) => {
    const ray = dropRayRef.current!;
    let bestSlot: WorkshopSlot | null = null;
    let bestScore = Infinity;
    for (const slot of WORKSHOP_SLOTS) {
      if (partType && slot.type !== partType) continue;
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

  /**
   * Regla general de soldadura de ruedas: el eje siempre queda lateral a la pieza madre (la rueda
   * rueda hacia adelante), sin importar si se suelda en un costado, al frente, atrás o abajo.
   * Al frente/atrás y cerca de la línea central, la rueda se centra sola (triciclos, carretillas).
   */
  const alignWeldAxle = (hit: { normal: { x: number; y: number; z: number } }, parent: RapierRigidBody,
    type: ReturnType<typeof workshopPartTypeForKind>) => {
    weldSnapParentRef.current = null;
    if (type !== 'wheel' && type !== 'drum') return undefined;
    const orientation = partRotation.current.copy(parent.rotation());
    const axis = partAxis.current.copy(type === 'wheel' ? WHEEL_AXIS : BEAM_UP).applyQuaternion(orientation);
    const alignment = axis.dot(hit.normal);
    if (type === 'drum') return Math.abs(alignment) > 0.985 ? axis : undefined;
    if (alignment < -0.985) axis.negate();
    weldSnapParentRef.current = parent;
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
    const volume = carryVolumeFor(id!, shape);
    if (!volume) return false;
    const normal = wrenchMarkerDirection.current.copy(hit.normal);
    if (normal.lengthSq() < 0.5) return false;
    normal.normalize();
    // Los trozos conservan siempre su rotación exacta en mano para que el fantasma coincida 1:1.
    const useAligned = entry.kind !== 'fragment' ? alignedRotation : undefined;
    const rotation = wrenchPlacedRotation.current.copy(useAligned ?? carryExactQuatRef.current);
    const shapeRotation = scratchShapeQuat.current.copy(rotation);
    if (entry.kind === 'wheel') shapeRotation.multiply(scratchWheelOffsetQuat.current);
    const clearance = alignedRotation ? 0.02 : 0.045;
    const offset = rotatedSupportDistance(volume, shapeRotation, normal) + clearance;
    const position = wrenchPlacedPosition.current.copy(wrenchStart.current)
      .addScaledVector(wrenchDirection.current, hit.timeOfImpact).addScaledVector(normal, offset);
    const snapParent = alignedRotation && entry.kind === 'wheel' ? weldSnapParentRef.current : null;
    if (snapParent?.isValid()) {
      const parentRot = scratchSnapQuat.current.copy(snapParent.rotation());
      const parentInv = parentRot.clone().invert();
      const parentPos = snapParent.translation();
      const local = scratchSnapVec.current.copy(position).sub(parentPos).applyQuaternion(parentInv);
      const localNormal = scratchSnapNormal.current.copy(normal).applyQuaternion(parentInv);
      if (Math.abs(localNormal.z) > 0.9 && Math.abs(local.x) < 0.15) {
        local.x = 0;
        position.copy(local.applyQuaternion(parentRot).add(parentPos));
      }
    }
    placementCandidateRef.current = true;
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

  const getCarriedSlotPose = (slot: WorkshopSlot, body: RapierRigidBody, collider: RapierCollider) => {
    const { position, rotation } = getWorkshopSlotPose(slot, cartBodyRef.current);
    const shapeRotation = scratchShapeQuat.current.copy(rotation);
    if (slot.type === 'wheel') shapeRotation.multiply(scratchWheelOffsetQuat.current);
    const blocked = Boolean(world.intersectionWithShape(position, shapeRotation, collider.shape,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, collider, body));
    return { position, rotation, shapeRotation, blocked };
  };

  const mountCarriedItem = (slot: WorkshopSlot) => {
    const id = carriedIdRef.current;
    const entry = id ? grabbableRegistry.getById(id) : null;
    const body = entry?.getBody();
    const collider = entry?.getCollider();
    const type = entry ? WORKSHOP_PARTS[entry.kind] : undefined;
    if (!id || !body || !collider || !type) return;

    const cart = cartBodyRef.current;
    const { position, rotation, blocked } = getCarriedSlotPose(slot, body, collider);
    if (blocked) {
      playBlockedClick();
      gameStore.triggerDropBlocked('mount');
      return;
    }
    if (!workshop.mount(id, slot, type)) return;
    const isAxleMount = Boolean(slot.axle || type === 'wheel');
    dustPoolRef.current?.spawnBurst(position.x, position.y + 0.14, position.z, 'spark');

    body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    body.setTranslation(position, true);
    body.setRotation(rotation, true);
    body.setLinvel(ZERO, true);
    body.setAngvel(ZERO, true);
    collider.setSensor(false);
    collider.setEnabled(true);
    body.setEnabled(true);
    workshopPhysics.attach(id, slot, body, cart);
    if (slot.station === 'cart' && cart && !workshopPhysics.isCartReleased()) {
      workshopPhysics.parkRestoredAssembly('cart', cart);
    }
    triggerMountSettle(
      id,
      grabbableRegistry.carriedVisualPos,
      grabbableRegistry.carriedVisualQuat,
      position,
      isAxleMount,
    );
    if (isAxleMount) playAxleSeatClank();
    else playWeldClank();
    animDataRef.current.mountImpulse = 1;
    gameStore.celebrate('¡Pieza montada!', slot.label);
    workshopPhysics.updateMotors(workshop);
    gameStore.setWorkshopSlot(null);
    gameStore.setCanUndoMount(workshop.canUndo());
    clearCarriedItem();
  };

  /**
   * Montaje en horquilla: si la rueda queda entre dos brazos de la misma plataforma (muesca del borde), la
   * centra en el hueco con el eje lateral. Devuelve la posición, la rotación y el eje corregidos, o `null`.
   */
  const forkSnapFor = (
    parentId: string,
    parentBody: RapierRigidBody,
    position: THREE.Vector3,
    rotation: THREE.Quaternion,
    axis: { x: number; y: number; z: number },
  ) => {
    const platform = platformStore.get(parentId);
    if (!platform) return null;
    const parentRot = new THREE.Quaternion().copy(parentBody.rotation());
    const inv = parentRot.clone().invert();
    const p0 = parentBody.translation();
    const local = new THREE.Vector3(position.x - p0.x, position.y - p0.y, position.z - p0.z).applyQuaternion(inv);
    const localAxis = new THREE.Vector3(axis.x, axis.y, axis.z).applyQuaternion(inv).normalize();
    if (Math.abs(localAxis.x) < 0.5) return null;
    const gap = forkGap(platform.grid, local.x, local.z);
    if (!gap) return null;
    const snapped = new THREE.Vector3(gap.centerX, local.y, local.z).applyQuaternion(parentRot).add(new THREE.Vector3(p0.x, p0.y, p0.z));
    const newAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(parentRot);
    const oldAxis = new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
    if (oldAxis.dot(newAxis) < 0) newAxis.negate();
    const delta = new THREE.Quaternion().setFromUnitVectors(oldAxis, newAxis);
    return { position: snapped, rotation: delta.multiply(rotation).normalize(), axis: newAxis };
  };

  /** Encastre por borde de una chapa de carrocería contra el chasis, una plataforma u otra chapa. */
  const bodyworkSnapFor = (carriedId: string, parentId: string, parentBody: RapierRigidBody, point: THREE.Vector3) => {
    if (!bodyworkKindFromId(carriedId)) return null;
    const hostKind = parentId === '__cart__' ? 'cart' : grabbableRegistry.getById(parentId)?.kind;
    if (!hostKind) return null;
    let size: [number, number, number] | undefined;
    const platform = platformStore.get(parentId);
    if (platform) {
      const g = platform.grid;
      let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
      for (let k = 0; k < g.nz; k++) for (let i = 0; i < g.nx; i++) {
        if (!g.data[k * g.nx + i]) continue;
        const x = g.x0 + i * g.cell; const z = g.z0 + k * g.cell;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
      if (maxX > minX) size = [maxX - minX + g.cell, 0.08, maxZ - minZ + g.cell];
    }
    return resolveBodyworkSnap(carriedId, {
      id: parentId, kind: hostKind, position: parentBody.translation(), rotation: parentBody.rotation(), size,
    }, point);
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

    const mountType = effectivePartType(id, entry.kind);
    const parentEntry = parentId === '__cart__' ? undefined : grabbableRegistry.getById(parentId);
    const parentType = parentEntry ? workshopPartTypeForKind(parentEntry.kind) : 'fixture';
    let axis = axle ? { x: axle.x, y: axle.y, z: axle.z } : undefined;
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

    let position = wrenchPlacedPosition.current;
    let rotation = wrenchPlacedRotation.current;
    if (axis && mountType === 'wheel' && parentId !== '__cart__') {
      const fork = forkSnapFor(parentId, parentBody, position, rotation, axis);
      if (fork) {
        position = fork.position;
        rotation = fork.rotation;
        axis = { x: fork.axis.x, y: fork.axis.y, z: fork.axis.z };
      }
    }
    // Carrocería: se encastra sola al borde más cercano del anfitrión, con el ángulo elegido (R).
    const edgeSnap = entry.kind === 'bodywork' ? bodyworkSnapFor(id, parentId, parentBody, position) : null;
    if (edgeSnap) {
      position = edgeSnap.position;
      rotation = edgeSnap.rotation;
    }
    const isAxleMount = Boolean(axis || mountType === 'wheel');
    dustPoolRef.current?.spawnBurst(position.x, position.y + 0.14, position.z, 'spark');
    body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    body.setTranslation(position, true);
    body.setRotation(rotation, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    collider.setSensor(false);
    collider.setEnabled(true);
    body.setEnabled(true);
    let steer = false;
    if (axis && mountType === 'wheel' && parentId !== '__cart__' && isCustomStation(mount.station)) {
      const parentInv = scratchSnapQuat.current.copy(parentBody.rotation()).invert();
      const p0 = parentBody.translation();
      const localPoint = scratchSnapVec.current.set(position.x - p0.x, position.y - p0.y, position.z - p0.z).applyQuaternion(parentInv);
      const localAxis = scratchSnapNormal.current.set(axis.x, axis.y, axis.z).applyQuaternion(parentInv);
      // Dirigen las ruedas de adelante del centro de masa real del invento (no del centro de la chapa).
      const stationRootId = customRootId(mount.station);
      const stationRoot = stationRootId ? grabbableRegistry.getById(stationRootId)?.getBody() : null;
      let comZ = 0;
      if (stationRoot?.isValid()) {
        const com = workshopPhysics.stationCenterOfMass(mount.station, stationRoot);
        comZ = new THREE.Vector3(com.x - p0.x, com.y - p0.y, com.z - p0.z).applyQuaternion(parentInv).z;
      }
      steer = qualifiesForSteering(localPoint, localAxis, comZ);
    }
    workshopPhysics.attachOnPart(id, mount, body, parentBody, position, rotation, axis, { steer });
    if (steer) {
      const info = workshopPhysics.steerInfo(id);
      const span = info ? Math.round(((info.max - info.min) / 2) * 180 / Math.PI) : 0;
      gameStore.setWireHint(span < 12
        ? `Rueda de dirección trabada (±${span}°): la chapa invade su espacio de giro. Recortala en la Mesa de corte.`
        : `Rueda de dirección soldada · gira ±${span}°`);
    }
    const rootId = customRootId(mount.station);
    const root = rootId ? grabbableRegistry.getById(rootId)?.getBody() : cartBodyRef.current;
    if (root?.isValid() && mount.station !== 'drum' && !workshopPhysics.isReleased(mount.station)) {
      workshopPhysics.parkRestoredAssembly(mount.station, root);
    }
    triggerMountSettle(
      id,
      grabbableRegistry.carriedVisualPos,
      grabbableRegistry.carriedVisualQuat,
      position,
      isAxleMount,
    );
    if (isAxleMount) playAxleSeatClank();
    else playWeldClank();
    animDataRef.current.mountImpulse = 1;
    gameStore.celebrate('¡Pieza soldada!');
    workshopPhysics.updateMotors(workshop);
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
    if (placementPreviewRef.current) placementPreviewRef.current.visible = false;
    const dt = Math.min(rawDelta, 0.05);
    const ctrl = ecctrlRef.current;
    if (!ctrl || !ctrl.body) return;

    // Motores rotos: chispean hasta repararlos en el Banco RPM.
    brokenSparkTimerRef.current -= dt;
    if (brokenSparkTimerRef.current <= 0) {
      brokenSparkTimerRef.current = 0.7;
      for (const id of partIdsWithCondition('broken')) {
        const at = grabbableRegistry.getById(id)?.getBody()?.translation();
        if (at) dustPoolRef.current?.spawnBurst(at.x, at.y + 0.25, at.z, 'spark');
      }
    }

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
          lastIntactIsPresetRef.current = false;
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

    // Armado de inventos del propio nivel (autos viejos del patio): se espera a que existan los cuerpos.
    if (enabled) {
      const yardQueue = yardAssembly.pending();
      for (let qi = yardQueue.length - 1; qi >= 0; qi--) {
        const req = yardQueue[qi];
        if (req.type === 'clear') {
          for (const rootId of req.rootIds) {
            for (const removedId of workshop.remove(rootId)) workshopPhysics.detach(removedId);
          }
          workshopPhysics.updateMotors(workshop);
          yardQueue.splice(qi, 1);
          continue;
        }
        const cartBody = cartBodyRef.current;
        const ready = cartBody?.isValid() && req.blueprint.parts.every((part) => {
          const b = grabbableRegistry.getById(part.partId)?.getBody();
          return Boolean(b?.isValid());
        });
        if (!ready) {
          if (++req.tries > MAX_YARD_TRIES) yardQueue.splice(qi, 1);
          continue;
        }
        const err = restoreCartBlueprint(req.blueprint, cartBody!, workshop, workshopPhysics, contraptionGraph,
          { world, rapier }, new Set<string>(), req.at);
        if (err && ++req.tries <= MAX_YARD_TRIES) continue;
        if (err) console.warn(`[yard] no se pudo armar ${req.blueprint.name}: ${err}`);
        yardQueue.splice(qi, 1);
      }
    }

    const blueprintAction = playerInput.consumeBlueprintAction();
    if (blueprintAction && enabled) {
      const cart = cartBodyRef.current;
      if (!cart?.isValid() || seatedIdRef.current || carriedIdRef.current || heldAssemblyRef.current) {
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
        const { blueprint } = blueprintAction;
        const invSlots = gameStore.getState().inventorySlots;
        const unavailableIds = new Set(invSlots.flatMap((item) => item ? [item.id] : []));
        const isPreset = blueprintAction.type === 'preset';
        // Sandbox/Dev vs MVP: los presets (también los cargados desde la lista de planos) solo en Taller Libre,
        // salvo el armado del tutorial (`startContract`) o el flag de desarrollador.
        const isPresetBlueprint = isPreset || PRESET_BLUEPRINTS.some((preset) => preset.id === blueprint.id);
        const tutorialPreset = blueprintAction.type === 'preset' && Boolean(blueprintAction.startContract);
        const presetBlocked = isPresetBlueprint && !tutorialPreset &&
          !presetsAllowedFor(gameModeStore.getState().mode, expeditionStore.getState().activeLevelId);
        const loadPoint = isPreset ? (blueprint.rootPartId ? FREE_BUILD_ORIGIN : WORKSHOP_ORIGIN) : undefined;
        const retrieve = isPreset
          ? new Set(blueprint.parts.map((part) => part.partId).filter((id) => unavailableIds.has(id)))
          : undefined;
        let error = presetBlocked
          ? 'Los armados automáticos son solo del Taller Libre'
          : restoreCartBlueprint(blueprint, cart, workshop, workshopPhysics,
            contraptionGraph, { world, rapier }, unavailableIds, loadPoint, retrieve);
        if (error?.startsWith('Liberá ') && isPreset && blueprint.rootPartId) {
          error = restoreCartBlueprint(blueprint, cart, workshop, workshopPhysics,
            contraptionGraph, { world, rapier }, unavailableIds, FREE_BUILD_SPARE_ORIGIN, retrieve);
        }
        if (!error) {
          invSlots.forEach((item, index) => {
            if (item && retrieve?.has(item.id)) gameStore.removeInventory(index);
          });
          lastIntactBlueprintRef.current = blueprint;
          lastIntactIsPresetRef.current = isPresetBlueprint;
          lastCustomStationRef.current = blueprint.rootPartId ? `custom:${blueprint.rootPartId}` : null;
          prevCartSpeedRef.current = 0;
          weldBreakCooldownRef.current = 0;
          contractStore.setBrokenWelds(0, true);
          clearPendingWire();
          gameStore.setCanUndoMount(workshop.canUndo());
          playWeldClank();
          if (blueprintAction.type === 'preset' && blueprintAction.startContract) {
            contractStore.startContract(blueprintAction.startContract);
          }
        }
        gameStore.setWireHint(error ?? `${isPreset ? 'Preset cargado en el taller' : 'Plano cargado'} · ${blueprint.name}`);
      }
    }

    // Piezas robóticas desde el asiento (F / botón Accionar) y soltar gancho (N / botón Soltar gancho).
    {
      const seatStation = seatedIdRef.current ? workshop.stationOf(seatedIdRef.current) : undefined;
      const stationIds = seatStation ? workshop.idsOnStation(seatStation) : [];
      const switches = stationIds.filter((pid) => grabbableRegistry.getById(pid)?.kind === 'switchBox');
      const robots = stationIds.filter((pid) => grabbableRegistry.getById(pid)?.kind === 'robotic');
      gameStore.setSeatedRobotics(Boolean(seatStation) && (switches.length > 0 || robots.length > 0));
      gameStore.setWinchHooked(anyWinchHooked());
      if (playerInput.seatRoboticsToggle) {
        playerInput.seatRoboticsToggle = false;
        if (switches.length) {
          let msg = '';
          for (const sw of switches) msg = toggleSwitchNode(sw);
          gameStore.setWireHint(msg);
          playWoodClick();
        } else if (robots.length) {
          const on = toggleForcedSignal(robots);
          gameStore.setWireHint(on ? 'Robótica encendida' : 'Robótica apagada');
          playWoodClick();
        }
      }
      if (playerInput.winchRelease) {
        playerInput.winchRelease = false;
        // Sentado: solo los ganchos de este vehículo. A pie: todos los enganchados.
        const n = releaseWinchHooks(seatStation ? new Set(robots) : undefined);
        gameStore.setWireHint(n ? 'Gancho suelto y recogido' : 'No hay ningún gancho enganchado');
      }
    }

    const cartAction = enabled ? playerInput.consumeCartAction() : null;
    if (cartAction === 'repair' || cartAction === 'retry' || cartAction === 'return-workshop') {
      // Reparar también pone vidrios nuevos en las ventanas de carrocería.
      bodyworkStore.repairGlass();
      resetRoboticTools(world);
      const endRun = cartAction === 'return-workshop';
      const resetRun = cartAction !== 'repair';
      const contractId = contractStore.getState().activeContractId;
      const resetRunAtWorkshop = () => {
        if (!seatedIdRef.current) {
          ctrl.body?.setTranslation({ x: SPAWN_POS[0], y: SPAWN_POS[1], z: SPAWN_POS[2] }, true);
          ctrl.body?.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
        if (endRun) {
          contractStore.clearContract();
          gameModeStore.setMode('sandbox');
        } else if (contractId) contractStore.startContract(contractId);
        else gameModeStore.resetRun();
        gameStore.setWireHint(endRun ? 'De vuelta en el taller' : 'Prueba reiniciada');
      };
      const cart = cartBodyRef.current;
      // `H` reconstruye solo lo armado por el jugador: un preset solo vale como objetivo en Taller Libre.
      const presetTargetBlocked = lastIntactIsPresetRef.current &&
        !presetsAllowedFor(gameModeStore.getState().mode, expeditionStore.getState().activeLevelId);
      const blueprint = presetTargetBlocked ? null : lastIntactBlueprintRef.current;
      if (carriedIdRef.current || heldAssemblyRef.current) {
        gameStore.setWireHint(resetRun ? 'Dejá lo que llevás para volver al taller' : 'Dejá la pieza que llevás para reparar');
      } else if (!cart?.isValid() || !blueprint) {
        if (resetRun) resetRunAtWorkshop();
        else gameStore.setWireHint('Todavía no hay un armado para reparar');
      } else {
        const invSlots = gameStore.getState().inventorySlots;
        const blueprintPartIds = new Set(blueprint.parts.map((part) => part.partId));
        const unavailableIds = new Set(invSlots.flatMap((item) => item ? [item.id] : []));
        const retrieve = new Set([...unavailableIds].filter((id) => blueprintPartIds.has(id)));
        const repairPoint = blueprint.rootPartId ? FREE_BUILD_ORIGIN : WORKSHOP_ORIGIN;
        let error = restoreCartBlueprint(blueprint, cart, workshop, workshopPhysics, contraptionGraph,
          { world, rapier }, unavailableIds, repairPoint, retrieve);
        if (error?.startsWith('Liberá ') && blueprint.rootPartId) {
          error = restoreCartBlueprint(blueprint, cart, workshop, workshopPhysics, contraptionGraph,
            { world, rapier }, unavailableIds, FREE_BUILD_SPARE_ORIGIN, retrieve);
        }
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
          if (resetRun) resetRunAtWorkshop();
          else gameStore.setWireHint(blueprint.rootPartId ? 'Invento reparado en el taller' : 'Vehículo reparado en el taller');
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
    // Fuerzas ambientales livianas en Niveles de Expedición (barro en Nivel 1, ráfagas laterales en Nivel 2)
    const expState = expeditionStore.getState();
    if (expState.activeLevelId && ctrl.body?.isValid() && !seatedIdRef.current) {
      const def = EXPEDITION_LEVEL_BY_ID[expState.activeLevelId];
      const lx = ctrl.currPos.x - def.origin[0];
      const ly = ctrl.currPos.y - def.origin[1];
      const lz = ctrl.currPos.z - def.origin[2];
      // Nivel 1: el fondo del abismo es barro que frena al jugador a pie (la ruta lenta).
      if (expState.activeLevelId === 'level-1-swamp' && lz > 13 && lz < 80 && Math.abs(lx) < 24 && ly < -10) {
        const v = ctrl.body.linvel();
        const drag = mudDragMultiplier(dt, 4.8);
        ctrl.body.setLinvel({ x: v.x * drag, y: v.y, z: v.z * drag }, true);
      }
    }
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
    const heldAssembly = heldAssemblyRef.current;
    if (heldAssembly) {
      const { station, root, editing, distance } = heldAssembly;
      const aimingHeldAssembly = gameStore.getState().wrenchAiming;
      gameStore.setWrenchTarget(aimingHeldAssembly ? 'base' : null);
      if (aimingHeldAssembly) castWrenchBeam(ctrl.body);
      else {
        if (wrenchBeamRef.current) wrenchBeamRef.current.visible = false;
        if (wrenchDotRef.current) wrenchDotRef.current.visible = false;
      }
      if (!root.isValid() || playerInput.consumeInteract()) {
        if (root.isValid() && !editing) workshopPhysics.toggleAssembly(station, root, workshop);
        if (root.isValid() && editing) gameStore.setWireHint('Estructura fijada · Lista para montar');
        heldAssemblyRef.current = null;
        gameStore.setAssemblyInteraction(null);
        return;
      }
      if (!playerInput.menuOpen) {
        if (editing && cartAction === 'move-up') heldAssembly.heightOffset = Math.min(2, heldAssembly.heightOffset + 0.25);
        if (editing && cartAction === 'move-down') heldAssembly.heightOffset = Math.max(-1, heldAssembly.heightOffset - 0.25);
        const forward = camera.getWorldDirection(scratchCamFwd.current).setY(0).normalize();
        const current = root.translation();
        const delta = scratchRayDir.current.set(
          x + forward.x * distance - current.x,
          scratchPlayerPos.current.y + 0.12 + heldAssembly.heightOffset - current.y,
          z + forward.z * distance - current.z,
        ).clampLength(0, dt * 3.5);
        if (delta.lengthSq() > 0.00001 && !workshopPhysics.moveAssembly(station, root, delta)) {
          scratchRayDir.current.set(0, Math.max(0, delta.y), 0);
          if (scratchRayDir.current.y > 0) workshopPhysics.moveAssembly(station, root, scratchRayDir.current);
        }
        if (cartAction === 'rotate' || cartAction === 'rotate-back' || cartAction?.startsWith('rotate-base')) {
          const reverse = cartAction === 'rotate-back' || cartAction === 'rotate-base-back';
          const axis = cartAction === 'rotate-base-x' ? WHEEL_AXIS : cartAction === 'rotate-base-z' ? FORWARD_AXIS : UP;
          if (!workshopPhysics.rotateAssembly(station, root, reverse ? -WRENCH_STEP : WRENCH_STEP, axis)) gameStore.triggerDropBlocked('rotate');
        }
      }
      return;
    }
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
    if (cartAction === 'bench') {
      const benchStation = activeStation ?? (cartDistanceSq < 3.6 ** 2 ? 'cart' : null);
      const benchRoot = benchStation === 'cart' ? cart : activeRoot;
      if (!carriedIdRef.current && benchStation && benchRoot &&
        workshopPhysics.startBench(benchStation, benchRoot, workshop)) {
        clearPendingWire();
        nextBenchSample.current = 0;
        gameStore.setTestBench(true);
      } else {
        gameStore.setWireHint('Apuntá a una base fija con un motor y al menos una rueda conectada a su eje');
      }
      return;
    }
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
    } else if (usingWrench && isRotateAction && !rotatesPiece && aimedId && workshop.isMounted(aimedId) &&
      aimedId !== aimedCustomRootId && workshopPhysics.canRotateMountedPart(aimedId)) {
      // Girar en el lugar una pieza ya soldada (p. ej. orientar el empuje de una hélice).
      const mountedBody = grabbableRegistry.getById(aimedId)?.getBody();
      if (mountedBody?.isValid()) {
        const worldAxis = scratchSnapVec.current.copy(WRENCH_AXIS_VECTORS[wrenchAxis]).applyQuaternion(mountedBody.rotation());
        if (workshopPhysics.rotateMountedPart(aimedId, worldAxis, WRENCH_STEP * direction)) {
          playRotateTick(false);
          gameStore.triggerRotatingTarget(aimedId);
        } else {
          playBlockedClick();
          gameStore.triggerDropBlocked('rotate');
        }
      }
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
            lastIntactIsPresetRef.current = false;
            contractStore.setBrokenWelds(0, true);
          }
        }
      }
      if (cartAction === 'push') workshopPhysics.pushAssembly(activeStation, activeRoot, scratchPlayerPos.current);
      const rotatedMountedPart = Boolean(usingWrench && aimedId && aimedId !== aimedCustomRootId &&
        workshop.isMounted(aimedId) && workshopPhysics.canRotateMountedPart(aimedId));
      const requestsBaseRotation = (isRotateAction && !rotatesPiece && !rotatedMountedPart && (!aiming || aimedBase)) ||
        cartAction.startsWith('rotate-base');
      if (requestsBaseRotation && !activeReleased) {
        const step = usingWrench ? WRENCH_STEP : Math.PI / 4;
        const axis = cartAction === 'rotate-base-x' ? WHEEL_AXIS : cartAction === 'rotate-base-z' ? FORWARD_AXIS : UP;
        if (!workshopPhysics.rotateAssembly(activeStation, activeRoot, step * direction, axis)) gameStore.triggerDropBlocked('rotate');
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
      ? findAimedSlot(laserHit?.timeOfImpact ?? WRENCH_REACH, cart, ctrl.body, partType) : null;
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
        if (dist > (usingWrench ? 2.55 : 2.35) || dist < 0.1) continue;
        toSlot.divideScalar(dist);
        const aim = facing.dot(toSlot);
        const score = dist - aim;
        if (aim < (usingWrench ? 0.12 : 0.2) || score >= bestScore || !workshop.canMount(slot, partType)) continue;

        ray.origin = { x: playerPos.x, y: eyeY, z: playerPos.z };
        ray.dir = { x: toSlot.x, y: toSlot.y, z: toSlot.z };
        if (world.castRay(ray, dist - 0.06, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined, undefined, ctrl.body,
          (collider) => slot.station !== 'cart' || collider.parent()?.handle !== cart?.handle)) continue;

        bestScore = score;
        mountSlot = slot;
      }
    }

    const hitCartFree = Boolean(cart && hitBody && hitBody.handle === cart.handle);
    const freeTargetId = aimedId ?? (hitCartFree ? '__cart__' : undefined);
    const aimedPartMount = Boolean(aiming && carriedKind && !aimedSlot && laserHit && hitBody && freeTargetId);
    const partMountType = carriedKind ? effectivePartType(carriedIdRef.current, carriedKind) : null;
    const aimedPartStation = aimedId ? workshop.stationOf(aimedId) : hitCartFree ? 'cart' : undefined;
    const aimedPartReleased = Boolean(aimedPartStation && workshopPhysics.isReleased(aimedPartStation));
    const partMountAllowed = Boolean(
      aimedPartMount && freeTargetId && partMountType &&
      !aimedPartReleased &&
      (freeTargetId === '__cart__' || workshop.canMountOnPart(freeTargetId, partMountType))
    );
    const joinedAxle = partMountAllowed && laserHit && hitBody && partMountType
      ? alignWeldAxle(laserHit, hitBody, partMountType) : undefined;
    placementCandidateRef.current = false;
    const partMountReady = Boolean(
      partMountAllowed && laserHit &&
      prepareLaserPlacement(laserHit, joinedAxle ? partRotation.current : undefined)
    );
    const placementReady = partMountReady || Boolean(
      aiming && carriedKind && !aimedSlot && !aimedPartMount && laserHit && prepareLaserPlacement(laserHit)
    );
    let laserHint: string | null = null;
    if (aimedSlot) laserHint = mountSlot ? null : workshop.describeSlot(aimedSlot, cartReleased);
    else if (aimedPartMount && freeTargetId && partMountType) {
      if (freeTargetId === '__cart__') {
        laserHint = aimedPartReleased
          ? 'Fijá el carrito para soldar'
          : partMountReady
            ? (joinedAxle ? 'Soldar rueda libre' : 'Soldar al carrito')
            : 'Sin espacio en ese punto';
      } else {
        const forkHint = partMountReady && partMountType === 'wheel' && joinedAxle && hitBody &&
          forkSnapFor(freeTargetId, hitBody, wrenchPlacedPosition.current, wrenchPlacedRotation.current, joinedAxle) !== null;
        const edgeHint = partMountReady && carriedKind === 'bodywork' && carriedIdRef.current && hitBody
          ? bodyworkSnapFor(carriedIdRef.current, freeTargetId, hitBody, wrenchPlacedPosition.current) : null;
        laserHint = partMountAllowed
          ? (partMountReady ? (edgeHint ? `Encastre al borde · ${Math.round(edgeHint.angleRad * 180 / Math.PI)}° (R cambia el ángulo)` : forkHint ? 'Montaje en horquilla · rueda centrada en el hueco' : workshop.describePartMount(freeTargetId, partMountType, aimedPartReleased, Boolean(joinedAxle))) : 'Sin espacio en ese punto')
          : workshop.describePartMount(freeTargetId, partMountType, aimedPartReleased);
      }
    } else if (aiming && carriedKind && !placementReady) {
      laserHint = laserHit ? 'Sin espacio en ese punto' : 'Apuntá a una superficie al alcance';
    }
    let directSlot: WorkshopSlot | null = null;
    let directWeld: { id: string; body: RapierRigidBody; axle?: THREE.Vector3 } | null = null;
    if (!aiming && !mountSlot && carriedKind && partMountType && !playerInput.menuOpen) {
      ensureVolumeShapes();
      const ray = dropRayRef.current!;
      const camPos = camera.getWorldPosition(wrenchStart.current);
      const camDir = camera.getWorldDirection(wrenchDirection.current).normalize();
      const player = ctrl.body.translation();
      const reach = WRENCH_REACH + camPos.distanceTo(player);
      ray.origin = camPos;
      ray.dir = camDir;
      const hit = world.castRayAndGetNormal(ray, reach, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined, undefined, ctrl.body);
      const candidate = partType ? findAimedSlot(hit?.timeOfImpact ?? reach, cart, ctrl.body, partType) : null;
      if (candidate && partType && !workshopPhysics.isReleased(candidate.station) &&
        scratchItemPos.current.copy(getWorkshopSlotPose(candidate, cart).position).distanceToSquared(player) <= WRENCH_REACH ** 2 &&
        workshop.canMount(candidate, partType)) {
        directSlot = candidate;
      } else if (hit && wrenchAim.current.copy(camPos).addScaledVector(camDir, hit.timeOfImpact)
        .distanceToSquared(player) <= WRENCH_REACH ** 2) {
        const body = hit.collider.parent();
        const id = (body?.userData as { grabbableId?: string } | undefined)?.grabbableId;
        const target = body && cart?.handle === body.handle ? '__cart__' : id;
        const station = target === '__cart__' ? 'cart' : id ? workshop.stationOf(id) : undefined;
        if (body && target && (!station || !workshopPhysics.isReleased(station)) &&
          (target === '__cart__' || workshop.canMountOnPart(target, partMountType))) {
          const axle = alignWeldAxle(hit, body, partMountType);
          if (prepareLaserPlacement(hit, axle ? partRotation.current : undefined)) directWeld = { id: target, body, axle };
        }
      }
      if (!directSlot && !directWeld && placementCandidateRef.current) laserHint = 'Sin espacio en ese punto';
    }
    const previewSlot = aiming ? aimedSlot : mountSlot ?? directSlot;
    if (carriedIdRef.current && (previewSlot || placementCandidateRef.current)) {
      const entry = grabbableRegistry.getById(carriedIdRef.current);
      const body = entry?.getBody();
      const collider = entry?.getCollider();
      const preview = placementPreviewRef.current;
      const model = placementModelRef.current;
      const box = placementBoxRef.current;
      const cylinder = placementCylinderRef.current;
      const axis = placementAxisRef.current;
      if (body && collider && preview && model && box && cylinder && axis) {
        const slotPose = previewSlot ? getCarriedSlotPose(previewSlot, body, collider) : null;
        if (slotPose?.blocked && (mountSlot || directSlot)) {
          mountSlot = null;
          directSlot = null;
          laserHint = 'Sin espacio para montar';
        }
        const shape = collider.shape;
        const fragRecord = carriedKind === 'fragment' ? fragmentStore.get(carriedIdRef.current) : undefined;
        const poseAvailable = slotPose || placementCandidateRef.current;
        if (poseAvailable && (shape instanceof rapier.Cuboid || shape instanceof rapier.Cylinder || Boolean(fragRecord))) {
          preview.position.copy(slotPose?.position ?? wrenchPlacedPosition.current);
          preview.quaternion.copy(slotPose?.rotation ?? wrenchPlacedRotation.current);
          const artwork = fragRecord ? null : (entry?.getVisualGroup()?.getObjectByName('prop-artwork') ?? null);
          const material = box.material as THREE.MeshBasicMaterial;
          const sourceKey = fragRecord ? (fragRecord as unknown as THREE.Object3D) : artwork;
          if (placementSourceRef.current !== sourceKey) {
            placementSourceRef.current = sourceKey;
            model.clear();
            if (fragRecord) {
              const ghostGeo = buildFragmentGeometry(fragRecord.points, fragRecord.cutPlanes, { base: fragRecord.base, cut: fragRecord.cut });
              if (ghostGeo) model.add(new THREE.Mesh(ghostGeo, material));
            } else if (artwork) {
              artwork.updateWorldMatrix(true, true);
              const inverse = placementInverseRef.current.copy(artwork.matrixWorld).invert();
              artwork.traverseVisible((child) => {
                if (!(child instanceof THREE.Mesh)) return;
                const ghost = new THREE.Mesh(child.geometry, material);
                ghost.matrixAutoUpdate = false;
                ghost.matrix.multiplyMatrices(inverse, child.matrixWorld);
                model.add(ghost);
              });
            }
          }
          box.visible = model.children.length === 0 && shape instanceof rapier.Cuboid;
          cylinder.visible = model.children.length === 0 && shape instanceof rapier.Cylinder;
          axis.visible = shape instanceof rapier.Cylinder && carriedKind === 'wheel';
          cylinder.quaternion.identity();
          if (carriedKind === 'wheel') cylinder.quaternion.copy(scratchWheelOffsetQuat.current);
          axis.quaternion.copy(cylinder.quaternion);
          if (shape instanceof rapier.Cuboid) {
            const { x, y, z } = shape.halfExtents;
            box.scale.set(2 * x, 2 * y, 2 * z);
          } else if (shape instanceof rapier.Cylinder) {
            cylinder.scale.set(2 * shape.radius, 2 * shape.halfHeight, 2 * shape.radius);
            axis.scale.y = 2 * shape.halfHeight + 0.3;
          }
          material.color.set(mountSlot || placementReady || directSlot || directWeld ? '#9cf6db' : '#ff8867');
          (cylinder.material as THREE.MeshBasicMaterial).color.copy(material.color);
          preview.visible = true;
        }
      }
    }
    gameStore.setLaserInteraction(aimedSlot?.id ?? null, laserHint, placementReady, partMountReady || Boolean(directWeld));
    if (wrenchBeamMatRef.current && wrenchDotMatRef.current) {
      const hudTools = gameStore.getState();
      if (partMountReady || Boolean(mountSlot)) {
        wrenchBeamMatRef.current.color.set('#ffe066');
        wrenchDotMatRef.current.color.set('#fff2a6');
      } else if (aiming && carriedKind && !placementReady) {
        wrenchBeamMatRef.current.color.set('#ff7b54');
        wrenchDotMatRef.current.color.set('#ff9e7d');
      } else if (hudTools.sawEquipped) {
        wrenchBeamMatRef.current.color.set('#5beeff');
        wrenchDotMatRef.current.color.set('#b8faff');
      } else if (hudTools.grinderEquipped) {
        wrenchBeamMatRef.current.color.set('#ff8248');
        wrenchDotMatRef.current.color.set('#ffc199');
      } else if (hudTools.welderEquipped) {
        wrenchBeamMatRef.current.color.set('#ffd24d');
        wrenchDotMatRef.current.color.set('#fff0a8');
      } else if (hudTools.wireToolEquipped || hudTools.wiringActive) {
        wrenchBeamMatRef.current.color.set('#57f5d5');
        wrenchDotMatRef.current.color.set('#c4fff2');
      } else {
        wrenchBeamMatRef.current.color.set('#82ffda');
        wrenchDotMatRef.current.color.set('#b7ffe7');
      }
    }

    const reachableRideableIds = reachableRideableIdsRef.current;
    reachableRideableIds.clear();

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
        if (bestId && bestKind && isRideableMount(bestId, bestKind, workshop)) {
          reachableRideableIds.add(bestId);
        }
      }
    }

    if (!carriedIdRef.current && (!aiming || !aimedId)) {
      const shapesReady = ensureVolumeShapes();
      void shapesReady;
      const sightRay = dropRayRef.current!;
      const originY = scratchPlayerPos.current.y + (isFirstPerson ? 0.34 : 0.28);
      const firstDrive = contractStore.getState();
      const guideToSeat = !aiming && firstDrive.activeContractId === 'first-drive' && !firstDrive.completedNow;

      for (const item of grabbableRegistry.getAll()) {
        if (gameStore.getState().inventorySlots.some((stored) => stored?.id === item.id)) continue;
        const itemSt = workshop.stationOf(item.id);
        const itemRideable = isRideableMount(item.id, item.kind, workshop);
        const starterSeat = guideToSeat && itemRideable && itemSt === 'cart';
        if (aiming && !itemRideable) continue;
        if (cartReleased && itemSt === 'cart' && !itemRideable) continue;
        if (itemSt && isCustomStation(itemSt) && workshopPhysics.isReleased(itemSt) && !itemRideable) continue;
        if (!item.getWorldPos(scratchItemPos.current)) continue;
        scratchToItem.current.subVectors(scratchItemPos.current, scratchPlayerPos.current);
        const dist = scratchToItem.current.length();
        if (dist > (starterSeat ? 3.35 : itemRideable ? 2.9 : 2.4)) continue;

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
            const camDot = scratchCamFwd.current.dot(scratchRayDir.current);
            scratchCandDir.current.set(scratchRayDir.current.x, 0, scratchRayDir.current.z).normalize();
            const bodyDot = scratchForward.current.dot(scratchCandDir.current);
            lookDot = Math.max(camDot, bodyDot);
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

        if (itemRideable) {
          reachableRideableIds.add(item.id);
        }

        const weight = isFirstPerson ? 1.35 : 0.7;
        const seatPriority = starterSeat ? 3.6 : itemRideable && dist <= 2.4 ? 1.25 : 0;
        const score = dist - lookDot * weight - seatPriority;
        if (score < bestScore) {
          bestScore = score;
          bestId = item.id;
          bestKind = item.kind;
        }
      }
    }

    if (!playerInput.interactHeld) pushedAssemblyRef.current = null;
    let manualStation: WorkshopStation | null = null;
    let manualRoot: RapierRigidBody | null = null;
    const wiringActive = gameStore.getState().wiringActive;
    const targetCanBoard = bestId && bestKind && isRideableMount(bestId, bestKind, workshop);
    const requestPosition = !wiringActive && cartAction === 'position' && Boolean(activeStation && activeRoot?.isValid());
    const editWithWrench = !wiringActive && (requestPosition || (aiming && aimedBase && !targetCanBoard));
    if (!carriedIdRef.current && !playerInput.menuOpen && !mountSlot) {
      if (editWithWrench && activeStation && activeRoot?.isValid()) {
        manualStation = activeStation;
        manualRoot = activeRoot;
      } else {
        const nearbyStation = bestId ? workshop.stationOf(bestId) : undefined;
        const directStation = hitCartFree ? 'cart' : aimedStation;
        const prefersPart = bestId && bestKind && (
          isRideableMount(bestId, bestKind, workshop) || !nearbyStation
        );
        let nearest = 2.7;
        for (const station of ['cart', ...workshop.customStations()] as WorkshopStation[]) {
          if ((pushedAssemblyRef.current && station !== pushedAssemblyRef.current) ||
              (!pushedAssemblyRef.current && directStation && directStation !== station)) continue;
          if (prefersPart && !pushedAssemblyRef.current) continue;
          const rootId = customRootId(station);
          const root = rootId ? grabbableRegistry.getById(rootId)?.getBody() : cart;
          if (!root?.isValid()) continue;
          const at = root.translation();
          const toRoot = scratchRayDir.current.set(at.x - x, at.y - scratchPlayerPos.current.y, at.z - z);
          const distance = toRoot.length();
          if (distance >= nearest || distance < 0.1) continue;
          toRoot.divideScalar(distance);
          if (!pushedAssemblyRef.current && !directStation && scratchCamFwd.current.dot(toRoot) < 0.28) continue;
          ensureVolumeShapes();
          const ray = dropRayRef.current!;
          ray.origin = scratchPlayerPos.current;
          ray.dir = toRoot;
          const blocked = world.castRay(ray, distance, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS,
            undefined, undefined, ctrl.body, (collider) => {
              const body = collider.parent();
              const id = (body?.userData as { grabbableId?: string } | undefined)?.grabbableId;
              return body?.handle !== root.handle && (!id || workshop.stationOf(id) !== station);
            });
          if (blocked) continue;
          nearest = distance;
          manualStation = station;
          manualRoot = root;
        }
      }
    }
    const handling = manualStation && manualRoot
      ? editWithWrench ? 'position' : workshopPhysics.manualHandling(manualStation, manualRoot, workshop)
      : null;
    gameStore.setAssemblyInteraction(handling);
    if (handling === 'push' && manualStation && manualRoot && pushedAssemblyRef.current === manualStation) {
      const keys = playerInput.keys;
      const touch = playerInput.touch;
      const forward = touch.joystickY || Number(keys.forward) - Number(keys.backward);
      const right = touch.joystickX || Number(keys.rightward) - Number(keys.leftward);
      const at = manualRoot.translation();
      const wx = scratchCamFwd.current.x * forward - scratchCamFwd.current.z * right;
      const wz = scratchCamFwd.current.z * forward + scratchCamFwd.current.x * right;
      if (wx * (at.x - x) + wz * (at.z - z) > 0.08) {
        workshopPhysics.pushByHand(manualStation, manualRoot, scratchPlayerPos.current, dt, workshop);
      }
    }

    grabbableRegistry.highlightedId = bestId;
    const bestMounted = bestId !== null && workshop.isMounted(bestId);
    const bestRideable = Boolean(bestId && bestKind && isRideableMount(bestId, bestKind, workshop));
    gameStore.setNearbyTarget(bestId, bestKind, bestMounted, bestRideable);
    // Ancla del cartel de contexto: posición en pantalla del objeto mirado (variables CSS, sin re-render).
    const aimBody = bestId ? grabbableRegistry.getById(bestId)?.getBody() : undefined;
    const aimStyle = document.documentElement.style;
    if (aimBody && !carriedIdRef.current) {
      const at = aimBody.translation();
      AIM_PROJECTED.set(at.x, at.y + 0.35, at.z).project(camera);
      if (AIM_PROJECTED.z < 1) {
        aimStyle.setProperty('--aim-x', `${Math.min(0.92, Math.max(0.08, AIM_PROJECTED.x * 0.5 + 0.5)) * 100}vw`);
        aimStyle.setProperty('--aim-y', `${Math.min(0.88, Math.max(0.1, 0.5 - AIM_PROJECTED.y * 0.5)) * 100}vh`);
        aimStyle.setProperty('--aim-on', '1');
      } else aimStyle.setProperty('--aim-on', '0');
    } else aimStyle.setProperty('--aim-on', '0');

    const actionTargetId = aimedId ?? bestId;
    const interactReq = playerInput.consumeInteractRequest();
    const interact = interactReq !== null;
    const primaryWire = interact && wiringActive && !carriedIdRef.current;
    const wireShortcut = playerInput.consumeWire();
    // Batería descargada + generador cerca + conectar sin apuntar a otra pieza = recarga.
    const wirePending = gameStore.getState().pendingWireFrom;
    const rechargeId = (primaryWire || wireShortcut) && wirePending && !actionTargetId &&
      getPartCondition(wirePending) === 'discharged' &&
      nearestChargeStation(scratchPlayerPos.current.x, scratchPlayerPos.current.y, scratchPlayerPos.current.z)
      ? wirePending : null;
    if (rechargeId) {
      setPartCondition(rechargeId, 'ok');
      syncPartConditionToGraph(rechargeId);
      clearPendingWire();
      gameStore.setWireHint(null);
      gameStore.celebrate('¡Batería cargada!', 'Ya entrega energía');
      playWireSnap();
      const chargedAt = grabbableRegistry.getById(rechargeId)?.getBody()?.translation();
      if (chargedAt) dustPoolRef.current?.spawnBurst(chargedAt.x, chargedAt.y + 0.2, chargedAt.z, 'spark');
    } else if (primaryWire || wireShortcut) {
      const result = primaryWire && !actionTargetId
        ? { status: 'invalid', message: 'Apuntá a una pieza compatible' }
        : stepWireConnection(actionTargetId);
      if (result.status === 'connected') {
        gameStore.setWireHint(null);
        gameStore.celebrate('¡Cable conectado!', result.message);
        playWireSnap();
        setTimeout(() => playSpark(), 25);
        const pos = actionTargetId ? grabbableRegistry.getById(actionTargetId)?.getBody()?.translation() : null;
        if (pos) dustPoolRef.current?.spawnBurst(pos.x, pos.y + 0.2, pos.z, 'spark');
      } else gameStore.setWireHint(result.message);
    }

    const usingWelder = gameStore.getState().welderEquipped;
    const weldCommit = () => {
      const slot = mountSlot ?? directSlot;
      if (slot) mountCarriedItem(slot);
      else if (partMountReady && freeTargetId && hitBody) mountCarriedItemOnPart(freeTargetId, hitBody, joinedAxle);
      else if (directWeld) mountCarriedItemOnPart(directWeld.id, directWeld.body, directWeld.axle);
      if (carriedIdRef.current) {
        playBlockedClick();
        gameStore.triggerDropBlocked('mount');
      }
    };
    // Con la soldadora hay que mantener la tecla: la acción solo "arma" la soldadura.
    const performLaserWeld = () => {
      if (usingWelder) weldArmedRef.current = true;
      else weldCommit();
    };
    if (weldArmedRef.current || weldChargeRef.current > 0) {
      const held = playerInput.interactHeld || playerInput.weldHeld || playerInput.touchToolLatch;
      const targetReady = Boolean(mountSlot || directSlot || directWeld || (partMountReady && freeTargetId && hitBody));
      if (!weldArmedRef.current || !usingWelder || !held || !carriedIdRef.current || !aiming || !targetReady) {
        if (usingWelder) playerInput.touchToolLatch = false;
        weldArmedRef.current = false;
        weldChargeRef.current = 0;
        gameStore.setWeldProgress(0);
      } else {
        weldChargeRef.current += dt / WELD_SECONDS;
        weldSparkClockRef.current -= dt;
        const dotPos = wrenchDotRef.current?.position;
        if (weldSparkClockRef.current <= 0 && dotPos) {
          weldSparkClockRef.current = 0.09;
          dustPoolRef.current?.spawnBurst(dotPos.x, dotPos.y + 0.03, dotPos.z, 'spark');
          playSpark();
        }
        if (weldChargeRef.current >= 1) {
          if (usingWelder) playerInput.touchToolLatch = false;
          weldArmedRef.current = false;
          weldChargeRef.current = 0;
          gameStore.setWeldProgress(0);
          weldCommit();
        } else gameStore.setWeldProgress(weldChargeRef.current);
      }
    }

    // Amoladora: mantener clic / E / F apuntando a cualquier pieza soldada la corta y la suelta al instante.
    const usingGrinder = gameStore.getState().grinderEquipped;
    let grindTargetId: string | null = null;
    if (usingGrinder && aiming && !carriedIdRef.current && actionTargetId && !buildToolsLocked()) {
      const grindStation = workshop.stationOf(actionTargetId);
      if (grindStation && workshop.isMounted(actionTargetId) && customRootId(grindStation) !== actionTargetId) {
        grindTargetId = actionTargetId;
      } else if (hasSceneJoint(actionTargetId)) {
        // Unión rompible del escenario (por ejemplo, el foco del faro): la amoladora también la corta.
        const sceneKind = grabbableRegistry.getById(actionTargetId)?.kind;
        if (sceneKind && isCuttableTarget(actionTargetId, sceneKind)) grindTargetId = actionTargetId;
      }
    }
    if (usingGrinder && !grindTargetId) playerInput.touchToolLatch = false;
    if (grindTargetId && (playerInput.interactHeld || playerInput.weldHeld || playerInput.touchToolLatch)) {
      if (grindTargetRef.current !== grindTargetId) {
        grindTargetRef.current = grindTargetId;
        grindChargeRef.current = 0;
      }
      grindChargeRef.current += dt / GRIND_SECONDS;
      weldSparkClockRef.current -= dt;
      const dotPos = wrenchDotRef.current?.position;
      if (weldSparkClockRef.current <= 0 && dotPos) {
        weldSparkClockRef.current = 0.06;
        dustPoolRef.current?.spawnBurst(dotPos.x, dotPos.y + 0.03, dotPos.z, 'spark');
        playSpark();
      }
      if (grindChargeRef.current >= 1) {
        playerInput.touchToolLatch = false;
        grindChargeRef.current = 0;
        grindTargetRef.current = null;
        gameStore.setWeldProgress(0);
        const cutEntry = grabbableRegistry.getById(grindTargetId);
        const cutBody = cutEntry?.getBody();
        for (const removedId of workshop.remove(grindTargetId)) {
          workshopPhysics.detach(removedId);
          const remBody = grabbableRegistry.getById(removedId)?.getBody();
          if (remBody && remBody.isValid()) {
            if (remBody.bodyType() === rapier.RigidBodyType.Fixed) remBody.setBodyType(rapier.RigidBodyType.Dynamic, true);
            remBody.wakeUp();
          }
        }
        releaseSceneJoint(grindTargetId);
        workshopPhysics.updateMotors(workshop);
        gameStore.setCanUndoMount(workshop.canUndo());
        if (cutBody && cutBody.isValid()) {
          const mass = Math.max(0.5, cutBody.mass());
          cutBody.applyImpulse({ x: scratchCamFwd.current.x * mass * 0.6, y: mass * 1.1, z: scratchCamFwd.current.z * mass * 0.6 }, true);
          const at = cutBody.translation();
          dustPoolRef.current?.spawnBurst(at.x, at.y + 0.1, at.z, 'spark');
        }
        playWeldClank();
        gameStore.celebrate('¡Soldadura cortada!');
      } else gameStore.setWeldProgress(grindChargeRef.current);
    } else if (grindChargeRef.current > 0) {
      grindChargeRef.current = 0;
      grindTargetRef.current = null;
      gameStore.setWeldProgress(0);
    }

    // Aerosol: Pintar todo (un clic/toque tiñe la pieza entera) o Mano alzada (mantener o gatillo
    // táctil encendido: trazos de aerógrafo donde pega el láser sobre la pieza).
    {
      const sprayState = gameStore.getState();
      const sprayOn = sprayState.sprayEquipped && aiming && !carriedIdRef.current;
      const tap = playerInput.sprayTap;
      playerInput.sprayTap = false;
      const held = sprayOn && (playerInput.interactHeld || playerInput.weldHeld || playerInput.touchToolLatch);
      const sprayMode = sprayUi.get();
      const color = sprayUi.color();
      const dotPos = wrenchDotRef.current?.position;
      let spraying = false;
      if (sprayOn && dotPos) {
        if (sprayMode.mode === 'fill') {
          if ((tap || (held && !sprayHeldRef.current)) && aimedId && laserHit) {
            if (fillPart(aimedId, color)) sprayFxTimerRef.current = 0.22;
          }
        } else if (held || tap) {
          spraying = true;
          const group = aimedId ? grabbableRegistry.getById(aimedId)?.getVisualGroup() : null;
          if (aimedId && group && laserHit) {
            const from = wrenchStart.current;
            const dir = sprayDir.current.subVectors(dotPos, from);
            const dist = dir.length();
            if (dist > 1e-3) {
              dir.divideScalar(dist);
              const ray = sprayRaycaster.current;
              ray.set(from, dir);
              ray.far = dist + 0.25;
              const hit = ray.intersectObject(group, true).find((h) => (h.object as THREE.Mesh).isMesh);
              if (hit) sprayAt(aimedId, hit, color, sprayMode.nozzle, Math.max(dt, tap ? 0.08 : 0));
            }
          }
        }
      }
      if (!sprayState.sprayEquipped) playerInput.sprayTap = false;
      sprayHeldRef.current = held;
      sprayFxTimerRef.current = Math.max(0, sprayFxTimerRef.current - dt);
      const fxOn = spraying || sprayFxTimerRef.current > 0;
      if (fxOn && dotPos) {
        sprayFx.from.copy(wrenchStart.current);
        sprayFx.to.copy(dotPos);
        sprayFx.color.set(color ?? '#f5ead2');
      }
      if (fxOn !== sprayFx.active) setSprayHiss(fxOn);
      sprayFx.active = fxOn;
      tickPaint(dt);
    }

    // Sierra láser: mantener clic / E sobre una pieza y arrastrar el láser traza la línea de corte;
    // al soltar, el láser recorre la línea con chispas y material al rojo, y la pieza se separa.
    {
      const saw = sawRef.current;
      const bridge = laserTableBridge.get();
      const sawState = gameStore.getState();
      const sawOn = sawState.sawEquipped && aiming && !carriedIdRef.current && !buildToolsLocked();
      let sawHeld = false;
      const dotPos = wrenchDotRef.current?.position;
      const aimedKind = aimedId ? grabbableRegistry.getById(aimedId)?.kind : undefined;
      const setPhase = (phase: 'idle' | 'trace' | 'cut') => {
        saw.phase = phase;
        liveCut.phase = phase;
        gameStore.setSawPhase(phase);
      };
      const abort = () => {
        setPhase('idle');
        liveCut.reset();
        gameStore.setWeldProgress(0);
        if (sawState.sawEquipped) playerInput.touchToolLatch = false;
      };
      // Táctil: Cancelar o alejarse mucho de la pieza descartan el corte armado (sin cortar).
      if (playerInput.touchSawCancel) {
        playerInput.touchSawCancel = false;
        playerInput.touchToolLatch = false;
        if (saw.phase === 'trace') {
          abort();
          gameStore.setWireHint('Corte cancelado');
        }
      } else if (saw.phase === 'trace' && playerInput.touchToolLatch) {
        const sawBody = saw.id ? grabbableRegistry.getById(saw.id)?.getBody() : null;
        const sp = scratchPlayerPos.current;
        if (sawBody?.isValid()) {
          const bp = sawBody.translation();
          if (Math.hypot(bp.x - sp.x, bp.y - sp.y, bp.z - sp.z) > 9) {
            abort();
            gameStore.setWireHint('Te alejaste de la pieza: corte cancelado');
          }
        }
      }
      sawHeld = playerInput.interactHeld || playerInput.weldHeld || playerInput.touchToolLatch;
      if (saw.phase !== 'cut' && !sawOn && saw.phase !== 'idle') abort();
      if (saw.phase === 'idle' && sawOn) {
        if (sawHeld && !saw.wasHeld) {
          if (aimedId && aimedKind && aimedKind !== 'platform' && dotPos && laserHit) {
            saw.id = aimedId;
            saw.normal.set(laserHit.normal.x, laserHit.normal.y, laserHit.normal.z).normalize();
            saw.a.copy(dotPos);
            saw.b.copy(dotPos);
            liveCut.targetId = aimedId;
            liveCut.a.copy(dotPos);
            liveCut.b.copy(dotPos);
            setPhase('trace');
          } else if (aimedKind === 'platform') {
            gameStore.setWireHint('Las chapas se recortan en Herramientas ▸ Cortar en escena');
          } else {
            gameStore.setWireHint('Apuntá el láser a una pieza, mantené clic y arrastrá para marcar el corte');
          }
        }
      } else if (saw.phase === 'trace') {
        if (sawHeld) {
          if (laserHit && aimedId === saw.id && dotPos) saw.b.copy(dotPos);
          liveCut.b.copy(saw.b);
        } else {
          const length = saw.a.distanceTo(saw.b);
          const entry = saw.id ? grabbableRegistry.getById(saw.id) : null;
          const body = entry?.getBody();
          if (length < 0.12 || !saw.id || !body?.isValid()) {
            gameStore.setWireHint('Mantené el clic y arrastrá el láser sobre la pieza para marcar por dónde cortar');
            abort();
          } else {
            const along = scratchSawDir.current.subVectors(saw.b, saw.a).normalize();
            const plane = saw.plane.crossVectors(along, saw.normal);
            if (plane.lengthSq() < 0.04) plane.crossVectors(along, UP);
            plane.normalize();
            const origin = body.translation();
            saw.offset = plane.x * (saw.a.x - origin.x) + plane.y * (saw.a.y - origin.y) + plane.z * (saw.a.z - origin.z);
            const check = bridge?.slice(saw.id, { x: plane.x, y: plane.y, z: plane.z }, saw.offset, true);
            if (!check || check.error) {
              gameStore.setWireHint(check?.error ?? 'El taller no está listo');
              abort();
            } else {
              saw.t = 0;
              saw.duration = THREE.MathUtils.clamp(length / 1.1, 0.6, 1.5);
              saw.spark = 0;
              liveCut.progress = 0;
              liveCut.front.copy(saw.a);
              setPhase('cut');
              playWeldClank();
            }
          }
        }
      } else if (saw.phase === 'cut') {
        saw.t += dt / saw.duration;
        const progress = Math.min(1, saw.t);
        liveCut.progress = progress;
        liveCut.front.lerpVectors(saw.a, saw.b, progress);
        gameStore.setWeldProgress(progress);
        saw.spark -= dt;
        if (saw.spark <= 0) {
          saw.spark = 0.045;
          dustPoolRef.current?.spawnBurst(liveCut.front.x, liveCut.front.y + 0.02, liveCut.front.z, 'spark');
          if (++saw.sound % 3 === 0) playSpark();
        }
        if (saw.t >= 1) {
          const id = saw.id;
          const result = id ? bridge?.slice(id, { x: saw.plane.x, y: saw.plane.y, z: saw.plane.z }, saw.offset) : null;
          for (let i = 0; i <= 5; i++) {
            const k = i / 5;
            dustPoolRef.current?.spawnBurst(
              saw.a.x + (saw.b.x - saw.a.x) * k, saw.a.y + (saw.b.y - saw.a.y) * k + 0.03,
              saw.a.z + (saw.b.z - saw.a.z) * k, 'spark');
          }
          if (result?.error) gameStore.setWireHint(result.error);
          else gameStore.celebrate('¡Pieza cortada!', 'Los trozos y lo soldado quedaron sueltos');
          abort();
        }
      }
      // Táctil: si el toque no llegó a armar el corte (sin pieza apuntada), no queda apretado solo.
      if (sawState.sawEquipped && saw.phase === 'idle') playerInput.touchToolLatch = false;
      saw.wasHeld = sawHeld;
    }

    const partAction = playerInput.consumePartAction();
    let unmountTarget: string | null = null;
    if (partAction === 'unmount' && !carriedIdRef.current) {
      if (buildToolsLocked()) {
        gameStore.setWireHint('En Entrega Delicada se arma por slots');
      } else {
        const targetStation = actionTargetId ? workshop.stationOf(actionTargetId) : undefined;
        if (actionTargetId && targetStation && workshop.isMounted(actionTargetId) &&
          customRootId(targetStation) !== actionTargetId && !workshopPhysics.isReleased(targetStation)) {
          unmountTarget = actionTargetId;
        } else {
          gameStore.setWireHint('Apuntá a una pieza unida a una base fija');
        }
      }
    } else if (partAction) {
      if (partAction === 'drop' && carriedIdRef.current) {
        dropCarriedItem();
      } else if ((partAction === 'weld' || partAction === 'smart-use') && carriedIdRef.current) {
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
        } else if (entry?.kind === 'timerBox') {
          gameStore.setWireHint(cycleTimerPeriod(actionTargetId));
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
    gameStore.setWorkshopSlot((mountSlot ?? directSlot)?.id ?? null);
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
    const sawBusy = gameStore.getState().sawEquipped && aiming && !carriedIdRef.current;
    const primaryInteract = interact && !primaryWire && !grindTargetId && !sawBusy;
    const resolvedInteract = primaryInteract && interactReq && inventoryAction === null
      ? resolvePrimaryInteract(interactReq, {
          isCarrying: Boolean(carriedIdRef.current),
          hasHandling: Boolean(handling && manualStation && manualRoot),
          bestId,
          bestMounted,
          bestRideable,
          requestedRideTargetInReach: Boolean(
            interactReq.targetId && reachableRideableIds.has(interactReq.targetId)
          ),
        })
      : null;
    if ((resolvedInteract?.kind === 'assembly' || requestPosition) && inventoryAction === null && handling && manualStation && manualRoot) {
      if (handling === 'release') workshopPhysics.toggleAssembly(manualStation, manualRoot, workshop);
      if (handling === 'push') pushedAssemblyRef.current = manualStation;
      if (handling === 'heavy') gameStore.setWireHint('Muy pesado para arrastrar · Probá con ruedas');
      if (handling === 'position' || (handling === 'lift' && workshopPhysics.holdAssembly(manualStation, manualRoot, workshop))) {
        const editing = handling === 'position';
        if (editing) workshopPhysics.holdAssemblyForEditing(manualStation, manualRoot, workshop);
        const at = manualRoot.translation();
        const distance = editing ? THREE.MathUtils.clamp(Math.hypot(at.x - x, at.z - z), 2.5, 5) : 1.55;
        heldAssemblyRef.current = { station: manualStation, root: manualRoot, editing, distance, heightOffset: 0 };
        gameStore.setAssemblyInteraction(editing ? 'place' : 'drop');
        gameStore.setNearbyTarget(null, null);
        gameStore.setWorkshopSlot(null);
        gameStore.setCartMode(null);
        gameStore.setWorkshopStatus(null);
        gameStore.setLaserInteraction(null, null, false);
        if (editing) gameStore.setWireHint('Movete para ubicarla · Volvé a interactuar para fijarla');
      }
      return;
    }
    if (resolvedInteract?.kind === 'ride' && inventoryPickup === null && !unmountTarget) {
      const entry = grabbableRegistry.getById(resolvedInteract.targetId);
      const station = workshop.stationOf(resolvedInteract.targetId);
      if (entry && station && isRideableMount(resolvedInteract.targetId, entry.kind, workshop)) {
        enterSeat(ctrl, resolvedInteract.targetId, entry, station);
        return;
      }
    }
    if (resolvedInteract?.kind === 'carry' || resolvedInteract?.kind === 'pickup' || resolvedInteract?.kind === 'unmount' || inventoryPickup !== null || unmountTarget) {
      if (carriedIdRef.current) {
        if (mountSlot || directSlot || directWeld) performLaserWeld();
        else if (!aiming && laserHint) gameStore.triggerDropBlocked('mount');
        else if (!aiming) dropCarriedItem();
        else if (partMountReady && freeTargetId && hitBody) {
          if (usingWelder) performLaserWeld();
          else mountCarriedItemOnPart(freeTargetId, hitBody, joinedAxle);
        } else if (placementReady) {
          const entry = grabbableRegistry.getById(carriedIdRef.current);
          const body = entry?.getBody();
          const collider = entry?.getCollider();
          if (body && collider) finishDrop(body, collider, wrenchPlacedPosition.current, wrenchPlacedRotation.current, { x: 0, y: 0, z: 0 });
        } else if (aimedSlot || aimedPartMount) gameStore.triggerDropBlocked('mount');
        else gameStore.triggerDropBlocked('laser');
      } else {
        const stored = inventoryPickup === null ? null : gameStore.getState().inventorySlots[inventoryPickup];
        const interactTargetId =
          resolvedInteract?.kind === 'unmount' || resolvedInteract?.kind === 'pickup'
            ? resolvedInteract.targetId
            : null;
        const pickupId = unmountTarget ?? stored?.id ?? interactTargetId;
        const entry = pickupId ? grabbableRegistry.getById(pickupId) : undefined;
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
            if (unmountTarget) {
              playWeldClank();
              gameStore.celebrate('¡Unión desmontada!');
            }
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
          clearMountSettle(pickupId);
          const weightSpec = getCarryWeightSpec(entry.kind);
          playGrabThud(weightSpec.weightNorm);
          animDataRef.current.pickupImpulse = weightSpec.weightNorm;
          carryHeftDipRef.current = 0;
          carryHeftVelRef.current = -weightSpec.weightNorm * 1.05;
          carryVisualQuatInitRef.current = false;
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
          carryExactQuatRef.current.copy(scratchDropQuat.current);
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

      const weightSpec = getCarryWeightSpec(kind);
      const stepHorizSpeed = animDataRef.current.isOnGround ? animDataRef.current.speed : 0;
      if (stepHorizSpeed > 0.2) {
        carryStridePhaseRef.current += (stepHorizSpeed / 0.56) * dt;
      } else {
        const nearestStop = Math.round(carryStridePhaseRef.current / Math.PI) * Math.PI;
        carryStridePhaseRef.current = THREE.MathUtils.lerp(carryStridePhaseRef.current, nearestStop, 1 - Math.exp(-11 * dt));
      }
      const heftForce = -carryHeftDipRef.current * 135 - carryHeftVelRef.current * 16;
      carryHeftVelRef.current += heftForce * dt;
      carryHeftDipRef.current = THREE.MathUtils.clamp(carryHeftDipRef.current + carryHeftVelRef.current * dt, -0.075, 0.03);

      const walkAmp = THREE.MathUtils.clamp(stepHorizSpeed / 4.2, 0, 1);
      const stepBob = -Math.abs(Math.cos(carryStridePhaseRef.current)) * weightSpec.bobAmp * (isFirstPerson ? 0.72 : 1.0) * walkAmp;
      const stepSide = Math.sin(carryStridePhaseRef.current) * 0.014 * weightSpec.weightNorm * walkAmp;
      const turnLagSide = THREE.MathUtils.clamp(animDataRef.current.turnRate * 0.008 * weightSpec.weightNorm, -0.032, 0.032);
      const stopLagFwd = THREE.MathUtils.clamp(-animDataRef.current.accelForward * 0.004 * weightSpec.weightNorm, -0.028, 0.028);
      const rightX = Math.cos(activeYaw);
      const rightZ = -Math.sin(activeYaw);
      const lateralVisualOffset = stepSide + turnLagSide;

      const wx = scratchVisualPos.current.x + Math.sin(activeYaw) * (smoothCarryDistRef.current + stopLagFwd) + rightX * lateralVisualOffset;
      const wy = scratchVisualPos.current.y - 0.08 + smoothCarryLiftRef.current + carryHeftDipRef.current + stepBob;
      const wz = scratchVisualPos.current.z + Math.cos(activeYaw) * (smoothCarryDistRef.current + stopLagFwd) + rightZ * lateralVisualOffset;
      carryOrientation(activeYaw, prof.tiltX);
      carryExactQuatRef.current.copy(scratchDropQuat.current);
      if (!carryVisualQuatInitRef.current) {
        carryVisualQuatSmoothRef.current.copy(scratchDropQuat.current);
        carryVisualQuatInitRef.current = true;
      } else {
        carryVisualQuatSmoothRef.current.slerp(scratchDropQuat.current, 1 - Math.exp(-20 * dt));
      }

      grabbableRegistry.carriedVisualPos.set(wx, wy, wz);
      grabbableRegistry.carriedVisualQuat.copy(carryVisualQuatSmoothRef.current);
      const vis = entry?.getVisualGroup();
      if (vis) {
        vis.position.set(wx, wy, wz);
        vis.quaternion.copy(carryVisualQuatSmoothRef.current);
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
  // Juntas rompibles: suelta las piezas cuya unión superó su umbral de fuerza o par.
  const releaseBrokenMounts = (ids: readonly string[]) => {
    let released = false;
    for (const id of ids) {
      if (!workshop.isMounted(id)) continue;
      const at = grabbableRegistry.getById(id)?.getBody()?.translation();
      for (const remId of workshop.remove(id)) {
        workshopPhysics.detach(remId);
        const body = grabbableRegistry.getById(remId)?.getBody();
        if (body?.isValid()) {
          body.setBodyType(rapier.RigidBodyType.Dynamic, true);
          body.wakeUp();
        }
      }
      if (at) dustPoolRef.current?.spawnBurst(at.x, at.y + 0.2, at.z, 'spark');
      released = true;
    }
    if (!released) return;
    workshopPhysics.updateMotors(workshop);
    playSpark();
    contractStore.setBrokenWelds(contractStore.getState().brokenWeldsCount + 1, Boolean(lastIntactBlueprintRef.current));
    gameStore.setWireHint('¡Se soltó una pieza! Tocá Reparar (1 clic)');
  };

  // Uniones rompibles del escenario: chispas y sonido cuando una cede.
  useEffect(() => onJointBroken((at) => {
    dustPoolRef.current?.spawnBurst(at.x, at.y + 0.2, at.z, 'spark');
    playSpark();
  }), []);

  useAfterPhysicsStep((physicsWorld) => {
    const brokenMounts = workshopPhysics.stepBreakage(1 / 60, defaultJointBreakFor(expeditionStore.getState().activeLevelId));
    if (brokenMounts.length > 0) releaseBrokenMounts(brokenMounts);
    if (gameStore.getState().testBench && workshopTime.current >= nextBenchSample.current) {
      nextBenchSample.current = workshopTime.current + 0.05;
      gameStore.setBenchRpm(workshopPhysics.benchRpm());
      gameStore.setBenchEngines([...(workshopPhysics.benchMotors() ?? [])]);
    }
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
    if (enabled && p.y < -12) {
      const [x, y, z] = SPAWN_POS;
      const wasDriving = Boolean(seatedIdRef.current);
      playerInput.resetAll();
      if (wasDriving) leaveSeat(ctrl, { x, y, z });
      else ctrl.body.setTranslation({ x, y, z }, true);
      ctrl.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      ctrl.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      if (wasDriving && lastIntactBlueprintRef.current) playerInput.triggerCartAction('retry');
      gameStore.setWireHint('Volviste al taller');
      return;
    }
    if (enabled && isInTowerNutReach(p) && gameStore.collectTowerNut()) {
      gameStore.celebrate('¡Tuerca Dorada!', 'Atardecer del Mirador desbloqueado en el Vestidor', 'achievement');
      playSuccessChime();
    }
    const activeContractId = contractStore.getState().activeContractId;
    const hasSeatedContract = Boolean(seatedIdRef.current && activeContractId);
    const shouldTickMode = Boolean(seatedIdRef.current && gameModeStore.getState().mode !== 'sandbox');
    if (enabled && activeContractId === 'first-drive') gameStore.setStarterBuildStep(workshop.starterBuildStep());
    if (enabled && activeContractId && !seatedIdRef.current && !playerInput.menuOpen) {
      contractStore.tickContract(physicsWorld.timestep, p, { wheels: 0, displacedBarrels: 0, onFoot: true });
    }
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
    if (enabled && !playerInput.menuOpen && (shouldTickMode || hasSeatedContract)) {
      const station = seatedIdRef.current ? workshop.stationOf(seatedIdRef.current) : undefined;
      const driveRootId = station && customRootId(station);
      const root = driveRootId ? grabbableRegistry.getById(driveRootId)?.getBody() : cartBodyRef.current;
      if (root?.isValid() && root.isDynamic()) {
        const position = root.translation();
        if (shouldTickMode) {
          const before = gameModeStore.getState().checkpointIndex;
          gameModeStore.tick(physicsWorld.timestep, position);
          const mode = gameModeStore.getState();
          if (mode.mode === 'race' && !mode.raceFinished && mode.checkpointIndex > before) {
            gameStore.celebrate('¡Aro superado!', `Aro ${mode.checkpointIndex}`, 'achievement');
          }
        }
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
            welderEquipped={welderEquipped}
            grinderEquipped={grinderEquipped}
            sawEquipped={sawEquipped}
            wireEquipped={wireToolEquipped}
            sprayEquipped={sprayEquipped}
            toolWorking={toolWorking}
            seated={seated}
            alignToGround
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
      <group ref={placementPreviewRef} visible={false}>
        <group ref={placementModelRef} />
        <mesh ref={placementBoxRef}>
          <boxGeometry />
          <meshBasicMaterial color="#9cf6db" transparent opacity={0.47} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh ref={placementCylinderRef}>
          <cylinderGeometry args={[0.5, 0.5, 1, 12]} />
          <meshBasicMaterial color="#9cf6db" transparent opacity={0.47} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh ref={placementAxisRef}>
          <cylinderGeometry args={[0.012, 0.012, 1, 6]} />
          <meshBasicMaterial color="#ffe066" toneMapped={false} />
        </mesh>
      </group>
      <DustPuffPool ref={dustPoolRef} maxCount={maxDustPuffs} />
      <SprayMist />
      <RoboticRopes />
    </>
  );
}
