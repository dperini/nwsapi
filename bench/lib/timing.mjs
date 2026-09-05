/*
 * Timing, shared by every benchmark here.
 *
 * Two habits, both there for a reason: variants are timed interleaved in one
 * process, because absolute timings drift by tens of percent between runs and
 * only a ratio measured microseconds apart means anything; and each variant
 * reports a median of several rounds, because one round can catch a garbage
 * collection and a median cannot.
 */

import process from 'node:process';

export function timeOnce(fn, iterations) {
  fn();
  const started = process.hrtime.bigint();
  for (let i = 0; i < iterations; ++i) {
    fn();
  }
  return Number(process.hrtime.bigint() - started) / iterations / 1e6;
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1];
}

// Rounds are interleaved across runners rather than run one runner at a time,
// so a slow patch of machine time lands on all of them instead of one.
export function measure(runners, rounds, iterations) {
  const samples = runners.map(() => []);
  for (let round = 0; round < rounds; ++round) {
    for (let i = 0; i < runners.length; ++i) {
      samples[i].push(timeOnce(runners[i], iterations));
    }
  }
  return samples.map(median);
}

// Enough repetitions that a case is timed over milliseconds, not noise.
export function iterationsFor(ms) {
  if (ms > 1) { return 20; }
  if (ms > 0.1) { return 100; }
  return 500;
}

// A labelled table of variants, timed against each other. Returns the medians
// in the order the labels were given.
export function compare(variants, { rounds = 5, iterations } = {}) {
  const runners = Object.values(variants);
  const count = iterations ?? iterationsFor(timeOnce(runners[0], 3));
  for (let warm = 0; warm < 3; ++warm) {
    for (const runner of runners) { runner(); }
  }
  const times = measure(runners, rounds, count);
  return Object.keys(variants).map((label, i) => ({ label, ms: times[i] }));
}
