import { expect, test } from '@playwright/test';
import pg from 'pg';
import { TEST_DATABASE_URL } from '../playwright.config';

// The fake setup sends no email, so the test confirms the email in the database.
async function markVerified(email: string) {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query('UPDATE "user" SET email_verified = true WHERE email = $1', [email]);
  } finally {
    await client.end();
  }
}

test('sign up, add a fake connection, make a song, and play it', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'correct horse battery';

  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Ada');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status')).toContainText('Check your email');
  await markVerified(email);

  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/studio');

  await page.goto('/settings/connections');
  await page.getByLabel('Provider', { exact: true }).selectOption('kie');
  await page.getByLabel('API key').fill('fake-key-1234');
  await page.getByRole('button', { name: 'Add key' }).click();
  await expect(page.getByRole('status')).toContainText('Key added');

  await page.goto('/studio');
  await page.getByLabel('Idea').fill('a sea shanty about a lost cat');
  await page.getByRole('button', { name: 'Make song' }).click();

  // Submit, then the fake callback, the sync, and the next 3 s read.
  const takes = page.getByRole('list', { name: 'Takes of this song' }).getByRole('listitem');
  await expect(takes).toHaveCount(2, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Play take 1' }).click();

  await expect(page.getByRole('region', { name: 'Player' })).toContainText('Fake take 1');
  await expect(page.locator('audio')).toHaveAttribute('src', /^\/api\/tracks\/[\w-]+\/stream$/);
});
