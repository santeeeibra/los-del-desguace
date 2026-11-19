import { expect, it } from 'vitest';
import { FLIGHT_TARGET_POS, gameModeStore, RACE_CHECKPOINTS } from './gameModes';

function position([x, y, z]: readonly [number, number, number]) {
  return { x, y, z };
}

it('registra los aros de la carrera en orden y reinicia el tiempo sin borrar el récord', () => {
  gameModeStore.setMode('race');
  gameModeStore.tick(0.1, position(RACE_CHECKPOINTS[1]));
  expect(gameModeStore.getState().checkpointIndex).toBe(0);
  for (const checkpoint of RACE_CHECKPOINTS) gameModeStore.tick(0.1, position(checkpoint));
  const result = gameModeStore.getState();
  expect(result.raceFinished).toBe(true);
  expect(result.bestRaceSec).toBe(result.elapsedSec);
  gameModeStore.resetRun();
  expect(gameModeStore.getState()).toMatchObject({ raceFinished: false, elapsedSec: 0, bestRaceSec: result.bestRaceSec });
});

it('registra distancia de vuelo y aro solo al superar la altura mínima', () => {
  gameModeStore.setMode('flight');
  const target = position(FLIGHT_TARGET_POS);
  gameModeStore.tick(0.1, { ...target, y: 0.4 });
  expect(gameModeStore.getState()).toMatchObject({ currentFlightMeters: 0, flightTargetReached: false });
  gameModeStore.tick(0.1, target);
  expect(gameModeStore.getState().flightTargetReached).toBe(true);
  expect(gameModeStore.getState().currentFlightMeters).toBeGreaterThan(10);
  gameModeStore.resetRun();
  gameModeStore.tick(0.1, target);
  expect(gameModeStore.getState().flightTargetReached).toBe(false);
  gameModeStore.tick(0.1, { ...target, z: target.z - 4 });
  gameModeStore.tick(0.1, target);
  expect(gameModeStore.getState().flightTargetReached).toBe(true);
  gameModeStore.setMode('sandbox');
});
