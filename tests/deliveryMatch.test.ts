import { describe, expect, it } from 'vitest';
import {
  DELIVERY_RULES as R,
  applyImpact,
  applyRescue,
  chooseRoute,
  createDeliveryMatch,
  deliver,
  hostLeft,
  impactDamage,
  markReady,
  scoreDelivery,
  tickDelivery,
  tightenBumper,
  voteRematch,
} from '../src/modes/delivery/deliveryMatch';

const NONE = { shockAbsorber: false, bumper: false };
const running = () => tickDelivery(createDeliveryMatch(), R.buildSec + 0.01);

describe('Entrega Delicada: reloj', () => {
  it('construcción de 1:00 y recorrido de 3:00', () => {
    const s = running();
    expect(s.phase).toBe('run');
    expect(s.remainingSec).toBe(R.runSec);
    expect(tickDelivery(s, R.runSec + 1)).toMatchObject({ phase: 'result', end: 'timeout' });
  });

  it('si todos marcan Listo, el tiempo sobrante pasa al recorrido', () => {
    let s = tickDelivery(createDeliveryMatch(), 20);
    s = markReady(s, 'a', 2);
    expect(s.phase).toBe('build');
    s = markReady(s, 'a', 2); // repetido no cuenta
    expect(s.phase).toBe('build');
    s = markReady(s, 'b', 2);
    expect(s).toMatchObject({ phase: 'run', carriedOverSec: 40, remainingSec: R.runSec + 40 });
  });
});

describe('Entrega Delicada: daño de la carga', () => {
  it('los golpes suaves no dañan y ninguno quita más del tope', () => {
    const s = running();
    expect(impactDamage(s, { impulse: R.impactThreshold }, NONE)).toBe(0);
    expect(impactDamage(s, { impulse: 1000 }, NONE)).toBe(R.maxDamagePerHit);
  });

  it('amortiguador y Sujetar a tiempo reducen el daño', () => {
    const s = running();
    const base = impactDamage(s, { impulse: 10 }, NONE);
    expect(impactDamage(s, { impulse: 10 }, { shockAbsorber: true, bumper: false })).toBeCloseTo(base * R.shockAbsorber);
    expect(impactDamage(s, { impulse: 10, heldOnTime: true }, NONE)).toBeCloseTo(base * R.holdOnTime);
  });

  it('el paragolpes protege solo de frente y se dobla con los golpes fuertes, sin llegar a cero', () => {
    let s = running();
    const loadout = { shockAbsorber: false, bumper: true };
    expect(impactDamage(s, { impulse: 10 }, loadout)).toBe(impactDamage(s, { impulse: 10 }, NONE));
    for (let i = 0; i < 6; i++) s = applyImpact(s, { impulse: 30, frontal: true }, loadout);
    expect(s.bumperProtection).toBe(R.bumperMin);
    expect(tightenBumper(s).bumperProtection).toBe(R.bumperStart);
  });

  it('la integridad baja hasta 0 pero la partida sigue y se puede entregar', () => {
    let s = running();
    for (let i = 0; i < 10; i++) s = applyImpact(s, { impulse: 1000 }, NONE);
    expect(s.integrity).toBe(0);
    expect(s.phase).toBe('run');
    s = deliver(s);
    expect(scoreDelivery(s)).toMatchObject({ stars: 0, message: 'Llegó hecha pedazos… pero llegó.' });
  });
});

describe('Entrega Delicada: rescates, resultado y revancha', () => {
  it('los rescates cuestan tiempo e integridad sin terminar la partida', () => {
    let s = running();
    s = applyRescue(s, 'upright');
    expect(s.remainingSec).toBe(R.runSec - R.rescue.uprightSec);
    s = applyRescue(s, 'lostCargo');
    expect(s.integrity).toBe(100 - R.rescue.lostCargoIntegrity);
    s = tickDelivery(s, s.remainingSec - 0.5);
    s = applyRescue(s, 'repair');
    expect(s.phase).toBe('run');
    expect(s.remainingSec).toBeGreaterThan(0);
  });

  it('puntúa estrellas, bonus de tiempo y medalla de ruta', () => {
    let s = chooseRoute(running(), 'shortcut');
    s = applyImpact(s, { impulse: 10 }, NONE); // −15
    s = deliver(tickDelivery(s, 100));
    expect(scoreDelivery(s)).toEqual({ stars: 3, timeBonus: 160, total: 850 + 160, medal: 'Atajo', message: '¡Entregada al 85 %!' });
  });

  it('si sale el anfitrión hay resultado claro y no hay revancha', () => {
    const s = hostLeft(running());
    expect(scoreDelivery(s).message).toBe('El anfitrión salió. La ronda terminó.');
    expect(voteRematch(s, 'a', 2)).toBe(s);
  });

  it('la revancha arranca con mayoría y deja todo limpio', () => {
    let s = deliver(applyImpact(running(), { impulse: 20 }, NONE));
    s = voteRematch(s, 'a', 3);
    expect(s.phase).toBe('result');
    s = voteRematch(s, 'b', 3);
    expect(s).toEqual(createDeliveryMatch());
  });
});
