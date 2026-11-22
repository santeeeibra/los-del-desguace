import type { RapierCollider, RapierRigidBody, useRapier } from '@react-three/rapier';
import { Quaternion, Vector3 } from 'three';
import { bodyworkKindFromId } from './bodywork';
import { fillPart, paintColorOf } from './paintStore';
import { createBlueprint, type BlueprintPartEntry, type ContraptionBlueprint } from '../logic/blueprintManager';
import type { LogicGraph } from '../logic/logicGraph';
import { grabbableRegistry } from '../props/grabbableRegistry';
import {
  FREE_BUILD_ORIGIN,
  WORKSHOP_SLOT_BY_ID,
  WorkshopAssembly,
  customRootId,
  isCustomStation,
  workshopPartTypeForKind,
  type WorkshopMount,
  type WorkshopSlot,
  type WorkshopStation,
} from './workshopAssembly';
import { getWorkshopSlotPose, type createWorkshopPhysics } from './workshopPhysics';

type Physics = ReturnType<typeof createWorkshopPhysics>;
type RapierContext = ReturnType<typeof useRapier>;
const wheelColliderRotation = new Quaternion(0, 0, Math.SQRT1_2, Math.SQRT1_2);

function partExtraMeta(id: string): Pick<BlueprintPartEntry, 'paint' | 'bodyworkKind'> {
  const paint = paintColorOf(id);
  const bodyworkKind = bodyworkKindFromId(id);
  return {
    ...(paint ? { paint } : {}),
    ...(bodyworkKind ? { bodyworkKind } : {}),
  };
}

export function captureCartBlueprint(
  name: string,
  assembly: WorkshopAssembly,
  physics: Physics,
  graph: LogicGraph,
  station: WorkshopStation = 'cart',
) {
  const parts: BlueprintPartEntry[] = [];
  if (isCustomStation(station)) {
    const rootId = customRootId(station);
    if (!rootId) return null;
    const entries = Array.from(assembly.partsAt(station));
    const ordered: Array<{ id: string; mount: WorkshopMount }> = [];
    const added = new Set<string>();
    const rootItem = entries.find((item) => item.id === rootId);
    if (!rootItem) return null;
    ordered.push(rootItem);
    added.add(rootId);
    while (ordered.length < entries.length) {
      let progressed = false;
      for (const item of entries) {
        if (added.has(item.id)) continue;
        if (!item.mount.parentId || added.has(item.mount.parentId)) {
          ordered.push(item);
          added.add(item.id);
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    for (const { id, mount } of ordered) {
      const entry = grabbableRegistry.getById(id);
      if (!entry) return null;
      if (id === rootId) {
        const rootBody = entry.getBody();
        if (!rootBody?.isValid()) return null;
        const rootY = rootBody.translation().y;
        parts.push({
          partId: id,
          kind: entry.kind,
          slotId: `root:${id}`,
          localPos: [0, Math.max(0.45, Math.min(2.0, rootY)), 0],
          localRot: [0, 0, 0, 1],
          ...partExtraMeta(id),
        });
        continue;
      }
      const pose = physics.getLocalAttachment(id);
      const axle = pose?.axis;
      if (!pose) return null;
      parts.push({
        partId: id,
        kind: entry.kind,
        slotId: mount.id,
        parentId: mount.parentId,
        localPos: pose.position.toArray(),
        localRot: pose.rotation.toArray(),
        axle: axle ? { x: axle.x, y: axle.y, z: axle.z } : undefined,
        ...(physics.isSteerable(id) ? { steer: true } : {}),
        ...partExtraMeta(id),
      });
    }
  } else {
    for (const { id, mount } of assembly.partsAt('cart')) {
      const entry = grabbableRegistry.getById(id);
      if (!entry) return null;
      if (!mount.parentId && !mount.id.startsWith('free:cart:')) {
        const slot = WORKSHOP_SLOT_BY_ID.get(mount.id);
        if (!slot) return null;
        const rotation = slot.mountRotation;
        parts.push({
          partId: id, kind: entry.kind, slotId: slot.id, localPos: slot.position,
          localRot: rotation ? [rotation.x, rotation.y, rotation.z, rotation.w] : [0, 0, 0, 1],
          ...partExtraMeta(id),
        });
        continue;
      }
      const pose = physics.getLocalAttachment(id);
      const axle = pose?.axis;
      if (!pose) return null;
      parts.push({
        partId: id, kind: entry.kind, slotId: mount.id, parentId: mount.parentId,
        localPos: pose.position.toArray(), localRot: pose.rotation.toArray(),
        axle: axle ? { x: axle.x, y: axle.y, z: axle.z } : undefined,
        ...(physics.isSteerable(id) ? { steer: true } : {}),
        ...partExtraMeta(id),
      });
    }
  }
  if (!parts.length) return null;

  const snapshot = graph.toJSON();
  const partIds = new Set(parts.map((part) => part.partId));
  const nodeIds = new Set(snapshot.nodes.filter((node) => node.bodyId && partIds.has(node.bodyId)).map((node) => node.id));
  let previousSize = -1;
  while (previousSize !== nodeIds.size) {
    previousSize = nodeIds.size;
    for (const wire of snapshot.wires) {
      if (nodeIds.has(wire.fromNodeId) || nodeIds.has(wire.toNodeId)) {
        nodeIds.add(wire.fromNodeId);
        nodeIds.add(wire.toNodeId);
      }
    }
  }
  return createBlueprint(
    name,
    parts,
    {
      toJSON: () => ({
        ...snapshot,
        nodes: snapshot.nodes.filter((node) => nodeIds.has(node.id)),
        wires: snapshot.wires.filter((wire) => nodeIds.has(wire.fromNodeId)),
      }),
    },
    isCustomStation(station) ? { rootPartId: customRootId(station), category: 'free' } : { category: 'cart' },
  );
}

interface PlannedPart {
  body: RapierRigidBody;
  collider: RapierCollider;
  position: Vector3;
  rotation: Quaternion;
  shapeRotation: Quaternion;
  slot?: WorkshopSlot;
  freeOnCart: boolean;
  isRoot: boolean;
  axis?: Vector3;
  steer?: boolean;
}

export function restoreCartBlueprint(
  blueprint: ContraptionBlueprint,
  cart: RapierRigidBody,
  assembly: WorkshopAssembly,
  physics: Physics,
  graph: LogicGraph,
  { world, rapier }: Pick<RapierContext, 'world' | 'rapier'>,
  unavailableIds: ReadonlySet<string>,
  repairAt?: readonly [number, number, number],
  retrieveFromInventory?: ReadonlySet<string>,
): string | null {
  const rootId = blueprint.rootPartId;
  const targetStation: WorkshopStation = rootId ? `custom:${rootId}` : 'cart';
  const rootEntry = rootId ? grabbableRegistry.getById(rootId) : undefined;
  const rootBody = rootId ? rootEntry?.getBody() : cart;
  if (!rootBody?.isValid()) {
    return 'Falta la pieza base del plano';
  }

  const cartRotation = new Quaternion();
  const pivot = new Vector3();
  if (rootId) {
    pivot.set(...(repairAt ?? FREE_BUILD_ORIGIN));
  } else if (repairAt) {
    pivot.set(...repairAt);
  } else {
    pivot.copy(cart.translation());
    cartRotation.copy(cart.rotation());
  }
  const cartPose = { translation: () => pivot, rotation: () => cartRotation };
  const existingOnTarget = new Set(Array.from(assembly.partsAt(targetStation), ({ id }) => id));

  const childrenMap = new Map<string, string[]>();
  const touchedStations = new Set<WorkshopStation>([targetStation]);
  for (const part of blueprint.parts) {
    const st = assembly.stationOf(part.partId);
    if (st) touchedStations.add(st);
  }
  for (const st of touchedStations) {
    for (const { id, mount } of assembly.partsAt(st)) {
      if (mount.parentId) {
        const list = childrenMap.get(mount.parentId);
        if (list) list.push(id);
        else childrenMap.set(mount.parentId, [id]);
      }
    }
  }
  const allDetachedIds = new Set<string>(existingOnTarget);
  const detachQueue = [
    ...existingOnTarget,
    ...blueprint.parts.map((p) => p.partId).filter((id) => assembly.isMounted(id)),
  ];
  while (detachQueue.length > 0) {
    const cur = detachQueue.shift()!;
    allDetachedIds.add(cur);
    for (const childId of childrenMap.get(cur) ?? []) {
      if (!allDetachedIds.has(childId)) detachQueue.push(childId);
    }
  }

  const draft = new WorkshopAssembly();
  const planned = new Map<string, PlannedPart>();
  const movingHandles = new Set<number>();
  for (const id of allDetachedIds) {
    const body = grabbableRegistry.getById(id)?.getBody();
    if (body?.isValid()) movingHandles.add(body.handle);
  }
  for (const part of blueprint.parts) {
    const entry = grabbableRegistry.getById(part.partId);
    const body = entry?.getBody();
    const collider = entry?.getCollider();
    const retrieve = retrieveFromInventory?.has(part.partId);
    if (part.kind !== entry?.kind || !body?.isValid() || !collider?.isValid() ||
        (!retrieve && (!body.isEnabled() || !collider.isEnabled() || unavailableIds.has(part.partId)))) {
      return 'Hay piezas del plano que están guardadas, montadas o ausentes';
    }

    const type = workshopPartTypeForKind(part.kind);
    const isRoot = Boolean(rootId && !part.parentId && part.partId === rootId);
    const parent = part.parentId ? planned.get(part.parentId) : undefined;
    const freeOnCart = !rootId && !part.parentId && part.slotId.startsWith('free:cart:');
    const slot = rootId || part.parentId || freeOnCart ? undefined : WORKSHOP_SLOT_BY_ID.get(part.slotId);
    if (part.parentId && !parent) return 'El plano tiene una unión inválida';
    let position: Vector3;
    let rotation: Quaternion;
    let axis: Vector3 | undefined;
    if (isRoot) {
      position = new Vector3(...part.localPos).applyQuaternion(cartRotation).add(pivot);
      rotation = cartRotation.clone().multiply(new Quaternion(...part.localRot)).normalize();
    } else if (parent || freeOnCart) {
      const parentEntry = part.parentId ? grabbableRegistry.getById(part.parentId) : undefined;
      const parentType = parentEntry ? workshopPartTypeForKind(parentEntry.kind) : 'fixture';
      const mount = part.parentId
        ? draft.mountOnPart(part.partId, part.parentId, type, part.axle, parentType)
        : draft.mountFreeOnCart(part.partId, type, part.axle);
      if (!mount) return 'El plano tiene una unión incompatible';
      const parentRotation = parent?.rotation ?? cartRotation;
      position = new Vector3(...part.localPos).applyQuaternion(parentRotation).add(parent?.position ?? pivot);
      rotation = parentRotation.clone().multiply(new Quaternion(...part.localRot)).normalize();
      if (part.axle) axis = new Vector3().copy(part.axle).applyQuaternion(parentRotation).normalize();
    } else {
      if (slot?.station !== 'cart' || !draft.mount(part.partId, slot, type)) return 'El plano tiene un encastre incompatible';
      const pose = getWorkshopSlotPose(slot, cartPose);
      position = new Vector3().copy(pose.position);
      rotation = new Quaternion().copy(pose.rotation);
    }
    const shapeRotation = part.kind === 'wheel' ? rotation.clone().multiply(wheelColliderRotation) : rotation;
    planned.set(part.partId, { body, collider, position, rotation, shapeRotation, slot, axis, freeOnCart, isRoot, steer: part.steer });
    movingHandles.add(body.handle);
  }

  const nodes = new Set(blueprint.logic.nodes.map((node) => node.id));
  const clearedBodyIds = new Set<string>([...allDetachedIds, ...blueprint.parts.map((p) => p.partId)]);
  const oldNodes = new Set(graph.getNodes().filter((node) => node.bodyId && clearedBodyIds.has(node.bodyId)).map((node) => node.id));
  const allWires = graph.getWires();
  const oldWires = allWires.filter((wire) => oldNodes.has(wire.fromNodeId) || oldNodes.has(wire.toNodeId));
  const oldWireIds = new Set(oldWires.map((wire) => wire.id));
  const existingWires = allWires.filter((wire) => !oldWireIds.has(wire.id));
  for (const node of blueprint.logic.nodes) {
    const existing = graph.getNode(node.id);
    if (node.bodyId && (!grabbableRegistry.getById(node.bodyId) ||
        (unavailableIds.has(node.bodyId) && !retrieveFromInventory?.has(node.bodyId)))) {
      return 'Falta una pieza del circuito del plano';
    }
    if (existing && existingWires.some((wire) => wire.fromNodeId === node.id || wire.toNodeId === node.id) &&
        (existing.kind !== node.kind || existing.bodyId !== node.bodyId)) {
      return 'El circuito del plano se superpone con otro armado';
    }
  }
  for (const wire of blueprint.logic.wires) {
    if (!nodes.has(wire.fromNodeId) || !nodes.has(wire.toNodeId)) return 'El plano tiene un cable inválido';
    if (existingWires.some((existing) => existing.toNodeId === wire.toNodeId &&
      existing.toPort === wire.toPort && (existing.fromNodeId !== wire.fromNodeId || existing.fromPort !== wire.fromPort))) {
      return 'Retirá primero el cable que ocupa la entrada';
    }
  }

  const checked: Array<{ id: string; part: PlannedPart; parentId?: string }> = [];
  if (repairAt && !rootId) {
    movingHandles.add(cart.handle);
    const previousPosition = cart.translation();
    const inverse = new Quaternion().copy(cart.rotation()).invert();
    for (let i = 0; i < cart.numColliders(); i++) {
      const collider = cart.collider(i);
      const localPosition = new Vector3().copy(collider.translation()).sub(previousPosition).applyQuaternion(inverse);
      const localRotation = new Quaternion().copy(collider.rotation()).premultiply(inverse);
      const repairPosition = localPosition.clone().add(pivot);
      if (world.intersectionWithShape(repairPosition, localRotation, collider.shape,
          rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined,
          (other) => !movingHandles.has(other.parent()?.handle ?? -1))) {
        return 'Liberá el punto de reparación en el taller';
      }
      if ([...planned.values()].some((part) => collider.shape.intersectsShape(repairPosition, localRotation,
          part.collider.shape, part.position, part.shapeRotation))) return 'El plano se superpone con el chasis';
    }
  }
  for (const { partId, parentId } of blueprint.parts) {
    const part = planned.get(partId)!;
    const obstructed = world.intersectionWithShape(part.position, part.shapeRotation, part.collider.shape,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined,
      (collider) => !movingHandles.has(collider.parent()?.handle ?? -1));
    const overlaps = checked.some(({ id, part: other }) => id !== parentId &&
      part.collider.shape.intersectsShape(part.position, part.shapeRotation, other.collider.shape, other.position, other.shapeRotation));
    if (obstructed || overlaps) {
      if (repairAt && part.isRoot && obstructed) return 'Liberá el punto de reparación en el taller';
      return 'Liberá el espacio alrededor del carrito antes de cargar el plano';
    }
    checked.push({ id: partId, part, parentId });
  }

  const displaced: Array<{ body: RapierRigidBody; collider: RapierCollider; position: Vector3; rotation: Quaternion }> = [];
  for (const id of existingOnTarget) {
    if (planned.has(id)) continue;
    const entry = grabbableRegistry.getById(id);
    const body = entry?.getBody();
    const collider = entry?.getCollider();
    if (!entry || !body?.isValid() || !collider?.isValid()) continue;
    const rotation = entry.kind === 'wheel' ? wheelColliderRotation : new Quaternion();
    let position: Vector3 | undefined;
    for (let turn = 0; turn < 16; turn++) {
      const angle = turn * Math.PI / 4;
      const radius = 2.4 + Math.floor(turn / 8) * 1.4;
      const candidate = new Vector3(pivot.x + Math.cos(angle) * radius, Math.max(0.62, pivot.y + 0.35),
        pivot.z + Math.sin(angle) * radius);
      if (world.intersectionWithShape(candidate, rotation, collider.shape,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined,
        (other) => !movingHandles.has(other.parent()?.handle ?? -1))) continue;
      if (checked.some(({ part }) => collider.shape.intersectsShape(candidate, rotation,
        part.collider.shape, part.position, part.shapeRotation))) continue;
      if (displaced.some((part) => collider.shape.intersectsShape(candidate, rotation,
        part.collider.shape, part.position, part.rotation))) continue;
      position = candidate;
      break;
    }
    if (!position) return 'Liberá espacio para las piezas del armado actual';
    displaced.push({ body, collider, position, rotation });
  }

  if (!rootId && physics.isCartReleased()) physics.toggleCart(cart, assembly);
  if (rootId && physics.isReleased(targetStation) && rootBody?.isValid()) {
    physics.toggleAssembly(targetStation, rootBody, assembly);
  }
  for (const id of allDetachedIds) {
    for (const removedId of assembly.remove(id)) {
      physics.detach(removedId);
      if (!planned.has(removedId) && !existingOnTarget.has(removedId)) {
        const remBody = grabbableRegistry.getById(removedId)?.getBody();
        if (remBody?.isValid()) {
          if (remBody.bodyType() === rapier.RigidBodyType.Fixed) {
            remBody.setBodyType(rapier.RigidBodyType.Dynamic, true);
          }
          remBody.wakeUp();
        }
      }
    }
  }
  for (const wire of oldWires) graph.disconnect(wire.id);
  if (repairAt && !rootId) {
    cart.setTranslation(pivot, true);
    cart.setRotation(cartRotation, true);
    cart.setLinvel({ x: 0, y: 0, z: 0 }, true);
    cart.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
  for (const { body, position } of displaced) {
    if (body.bodyType() === rapier.RigidBodyType.Fixed) {
      body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    }
    body.setTranslation(position, true);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.wakeUp();
  }

  for (const { id, part, parentId } of checked) {
    const { body, position, rotation, slot, axis, isRoot } = part;
    const kind = grabbableRegistry.getById(id)!.kind;
    const type = workshopPartTypeForKind(kind);
    body.setTranslation(position, true);
    body.setRotation(rotation, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (retrieveFromInventory?.has(id)) {
      body.setBodyType(rapier.RigidBodyType.Dynamic, true);
      body.setEnabled(true);
      part.collider.setEnabled(true);
      part.collider.setSensor(false);
    } else if (!isRoot && body.bodyType() !== rapier.RigidBodyType.Dynamic) {
      body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    }
    if (isRoot) {
      physics.fixCustomRoot(body);
    } else if (slot) {
      assembly.mount(id, slot, type);
      physics.attach(id, slot, body, cart);
    } else if (parentId) {
      const parent = planned.get(parentId)!;
      const parentEntry = grabbableRegistry.getById(parentId);
      const parentType = parentEntry ? workshopPartTypeForKind(parentEntry.kind) : 'fixture';
      const mount = assembly.mountOnPart(id, parentId, type, axis, parentType)!;
      physics.attachOnPart(id, mount, body, parent.body, position, rotation, axis, { steer: part.steer });
    } else if (part.freeOnCart) {
      const mount = assembly.mountFreeOnCart(id, type, axis)!;
      physics.attachOnPart(id, mount, body, cart, position, rotation, axis, { steer: part.steer });
    }
  }
  for (const node of blueprint.logic.nodes) {
    if (!graph.hasConnection(node.id)) graph.addNode(node.id, node.kind, node.config, node);
  }
  for (const wire of blueprint.logic.wires) {
    graph.connect(wire.fromNodeId, wire.toNodeId, { fromPort: wire.fromPort, toPort: wire.toPort });
  }
  for (const part of blueprint.parts) {
    if (part.paint) fillPart(part.partId, part.paint);
  }
  physics.parkRestoredAssembly(targetStation, rootBody);
  world.propagateModifiedBodyPositionsToColliders();
  physics.updateMotors(assembly);
  return null;
}
