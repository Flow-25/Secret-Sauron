'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { drawAssignments, DrawError } = require('../src/draw');

const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

function assertValid(ids, result, exclusions = []) {
  assert.equal(result.size, ids.length);
  assert.deepEqual([...result.keys()].sort((a, b) => a - b), [...ids].sort((a, b) => a - b));
  assert.deepEqual([...result.values()].sort((a, b) => a - b), [...ids].sort((a, b) => a - b),
    'every participant receives exactly one gift');
  for (const [g, r] of result) {
    assert.notEqual(g, r, 'nobody draws themselves');
    for (const [a, b] of exclusions) {
      assert.ok(!((g === a && r === b) || (g === b && r === a)), `excluded pair ${a}/${b} matched`);
    }
  }
}

test('produces a valid derangement for many group sizes', () => {
  for (let n = 3; n <= 40; n++) {
    for (let k = 0; k < 20; k++) assertValid(range(n), drawAssignments(range(n)));
  }
});

test('respects exclusions in both directions', () => {
  const ids = range(6);
  const ex = [[1, 2], [3, 4], [5, 6]];
  for (let k = 0; k < 300; k++) assertValid(ids, drawAssignments(ids, ex), ex);
});

test('requires at least 3 participants', () => {
  assert.throws(() => drawAssignments([]), DrawError);
  assert.throws(() => drawAssignments([1, 2]), DrawError);
});

test('rejects duplicate ids', () => {
  assert.throws(() => drawAssignments([1, 1, 2]), DrawError);
});

test('detects impossible exclusions instead of looping forever', () => {
  // Person 1 may not give to 2 or 3 and cannot give to themselves.
  assert.throws(() => drawAssignments([1, 2, 3], [[1, 2], [1, 3]]), /impossible/);
  // Two people must swap and the third has no one left.
  assert.throws(() => drawAssignments([1, 2, 3], [[1, 2]]), /impossible/);
});

test('finds the only valid assignment when heavily constrained (matching fallback)', () => {
  // Constant rng makes rejection sampling repeat the same permutation, forcing the fallback.
  const ids = range(6);
  // Only allowed edges form the cycle 1→2→3→4→5→6→1 or its reverse.
  const ex = [];
  for (const a of ids) for (const b of ids) {
    if (a < b && Math.abs(a - b) !== 1 && !(a === 1 && b === 6)) ex.push([a, b]);
  }
  const result = drawAssignments(ids, ex, () => 0);
  assertValid(ids, result, ex);
});

test('both possible derangements of 3 people actually occur (it is random)', () => {
  const seen = new Set();
  for (let k = 0; k < 200; k++) seen.add([...drawAssignments([1, 2, 3]).values()].join());
  assert.deepEqual([...seen].sort(), ['2,3,1', '3,1,2']);
});

test('distribution is roughly uniform over derangements of 4 (9 possibilities)', () => {
  const counts = new Map();
  const N = 9000;
  for (let k = 0; k < N; k++) {
    const key = [...drawAssignments([1, 2, 3, 4]).values()].join();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  assert.equal(counts.size, 9);
  for (const c of counts.values()) assert.ok(c > 800 && c < 1200, `count ${c} far from 1000`);
});
