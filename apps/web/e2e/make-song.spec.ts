import { expect, test } from '@playwright/test';
import { WEB } from '../playwright.config';

// Users sign in with Google. A test cannot use Google, so fake mode allows a password sign-up
// through the API. The page shares its cookies with page.request.
test('sign up, add a fake connection, make a song, and play it', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const signUp = await page.request.post('/api/auth/sign-up/email', {
    headers: { Origin: WEB },
    data: { name: 'Ada', email, password: 'correct horse battery' },
  });
  expect(signUp.ok()).toBe(true);
  await page.goto('/studio');
  await page.waitForURL('**/studio');

  await page.goto('/settings/connections');
  await page.getByLabel('Provider', { exact: true }).selectOption('kie');
  await page.getByLabel('API key').fill('fake-key-1234');
  await page.getByRole('button', { name: 'Add key' }).click();
  await expect(page.getByRole('status')).toContainText('Key added');

  await page.goto('/studio');
  await page.getByLabel('What is the song about?').fill('a sea shanty about a lost cat');
  await page.getByRole('button', { name: 'Make song' }).click();

  // Submit, then the fake callback, the sync, and the next 3 s read.
  const takes = page.getByRole('list', { name: 'Takes of this song' }).getByRole('listitem');
  await expect(takes).toHaveCount(2, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Play take 1' }).click();

  await expect(page.getByRole('region', { name: 'Player' })).toContainText('Fake take 1');
  await expect(page.locator('audio')).toHaveAttribute('src', /^\/api\/tracks\/[\w-]+\/stream$/);
});
