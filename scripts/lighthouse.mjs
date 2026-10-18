import { mkdir, rm, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { preview } from 'vite';
import { evaluateBudget } from './lighthouse-budget.mjs';

const routes = [
  ['home', '/'],
  ['builder', '/builder'],
  ['catalog-model', '/catalog/model'],
];
const outputDir = 'lighthouse-report';
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
const server = await preview({ preview: { host: '127.0.0.1', port: 4319, strictPort: true } });
const summary = [];
try {
  for (const [name, path] of routes) {
    const runs = [];
    for (let run = 1; run <= 3; run++) {
      const chrome = await launch({
        chromePath: chromium.executablePath(),
        chromeFlags: ['--headless', '--no-sandbox', '--disable-dev-shm-usage'],
      });
      try {
        const result = await lighthouse(`http://127.0.0.1:4319${path}`, {
          port: chrome.port,
          output: ['html', 'json'],
          onlyCategories: ['performance', 'accessibility'],
          logLevel: 'error',
        });
        if (result) {
          await writeFile(`${outputDir}/${name}-${run}.html`, result.report[0]);
          await writeFile(`${outputDir}/${name}-${run}.json`, result.report[1]);
        }
        if (!result || result.lhr.runtimeError) {
          throw new Error(`Lighthouse failed for ${path}: ${result?.lhr.runtimeError?.message}`);
        }
        const scores = {
          performance: result.lhr.categories.performance.score,
          accessibility: result.lhr.categories.accessibility.score,
        };
        if (Object.values(scores).some((score) => typeof score !== 'number')) {
          throw new Error(`Missing Lighthouse scores for ${path}`);
        }
        runs.push(scores);
        console.log(
          `${path} run ${run}: performance=${scores.performance}, accessibility=${scores.accessibility}`,
        );
      } finally {
        await chrome.kill();
      }
    }
    summary.push({ path, runs, ...evaluateBudget(runs) });
  }
  await writeFile(`${outputDir}/summary.json`, JSON.stringify(summary, null, 2) + '\n');
  console.table(
    summary.map(({ path, performanceMedian, accessibilityMinimum, passed }) => ({
      path,
      performanceMedian,
      accessibilityMinimum,
      passed,
    })),
  );
  if (summary.some((result) => !result.passed)) {
    throw new Error(
      'Lighthouse budgets failed: median performance >= 90 and every accessibility score = 100 required.',
    );
  }
} catch (error) {
  await writeFile(
    `${outputDir}/failure.json`,
    JSON.stringify(
      {
        error: String(error),
        completedRoutes: summary,
      },
      null,
      2,
    ) + '\n',
  );
  throw error;
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
