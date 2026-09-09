// Plan v2 R6. The jar as a kept balance with a display only goal and two user actions.
import { describe, expect, it } from 'vitest';
import { addToJar, crossedGoal, emptiedJar, isJarGoalPreset, jarFillRatio } from '../../src/domain/jar';
import { JAR_GOAL_PRESETS } from '../../src/config';

describe('R6.6 the jar only ever changes by the named operations', () => {
  it('adds a non negative amount', () => {
    expect(addToJar(0, 65)).toBe(65);
    expect(addToJar(65, 0)).toBe(65);
    expect(addToJar(100, 441)).toBe(541);
  });

  it('R1.2: refuses a negative amount rather than rounding or absorbing it', () => {
    expect(() => addToJar(100, -1)).toThrow(/non-negative/);
  });

  it('refuses a value that is not a number at all, rather than producing NaN cents', () => {
    expect(() => addToJar(100, Number.NaN)).toThrow();
  });

  it('R6.4 and R6.5: both user actions empty it completely', () => {
    expect(emptiedJar()).toBe(0);
  });
});

describe('R6.3 the goal is display only', () => {
  it('offers exactly the four presets from the plan', () => {
    expect(JAR_GOAL_PRESETS).toEqual([1000, 2500, 5000, 10000]);
    for (const c of JAR_GOAL_PRESETS) expect(isJarGoalPreset(c)).toBe(true);
    expect(isJarGoalPreset(1234)).toBe(false);
  });

  it('fills the art against the goal, clamped at both ends', () => {
    expect(jarFillRatio(0, 2500)).toBe(0);
    expect(jarFillRatio(1250, 2500)).toBe(0.5);
    expect(jarFillRatio(2500, 2500)).toBe(1);
    // Past the goal the art is full, not overflowing.
    expect(jarFillRatio(9999, 2500)).toBe(1);
  });

  it('does not divide by a zero or negative goal', () => {
    expect(jarFillRatio(100, 0)).toBe(0);
    expect(jarFillRatio(100, -1)).toBe(0);
  });

  it('fires the celebration once per crossing, not once per balance above the goal', () => {
    expect(crossedGoal(2400, 2500, 2500)).toBe(true);
    expect(crossedGoal(2500, 2600, 2500)).toBe(false);
    expect(crossedGoal(2400, 2499, 2500)).toBe(false);
  });

  it('fires again after the jar is emptied and refills, which is why it takes both balances', () => {
    expect(crossedGoal(2400, 2600, 2500)).toBe(true);
    // Emptied.
    expect(crossedGoal(2600, 0, 2500)).toBe(false);
    // And past it again.
    expect(crossedGoal(0, 2500, 2500)).toBe(true);
  });

  it('never fires against a goal of zero, which would celebrate every credit', () => {
    expect(crossedGoal(0, 1, 0)).toBe(false);
  });
});
