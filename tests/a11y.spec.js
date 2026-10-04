import { test, expect } from '@playwright/test';

test('core page is keyboard reachable and has no obvious console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('dialog', { name: /your private workspace/i })).toBeVisible();
  await page.getByRole('button', { name: /get started/i }).focus();
  await expect(page.getByRole('button', { name: /get started/i })).toBeFocused();
  await page.getByRole('button', { name: /get started/i }).click();

  const newThread = page.getByRole('button', { name: /new thread/i });
  await expect(newThread).toBeVisible();
  await newThread.focus();
  await expect(newThread).toBeFocused();

  const context = page.getByRole('button', { name: /context/i });
  await context.click();
  await expect(context).toHaveAttribute('aria-expanded', 'true');
  await context.click();
  await expect(context).toHaveAttribute('aria-expanded', 'false');

  const model = page.getByRole('button', { name: /forge local/i });
  await model.click();
  await expect(model).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(model).toHaveAttribute('aria-expanded', 'false');

  expect(errors).toEqual([]);
});
