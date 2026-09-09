// Plan v2 R6. The jar is a kept balance with a display only goal and two user actions.
// There is no automatic sweep (R6.2) and no automatic destination of any kind.
import type { Cents } from './interfaces';
import { JAR_GOAL_PRESETS } from '../config';

export function isJarGoalPreset(cents: number): boolean {
  return JAR_GOAL_PRESETS.includes(cents);
}

/** Plan v2 R6.3: the jar art fills against the goal. Display only. */
export function jarFillRatio(jarCents: Cents, goalCents: Cents): number {
  if (goalCents <= 0) return 0;
  return Math.min(1, Math.max(0, jarCents / goalCents));
}

/**
 * Plan v2 R6.3: reaching or passing the goal fires the celebration once per goal crossing,
 * and never forces an action. Passing it again after the jar is emptied fires again, which is
 * why this is a function of the before and after balances rather than of a stored flag.
 */
export function crossedGoal(beforeCents: Cents, afterCents: Cents, goalCents: Cents): boolean {
  if (goalCents <= 0) return false;
  return beforeCents < goalCents && afterCents >= goalCents;
}

/**
 * Plan v2 R6.6: the jar is never negative and only ever changes by the operations R6.1, R6.4
 * and R6.5 name. Every caller goes through here so that stays true by construction.
 */
export function addToJar(jarCents: Cents, amountCents: Cents): Cents {
  if (!(amountCents >= 0)) throw new Error(`addToJar: expected a non-negative amount, got ${amountCents}`);
  return jarCents + amountCents;
}

/** Plan v2 R6.4 and R6.5: both user actions empty the jar completely. */
export function emptiedJar(): Cents {
  return 0;
}
