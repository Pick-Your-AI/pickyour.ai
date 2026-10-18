import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PAGES: [string, RegExp][] = [
  ['/', /Pick your AI stack/i],
  ['/builder', /Untitled AI stack|AI stack/i],
  ['/catalog', /Browse components/i],
  ['/catalog/model', /Choose an AI model/i],
  ['/catalog/model/demo~model~open-8b', /Demo Open 8B/],
  ['/compare', /Compare/i],
  ['/compare?ids=demo~model~open-8b,demo~model~aurora-large', /Compare/i],
  ['/summary', /.+/],
  ['/builds', /My Builds|builds/i],
  ['/shared', /Shared/i],
  ['/methodology', /checks a stack|Methodology/i],
  ['/about', /About/i],
  ['/legal', /Privacy|Legal/i],
  ['/no/such/page', /not found|404/i],
];

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`,
    ),
  ).toEqual([]);
}

for (const [path, heading] of PAGES) {
  test(`${path} renders, labels demo data and passes axe`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page.getByRole('note', { name: 'Demo mode' })).toContainText('synthetic');
    await expect(page.getByTestId('build-sha')).toHaveText(/^[0-9a-f]{7}$|unknown/);
    await page.waitForLoadState('networkidle');
    await axe(page);
    expect(errors).toEqual([]);
  });
}

test('version.json matches the build contract', async ({ request }) => {
  const res = await request.get('/version.json');
  expect(res.ok()).toBeTruthy();
  const v = await res.json();
  expect(Object.keys(v).sort()).toEqual([
    'builtAt',
    'commit',
    'contractSourceSha',
    'contractVersion',
    'dataMode',
  ]);
  expect(v.contractVersion).toBe('1.0.0');
  expect(v.contractSourceSha).toMatch(/^[0-9a-f]{40}$/);
  expect(v.dataMode).toBe('fixture');
});

test('builder flow: starter → change → invalidation, unknowns, export and dark mode', async ({
  page,
}, info) => {
  test.skip(
    info.project.name.startsWith('mobile'),
    'table interactions are covered on desktop; mobile uses cards',
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Open in builder' }).first().click();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(page.getByText(/Saved in this browser/)).toBeVisible();
  await expect(page.getByTestId('overall-status')).toContainText(/Compatible|pass/i);
  await expect(page.getByTestId('cost-headline').first()).toContainText('$');

  // Switch to self-hosted mode: API-only model now conflicts and T2 becomes needed.
  await page.goto('/catalog/deployment-mode?show=all');
  await page
    .getByRole('row', { name: /Self-hosted/ })
    .getByRole('button', { name: /Replace/ })
    .click();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(page.getByTestId('overall-status')).toContainText(/Incompatible|failing/i);
  await expect(page.getByText(/Through the dependency graph this re-checks/)).toBeVisible();
  await expect(page.getByText('Revision 2', { exact: false }).first()).toBeVisible();
  // Unknown is never shown as pass.
  await expect(page.getByText(/Unknown/).first()).toBeVisible();

  // Export downloads a contract-shaped file.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.r\d+\.pickyour-ai\.json$/);

  // Draft persists across reloads.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Managed-API support chat/);

  await page.getByRole('button', { name: /Switch to dark theme/ }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await axe(page);
});

test('selection page shows compatibility buckets with text, not colour alone', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('mobile'), 'mobile variant below');
  await page.goto('/');
  await page.getByRole('button', { name: 'Open in builder' }).first().click();
  await expect(page.getByText(/Saved in this browser/)).toBeVisible();
  await page.goto('/catalog/model?show=all');
  const table = page.getByRole('table');
  await expect(table.getByText('Incompatible').first()).toBeVisible();
  await expect(table.getByText(/No rule failures/).first()).toBeVisible();
  await page.getByRole('radio', { name: /No rule failures only/ }).click();
  await expect(page.getByRole('radio', { name: /No rule failures only/ })).toBeChecked();
  await expect(table.getByText('Incompatible')).toHaveCount(0);
});

test('share link round-trips into a read-only shared view', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open in builder' }).first().click();
  await page.getByRole('button', { name: 'Copy share link' }).click();
  await expect(page.getByText(/Share link copied/)).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toContain('/shared#b1.');
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Managed-API support chat/);
  await expect(page.getByRole('button', { name: /Import to my builds/ })).toBeVisible();
});

test('mobile: selection renders cards with text verdicts and a sticky summary bar', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'mobile only');
  await page.goto('/');
  await page.getByRole('button', { name: 'Open in builder' }).first().click();
  await expect(page.getByRole('button', { name: /Summary/ })).toBeVisible();
  await page.goto('/catalog/model?show=all');
  await expect(page.getByRole('table')).toBeHidden();
  await expect(page.getByText('Incompatible').first()).toBeVisible();
  await axe(page);
});

test('incomplete guidance survives choosing, reloading and sharing without blaming the chosen row', async ({
  page,
  context,
}, info) => {
  test.skip(
    info.project.name.startsWith('mobile'),
    'desktop row interactions; mobile banner covered by route smoke',
  );
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/builder');
  await expect(page.getByTestId('overall-status')).toContainText('0 of 4 required choices made');
  await expect(page.getByTestId('overall-status')).toContainText('Provisional inference');
  await page.goto('/catalog/workload?show=all');
  await page
    .getByRole('row', { name: /Demo Customer Support Chat/ })
    .getByRole('button', { name: /^Add / })
    .click();
  await expect(page.getByTestId('overall-status')).toContainText('1 of 4 required choices made');
  await expect(page.locator('[data-kind="workload"]')).not.toContainText('Fail');
  await expect(page.getByText('rule.required.foundation', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('overall-status')).toContainText('1 of 4 required choices made');
  await page.goto('/catalog/deployment-mode?show=all');
  await page
    .getByRole('row', { name: /Managed API \(no self-hosting\)/ })
    .getByRole('button', { name: /^Add / })
    .click();
  await expect(page.getByTestId('overall-status')).toContainText('2 of 4 required choices made');
  await page.getByRole('button', { name: 'Copy share link' }).click();
  await expect(page.getByText(/Share link copied/)).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  await page.goto(url);
  await expect(page.getByTestId('overall-status')).toContainText('2 of 4 required choices made');
});
