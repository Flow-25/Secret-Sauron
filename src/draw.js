'use strict';

// Secret Santa assignment: every giver gets exactly one receiver, nobody draws
// themselves and no excluded pair (in either direction) is matched.

class DrawError extends Error {}

const MIN_PARTICIPANTS = 3;
const REJECTION_TRIES = 2000;

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pairKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/**
 * @param {number[]} ids participant ids
 * @param {Array<[number, number]>} exclusions unordered pairs that must not draw each other
 * @param {() => number} rng
 * @returns {Map<number, number>} giver id -> receiver id
 */
function drawAssignments(ids, exclusions = [], rng = Math.random) {
  if (new Set(ids).size !== ids.length) throw new DrawError('Duplicate participants.');
  if (ids.length < MIN_PARTICIPANTS) {
    throw new DrawError(`At least ${MIN_PARTICIPANTS} members are needed to form a Fellowship.`);
  }
  const excluded = new Set(exclusions.map(([a, b]) => pairKey(a, b)));
  const allowed = (g, r) => g !== r && !excluded.has(pairKey(g, r));

  // Rejection sampling yields a uniformly random valid assignment and is fast
  // in the common case (~1/e of permutations are derangements).
  for (let t = 0; t < REJECTION_TRIES; t++) {
    const perm = shuffle(ids, rng);
    if (ids.every((g, i) => allowed(g, perm[i]))) {
      return new Map(ids.map((g, i) => [g, perm[i]]));
    }
  }

  // Heavily constrained: bipartite matching (Kuhn) on shuffled order always
  // finds a valid assignment if one exists.
  const receiverOf = new Map(); // receiver -> giver
  const candidates = new Map(ids.map((g) => [g, shuffle(ids.filter((r) => allowed(g, r)), rng)]));
  const tryAssign = (g, seen) => {
    for (const r of candidates.get(g)) {
      if (seen.has(r)) continue;
      seen.add(r);
      if (!receiverOf.has(r) || tryAssign(receiverOf.get(r), seen)) {
        receiverOf.set(r, g);
        return true;
      }
    }
    return false;
  };
  for (const g of shuffle(ids, rng)) {
    if (!tryAssign(g, new Set())) {
      throw new DrawError('The exclusions make a fair draw impossible. Remove some exclusions and try again.');
    }
  }
  return new Map([...receiverOf].map(([r, g]) => [g, r]));
}

module.exports = { drawAssignments, DrawError, MIN_PARTICIPANTS };
