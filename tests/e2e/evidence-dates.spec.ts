import { expect, test } from '@playwright/test';

test('catalog, provenance and methodology describe dates without claiming age-based freshness', async ({
  page,
}) => {
  await page.goto('/catalog');
  await expect(page.getByText(/Capture date does not establish currentness/)).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText(/\((fresh|stale)\)/);
  await page.goto('/catalog/model/demo~model~aurora-large');
  await expect(page.getByText(/Recorded provenance status:/)).toBeVisible();
  await expect(
    page.getByText(/Historical verified labels may record source checks only/),
  ).toBeVisible();
  await expect(page.getByText(/Latest recorded source check:/)).toBeVisible();
  await page.goto('/compare?ids=demo~model~open-8b,demo~model~aurora-large');
  await expect(
    page.getByText(/Recorded provenance statuses do not establish independent verification/),
  ).toBeVisible();
  await page.goto('/methodology');
  await expect(page.getByText(/Version-pinned facts do not expire with age/)).toBeVisible();
  await expect(
    page.getByText(/A newer snapshot alone does not invalidate a pinned build/),
  ).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('older than 30 days');
});
