export function evaluateBudget(runs) {
  if (
    runs.length !== 3 ||
    runs.some((run) =>
      [run.performance, run.accessibility].some(
        (score) => typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1,
      ),
    )
  ) {
    throw new Error('Expected three runs with numeric Lighthouse category scores between 0 and 1.');
  }
  const performanceMedian = runs.map((r) => r.performance).sort((a, b) => a - b)[1];
  const accessibilityMinimum = Math.min(...runs.map((r) => r.accessibility));
  return {
    performanceMedian,
    accessibilityMinimum,
    passed: performanceMedian >= 0.9 && accessibilityMinimum === 1,
  };
}
