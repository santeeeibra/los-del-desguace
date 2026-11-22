import { afterEach, describe, expect, it } from 'vitest';
import { dispatchGameKeyDown, playerInput } from '../src/controls/playerInput';
import { gameStore, getActiveTool } from '../src/state/gameStore';

describe('barra unificada de herramientas 3D (slots 1–5)', () => {
  afterEach(() => {
    playerInput.resetAll();
    gameStore.selectTool('hand');
    gameStore.setCarried(null, null);
    gameStore.setSeated(false);
  });

  it('teclas 1–5 equipan las 5 herramientas con mira láser inmediata y 0/re-pulsar las guarda', () => {
    dispatchGameKeyDown({ code: 'Digit1', key: '1' });
    expect(getActiveTool(gameStore.getState())).toBe('wrench');
    expect(gameStore.getState()).toMatchObject({ wrenchEquipped: true, wrenchAiming: true, wrenchAimLocked: true });

    dispatchGameKeyDown({ code: 'Digit2', key: '2' });
    expect(getActiveTool(gameStore.getState())).toBe('welder');
    expect(gameStore.getState()).toMatchObject({ welderEquipped: true, wrenchAiming: true, wrenchAimLocked: true });

    dispatchGameKeyDown({ code: 'Digit3', key: '3' });
    expect(getActiveTool(gameStore.getState())).toBe('grinder');
    expect(gameStore.getState()).toMatchObject({ grinderEquipped: true, wrenchAiming: true, wrenchAimLocked: true });

    dispatchGameKeyDown({ code: 'Digit4', key: '4' });
    expect(getActiveTool(gameStore.getState())).toBe('saw');
    expect(gameStore.getState()).toMatchObject({ sawEquipped: true, wrenchAiming: true, wrenchAimLocked: true });

    dispatchGameKeyDown({ code: 'Digit5', key: '5' });
    expect(getActiveTool(gameStore.getState())).toBe('wire');
    expect(gameStore.getState()).toMatchObject({ wireToolEquipped: true, wiringActive: true, wrenchAiming: true });

    // Re-pulsar la misma tecla guarda la herramienta y vuelve a manos libres
    dispatchGameKeyDown({ code: 'Digit5', key: '5' });
    expect(getActiveTool(gameStore.getState())).toBe('hand');
    expect(gameStore.getState().wrenchEquipped).toBe(false);

    // Tecla 0 también guarda cualquier herramienta activa
    dispatchGameKeyDown({ code: 'Digit2', key: '2' });
    expect(getActiveTool(gameStore.getState())).toBe('welder');
    dispatchGameKeyDown({ code: 'Digit0', key: '0' });
    expect(getActiveTool(gameStore.getState())).toBe('hand');
  });

  it('R siempre rota (incluso apuntando con la mira) y Z cambia eje llevando piezas a mano', () => {
    dispatchGameKeyDown({ code: 'Digit1', key: '1' });
    dispatchGameKeyDown({ code: 'KeyR', key: 'r' });
    expect(playerInput.consumeCartAction()).toBe('rotate');

    dispatchGameKeyDown({ code: 'KeyR', key: 'R', shiftKey: true });
    expect(playerInput.consumeCartAction()).toBe('rotate-back');

    // Con manos libres cargando una pieza, Z también cambia el eje de rotación
    gameStore.selectTool('hand');
    gameStore.setCarried('wheel-1', 'wheel');
    const before = gameStore.getState().wrenchAxis;
    dispatchGameKeyDown({ code: 'KeyZ', key: 'z' });
    expect(gameStore.getState().wrenchAxis).not.toBe(before);
  });

  it('cycleHotbarTool recorre las herramientas en orden y vuelve a manos', () => {
    expect(getActiveTool(gameStore.getState())).toBe('hand');
    gameStore.cycleHotbarTool(1);
    expect(getActiveTool(gameStore.getState())).toBe('wrench');
    gameStore.cycleHotbarTool(1);
    expect(getActiveTool(gameStore.getState())).toBe('welder');
    gameStore.cycleHotbarTool(-1);
    expect(getActiveTool(gameStore.getState())).toBe('wrench');
    gameStore.cycleHotbarTool(-1);
    expect(getActiveTool(gameStore.getState())).toBe('hand');
  });
});
