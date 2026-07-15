import { test, expect } from '@playwright/test';
import { mockChain } from './fixtures';

test.describe('Option Strategist smoke', () => {
    test('renders the yield matrix from a chain with no console errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

        await mockChain(page);
        await page.goto('/');

        // Matrix cells render (APR%)
        await expect(page.locator('td', { hasText: '%' }).first()).toBeVisible({ timeout: 15_000 });
        expect(await page.locator('td', { hasText: '%' }).count()).toBeGreaterThan(0);

        // A recommendation card is present (Covered Call or CSP ladder, or an empty-state card)
        await expect(page.getByText(/Ladder|candidates pass the current filters/).first()).toBeVisible();

        // No runtime errors (hydration, render throws, etc.)
        expect(errors, errors.join('\n')).toEqual([]);
    });

    test('asset switch re-renders for a different currency', async ({ page }) => {
        await mockChain(page);
        await page.goto('/');
        await expect(page.locator('td', { hasText: '%' }).first()).toBeVisible({ timeout: 15_000 });

        await page.getByRole('button', { name: 'BTC', exact: true }).click();
        // Still renders a matrix after switching (fixtures are asset-agnostic)
        await expect(page.locator('td', { hasText: '%' }).first()).toBeVisible({ timeout: 15_000 });
    });

    test('serves security headers', async ({ page }) => {
        await mockChain(page);
        const res = await page.goto('/');
        const h = res!.headers();
        expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
        expect(h['x-content-type-options']).toBe('nosniff');
        expect(h['x-frame-options']).toBe('DENY');
    });

    test('fee toggle and contract sizing are interactive', async ({ page }) => {
        await mockChain(page);
        await page.goto('/');
        await expect(page.locator('td', { hasText: '%' }).first()).toBeVisible({ timeout: 15_000 });

        // Fee role toggles (pressed state moves Maker → Taker)
        const maker = page.getByRole('button', { name: 'Maker' });
        const taker = page.getByRole('button', { name: 'Taker' });
        await expect(maker).toHaveAttribute('aria-pressed', 'true');
        await taker.click();
        await expect(taker).toHaveAttribute('aria-pressed', 'true');
        await expect(maker).toHaveAttribute('aria-pressed', 'false');

        // Contract sizing accepts input
        await page.locator('#contracts-input').fill('5');
        await expect(page.locator('#contracts-input')).toHaveValue('5');
    });
});
