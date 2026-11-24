/** 히든 스팟은 판마다 12곳. 4개 구역에 3곳씩 두고, 효과 6종을 2개씩 섞는다. */
import { CELLS, colOf, isOasis, rowOf, zoneOf } from './board.ts';
import type { Cell } from './board.ts';
import { shuffle } from './rng.ts';
import type { Trap } from './types.ts';

export const HIDDEN_EFFECTS = ['swap', 'drain', 'gain', 'teleport', 'stride', 'trap'] as const;
export type HiddenEffect = typeof HIDDEN_EFFECTS[number];
export type ChoiceEffect = Extract<HiddenEffect, 'swap' | 'drain' | 'teleport' | 'trap'>;
export interface HiddenSpot { cell: Cell; effect: HiddenEffect; claimedBy: number | null }

export const HIDDEN_GAIN = 8;
export const HIDDEN_DRAIN = -10;

export function placeHiddenSpots(rng: () => number, traps: readonly Trap[]): HiddenSpot[] {
  const blocked = new Set(traps.map((trap) => trap.cell));
  const cells = [...Array(CELLS).keys()].filter((cell) => !isOasis(cell) && zoneOf(cell) === -1 && !blocked.has(cell));
  const spots: Cell[] = [];
  for (let quadrant = 0; quadrant < 4; quadrant++) {
    const candidates = cells.filter((cell) => (rowOf(cell) >= 8 ? 2 : 0) + (colOf(cell) >= 8 ? 1 : 0) === quadrant);
    spots.push(...shuffle(rng, candidates).slice(0, 3));
  }
  if (spots.length !== 12) throw new Error('HIDDEN_SPOT_SPACE');
  const effects = shuffle(rng, [...HIDDEN_EFFECTS, ...HIDDEN_EFFECTS]);
  return spots.map((cell, i) => ({ cell, effect: effects[i], claimedBy: null }));
}
