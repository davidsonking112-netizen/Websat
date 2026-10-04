import { test, expect } from '@playwright/test';

test('core page is keyboard reachable and has no obvious console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: /new thread/i })).toBeVisible();
  await page.getByRole('button', { name: /new thread/i }).focus();
  await expect(page.getByRole('button', { name: /new thread/i })).toBeFocused();
  expect(errors).toEqual([]);
});
