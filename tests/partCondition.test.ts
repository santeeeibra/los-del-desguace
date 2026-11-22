import { beforeEach, describe, expect, it } from 'vitest';
import {
  BROKEN_ENGINE_FACTOR,
  engineConditionFactor,
  getPartCondition,
  partIdsWithCondition,
  resetPartConditions,
  setPartCondition,
} from '../src/props/partCondition';

describe('partCondition', () => {
  beforeEach(() => resetPartConditions());

  it('una pieza sin estado está en ok', () => {
    expect(getPartCondition('m1')).toBe('ok');
    expect(engineConditionFactor('m1')).toBe(1);
  });

  it('un motor roto rinde poco y se puede reparar', () => {
    setPartCondition('m1', 'broken');
    expect(engineConditionFactor('m1')).toBe(BROKEN_ENGINE_FACTOR);
    expect(partIdsWithCondition('broken')).toEqual(['m1']);
    setPartCondition('m1', 'ok');
    expect(engineConditionFactor('m1')).toBe(1);
    expect(partIdsWithCondition('broken')).toEqual([]);
  });

  it('lista las baterías descargadas', () => {
    setPartCondition('b1', 'discharged');
    setPartCondition('b2', 'discharged');
    expect(partIdsWithCondition('discharged').sort()).toEqual(['b1', 'b2']);
  });
});
