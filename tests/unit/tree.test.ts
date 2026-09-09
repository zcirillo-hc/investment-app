import { describe, expect, it } from 'vitest';
import { treeStage } from '../../src/domain/tree';

describe('tree stage', () => {
  it('stage boundaries by days since first sweep', () => {
    expect(treeStage(50, null)).toBe(0);
    expect(treeStage(4, 4)).toBe(1);
    expect(treeStage(10, 4)).toBe(1); // 6 days
    expect(treeStage(11, 4)).toBe(2); // 7 days
    expect(treeStage(24, 4)).toBe(2); // 20
    expect(treeStage(25, 4)).toBe(3); // 21
    expect(treeStage(48, 4)).toBe(3); // 44
    expect(treeStage(49, 4)).toBe(4); // 45
    expect(treeStage(93, 4)).toBe(4); // 89
    expect(treeStage(94, 4)).toBe(5); // 90
    expect(treeStage(183, 4)).toBe(5); // 179
    expect(treeStage(184, 4)).toBe(6); // 180
    expect(treeStage(1000, 4)).toBe(6);
  });
});
