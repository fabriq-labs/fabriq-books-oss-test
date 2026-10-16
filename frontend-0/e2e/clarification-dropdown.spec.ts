import { test, expect } from '@playwright/test';

/**
 * ClarificationCard multi-option dropdown harness.
 * Requires vite: `npm run dev:fabriq` (or reuseExistingServer).
 */
test.describe('ClarificationCard dropdown', () => {
  test('shows account options in a dropdown and submits selected id', async ({ page }) => {
    await page.goto('/dev/clarification-preview');

    await expect(page.getByText('Clarification needed')).toBeVisible();
    await expect(
      page.getByText('Which Checking Account would you like to reconcile?')
    ).toBeVisible();

    // Open the select
    const trigger = page.getByRole('combobox');
    await expect(trigger).toBeVisible();
    await trigger.click();

    // Options include name · id
    const hq = page.getByRole('option', {
      name: /Checking Account \(HQ\).*acco_org_indian_demo_1102/,
    });
    await expect(hq).toBeVisible();
    await hq.click();

    await expect(page.getByText(/Selected id:\s*acco_org_indian_demo_1102/)).toBeVisible();

    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByTestId('clarification-submit-result')).toHaveText(
      'submitted:acco_org_indian_demo_1102'
    );
  });
});
