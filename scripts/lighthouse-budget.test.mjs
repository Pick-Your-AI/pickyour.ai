import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateBudget } from './lighthouse-budget.mjs';

const runs = (...scores) => scores.map((performance) => ({ performance, accessibility: 1 }));
test('performance requires a median of at least 90, without rounding', () => {
  assert.equal(evaluateBudget(runs(0.5, 0.9, 0.91)).passed, true);
  assert.equal(evaluateBudget(runs(0.89, 0.899, 1)).passed, false);
});
test('every accessibility run must score 100', () => {
  const results = runs(1, 1, 1);
  results[0].accessibility = 0.99;
  assert.equal(evaluateBudget(results).passed, false);
});
test('missing, nonnumeric, or incomplete results fail closed', () => {
  for (const score of [null, undefined, NaN, Infinity, '1', 1.01, -1]) {
    assert.throws(() => evaluateBudget(runs(score, 1, 1)));
  }
  assert.throws(() => evaluateBudget(runs(1, 1)));
});
