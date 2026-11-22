import { describe, expect, it } from 'vitest';
import { WorkshopAssembly, workshopPartTypeForKind } from '../src/invention/workshopAssembly';

const ids = (assembly: WorkshopAssembly, station: `custom:${string}`) =>
  Array.from(assembly.partsAt(station), ({ id }) => id).sort();

describe('módulos sueltos sin chasis', () => {
  it('imán + propulsor + interruptor forman una creación sin chasis', () => {
    const assembly = new WorkshopAssembly();
    const base = workshopPartTypeForKind('magnet');
    expect(assembly.mountOnPart('thr-1', 'mag-1', workshopPartTypeForKind('thruster'), undefined, base)).not.toBeNull();
    expect(assembly.mountOnPart('sw-1', 'mag-1', workshopPartTypeForKind('switchBox'), undefined, base)).not.toBeNull();
    expect(ids(assembly, 'custom:mag-1')).toEqual(['mag-1', 'sw-1', 'thr-1']);
    expect(assembly.hasWheels('custom:mag-1')).toBe(false);
  });

  it('guante de boxeo + temporizador + soporte forman otra creación sin chasis', () => {
    const assembly = new WorkshopAssembly();
    const base = workshopPartTypeForKind('boxingGlove');
    expect(assembly.mountOnPart('timer-1', 'glove-1', workshopPartTypeForKind('timerBox'), undefined, base)).not.toBeNull();
    expect(assembly.mountOnPart('rack-1', 'glove-1', workshopPartTypeForKind('cargoRack'), undefined, base)).not.toBeNull();
    expect(ids(assembly, 'custom:glove-1')).toEqual(['glove-1', 'rack-1', 'timer-1']);
  });
});

describe('asiento y batería usable', () => {
  it('hasSeat detecta el asiento por estación', () => {
    const assembly = new WorkshopAssembly();
    expect(assembly.hasSeat('custom:seat-1')).toBe(false);
    assembly.mountOnPart('bat-1', 'seat-1', 'battery', undefined, 'seat');
    expect(assembly.hasSeat('custom:seat-1')).toBe(true);
    expect(assembly.hasSeat('cart')).toBe(false);
  });

  it('una batería descargada no cuenta como energía', () => {
    const assembly = new WorkshopAssembly();
    assembly.mountOnPart('bat-1', 'chassis-1', 'battery', undefined, 'chassis');
    expect(assembly.hasBattery('custom:chassis-1')).toBe(true);
    expect(assembly.hasBattery('custom:chassis-1', (id) => id !== 'bat-1')).toBe(false);
  });
});
