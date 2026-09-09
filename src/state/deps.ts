import type { Deps } from '../domain/types';
import { createSimulatedTransactionSource } from '../domain/simulator';
import { createSimulatedLocationSource } from '../domain/places';

/**
 * Plan v2 section 5.1: the web constructs a transaction source and a location source, and
 * nothing else. It ships `createSimulatedLocationSource()` only; the interface exists so the
 * future browser geolocation source has a named shape to satisfy.
 */
export const deps: Deps = {
  transactions: createSimulatedTransactionSource(),
  location: createSimulatedLocationSource(),
};
