import { create } from 'zustand';
import type { MilestoneKey } from '../domain/triggers';

// Plan v2 section 5.3: non persisted UI state. `sweepAnimation` becomes `jarMoveAnimation`
// and now fires on a user confirmed jar move (R6.4) rather than on an automatic sweep.
export interface Outcome {
  ticks: number;
  jarMoves: number;
  movedCents: number;
  crossedGoal: boolean;
  milestones: MilestoneKey[];
  newPaychecks: number;
}

export interface UiState {
  hydrated: boolean;
  trayOpen: boolean;
  trayHeight: number;
  toast: string | null;
  jarMoveAnimation: { cents: number; key: number } | null;
  confettiKey: number | null;
  milestoneModal: MilestoneKey | null;
  setHydrated: (v: boolean) => void;
  setTrayOpen: (v: boolean) => void;
  setTrayHeight: (h: number) => void;
  showToast: (msg: string) => void;
  clearToast: () => void;
  startJarMoveAnimation: (cents: number) => void;
  endJarMoveAnimation: () => void;
  fireConfetti: () => void;
  endConfetti: () => void;
  openMilestone: (k: MilestoneKey) => void;
  closeMilestone: () => void;
  applyOutcome: (o: Outcome) => void;
}

let keyCounter = 0;

export const useUiStore = create<UiState>()((set) => ({
  hydrated: false,
  trayOpen: false,
  trayHeight: 0,
  toast: null,
  jarMoveAnimation: null,
  confettiKey: null,
  milestoneModal: null,
  setHydrated: (v) => set({ hydrated: v }),
  setTrayOpen: (v) => set({ trayOpen: v }),
  setTrayHeight: (h) => set({ trayHeight: h }),
  showToast: (msg) => set({ toast: msg }),
  clearToast: () => set({ toast: null }),
  startJarMoveAnimation: (cents) => set({ jarMoveAnimation: { cents, key: ++keyCounter } }),
  endJarMoveAnimation: () => set({ jarMoveAnimation: null }),
  fireConfetti: () => set({ confettiKey: ++keyCounter }),
  endConfetti: () => set({ confettiKey: null }),
  openMilestone: (k) => set({ milestoneModal: k }),
  closeMilestone: () => set({ milestoneModal: null }),
  applyOutcome: (o) =>
    set((s) => ({
      jarMoveAnimation: o.jarMoves > 0 ? { cents: o.movedCents, key: ++keyCounter } : s.jarMoveAnimation,
      // R6.3: the goal celebration fires once per crossing, and never forces an action.
      confettiKey: o.crossedGoal ? ++keyCounter : s.confettiKey,
      milestoneModal: o.milestones.length > 0 ? o.milestones[0] : s.milestoneModal,
    })),
}));
