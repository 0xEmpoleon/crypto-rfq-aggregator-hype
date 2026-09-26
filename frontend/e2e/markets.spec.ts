import { test, expect } from '@playwright/test';
import { mockChain } from './fixtures';

for (const [asset, spot] of [['VVV', 30], ['LIT', 4.8], ['PUMP', 0.0045], ['NEWCOIN', 0.0045]] as const) {
    test(`${asset} loads with correctly scaled strikes and survives reload`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message));
        await mockChain(page, spot, asset);
        await page.goto('/');
        await page.getByRole('button', { name: asset, exact: true }).click();
        await expect(page.locator('td', { hasText: '%' }).first()).toBeVisible();
        if (spot < 0.01) {
            await expect(page.getByRole('rowheader', { name: '$0.0045', exact: true }).first()).toBeVisible();
            await expect(page.getByRole('rowheader', { name: '$0.0048', exact: true }).first()).toBeVisible();
            await page.getByRole('button', { name: /^Call 0.0045 / }).click();
            await expect(page.getByText('$0.000216', { exact: true })).toBeVisible();
            await expect(page.getByText('−$0.00000135', { exact: true }).last()).toBeVisible();
        }
        await page.reload();
        await expect(page.getByRole('button', { name: asset, exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('td', { hasText: '%' }).first()).toBeVisible();
        expect(errors).toEqual([]);
    });
}

test('discovery failure keeps fallback markets available and retry recovers', async ({ page }) => {
    await mockChain(page);
    let fail = true;
    await page.route('**/api/derive/markets', route => fail
        ? route.fulfill({ status: 502, json: { error: 'unavailable' } })
        : route.fulfill({ json: { result: [{ symbol: 'HYPE', optionCount: 10, expiryCount: 1 }] } }));
    await page.goto('/');
    await expect(page.getByText(/Market discovery unavailable/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'PUMP', exact: true })).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Retry markets' }).click();
    await expect(page.getByText(/1 live option markets/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'PUMP', exact: true })).toHaveCount(0);
});

test('empty live discovery does not leave delisted markets selectable', async ({ page }) => {
    await mockChain(page);
    await page.route('**/api/derive/markets', route => route.fulfill({ json: { result: [] } }));
    await page.goto('/');
    await expect(page.getByText(/No active options are currently listed for HYPE/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'HYPE', exact: true })).toHaveCount(0);
});

test('a market with no resting bids offers mark prices without inventing executable yields', async ({ page }) => {
    const chain = await mockChain(page, 0.0045, 'PUMP');
    await page.route('**/api/derive/tickers*', route => route.fulfill({ json: { result: {
        tickers: Object.fromEntries(Object.entries(chain.tickers).map(([name, ticker]) => [name, { ...(ticker as object), b: 0 }])),
    } } }));
    await page.goto('/');
    await page.getByRole('button', { name: 'PUMP', exact: true }).click();
    await expect(page.locator('td', { hasText: '%' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Market', exact: true }).click();
    await expect(page.getByText(/Switch to MARK to view indicative prices/)).toBeVisible();
    await expect(page.locator('td', { hasText: '%' })).toHaveCount(0);
});
