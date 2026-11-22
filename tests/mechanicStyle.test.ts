import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MECHANIC_STYLE,
  MECHANIC_PRESETS,
  createCigaretteSmokePool,
  sampleThinkingPuffPose,
  stepCigaretteSmoke,
  withProtectiveGearActive,
} from '../src/character/mechanicStyle';
import {
  DEFAULT_CHARACTER_CUSTOMIZATION,
  EMOTE_BY_ID,
  buildCharacterAppearance,
  sanitizeMechanicFields,
} from '../src/character/characterCustomization';

describe('Mecánicos Locos', () => {
  it('baja la careta y las antiparras al soldar y las deja como estaban al parar', () => {
    const mask = { ...DEFAULT_MECHANIC_STYLE, headgear: 'welding_mask_up' as const };
    const goggles = { ...DEFAULT_MECHANIC_STYLE, headgear: 'welding_goggles_up' as const };
    expect(withProtectiveGearActive(mask, true)).toBe('welding_mask_down');
    expect(withProtectiveGearActive(goggles, true)).toBe('welding_goggles_down');
    expect(withProtectiveGearActive(mask, false)).toBe('welding_mask_up');
  });

  it('el humo del cigarrillo no crece más de 5 partículas y se apaga solo', () => {
    const pool = createCigaretteSmokePool();
    for (let i = 0; i < 400; i++) stepCigaretteSmoke(pool, 1 / 60, true, i % 90 > 60);
    expect(pool.puffs).toHaveLength(5);
    for (let i = 0; i < 400; i++) stepCigaretteSmoke(pool, 1 / 60, false);
    expect(pool.puffs.every((p) => !p.active)).toBe(true);
  });

  it('el gesto pensativo sube la mano y exhala humo en la parte final', () => {
    expect(sampleThinkingPuffPose(0).rightHandToMouth).toBe(0);
    expect(sampleThinkingPuffPose(1.3).rightHandToMouth).toBe(1);
    expect(sampleThinkingPuffPose(1.8).exhaleSmoke).toBe(true);
    expect(EMOTE_BY_ID.thinking_puff.keyHint).toBe('8');
  });

  it('valida los campos guardados y los accesorios nuevos reemplazan casco/antiparras clásicos', () => {
    expect(sanitizeMechanicFields({ headgear: 'inventado' as never }).headgear).toBe('none');
    const app = buildCharacterAppearance({
      ...DEFAULT_CHARACTER_CUSTOMIZATION,
      ...MECHANIC_PRESETS.find((p) => p.id === 'soldador-nocturno')!.style,
    });
    expect(app.hatStyle).toBe('none');
    expect(app.gogglesStyle).toBe('none');
    expect(app.beltToolStyle).toBe('pouch');
  });
});
