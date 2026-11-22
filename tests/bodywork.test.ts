import rapier from '@dimforge/rapier3d-compat';
import { describe, expect, it } from 'vitest';
import { bodyworkId, bodyworkKindFromId, bodyworkStore, BODYWORK_SPECS } from '../src/invention/bodywork';
import { resolveBodyworkSnap } from '../src/invention/interactResolution';
import { WorkshopAssembly } from '../src/invention/workshopAssembly';
import { createWorkshopPhysics } from '../src/invention/workshopPhysics';

describe('Carrocería modular', () => {
  it('la variante viaja en el id de la pieza', () => {
    expect(bodyworkKindFromId(bodyworkId('panel_wedge', 3))).toBe('panel_wedge');
    expect(bodyworkKindFromId('extra-bodywork-window_frame-12')).toBe('window_frame');
    expect(bodyworkKindFromId('extra-wheel-4')).toBeNull();
  });

  it('una chapa plana se encastra pegada al borde delantero del chasis', () => {
    const snap = resolveBodyworkSnap(bodyworkId('panel_flat', 1), {
      id: 'chasis-1', kind: 'chassis', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
    }, { x: 0.1, y: 0, z: 0.9 });
    expect(snap?.hostEdge).toBe('front');
    expect(snap!.position.z).toBeCloseTo(0.95 + BODYWORK_SPECS.panel_flat.size[2] / 2 + 0.005, 3);
  });

  it('lejos de todo borde no encastra', () => {
    const snap = resolveBodyworkSnap(bodyworkId('panel_flat', 2), {
      id: 'chasis-1', kind: 'chassis', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
    }, { x: 3, y: 2, z: 3 });
    expect(snap).toBeNull();
  });

  it('el vidrio se raja y después estalla; reparar lo deja nuevo', () => {
    const id = bodyworkId('window_frame', 9);
    expect(bodyworkStore.glassOf(id)).toBe('intact');
    expect(bodyworkStore.impact(id, 130)?.nextState).toBe('cracked');
    expect(bodyworkStore.impact(id, 230)?.spawnShards).toBe(true);
    expect(bodyworkStore.glassOf(id)).toBe('shattered');
    bodyworkStore.repairGlass(id);
    expect(bodyworkStore.glassOf(id)).toBe('intact');
  });

  it('la carrocería en cuña aumenta la aceleración y velocidad tope por aerodinámica', async () => {
    await rapier.init();
    const runDrive = (withWedge: boolean) => {
      const world = new rapier.World({ x: 0, y: 0, z: 0 });
      try {
        const assembly = new WorkshopAssembly();
        const physics = createWorkshopPhysics({ world, rapier });
        const root = world.createRigidBody(rapier.RigidBodyDesc.fixed());
        world.createCollider(rapier.ColliderDesc.cuboid(0.65, 0.055, 1.12).setMass(14), root);
        assembly.mountFreeOnCart('eng-1', 'engine');
        if (withWedge) {
          assembly.mountFreeOnCart(bodyworkId('panel_wedge', 1), 'bodywork');
          assembly.mountFreeOnCart(bodyworkId('window_frame', 2), 'bodywork');
        }
        physics.toggleAssembly('cart', root, assembly, true);
        for (let i = 0; i < 60; i++) {
          physics.driveAssembly('cart', root, 1, 1 / 60, assembly);
          world.step();
        }
        return root.linvel().z;
      } finally {
        world.free();
      }
    };
    expect(runDrive(true)).toBeGreaterThan(runDrive(false));
  });
});
