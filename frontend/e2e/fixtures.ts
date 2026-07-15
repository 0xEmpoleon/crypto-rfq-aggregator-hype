import type { Page } from '@playwright/test';

/**
 * Deterministic synthetic option chain served via route interception. A single
 * expiry ~30 days out (computed at run time so dte stays valid forever) with a
 * handful of near-the-money BTC strikes — enough for the matrix to render and
 * a ladder to form, with zero dependence on the live venues.
 */
export function buildChain(spot = 60000) {
    const d = new Date(Date.now() + 30 * 86400_000);
    const yyyymmdd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

    // strike → { call, put } mark premium (rough, just needs to be plausible)
    const rows = [
        { strike: 52000, iv: 0.66 },
        { strike: 56000, iv: 0.63 },
        { strike: 60000, iv: 0.60 },
        { strike: 64000, iv: 0.62 },
        { strike: 68000, iv: 0.65 },
    ];

    const instruments: { instrument_name: string }[] = [];
    const tickers: Record<string, unknown> = {};
    for (const { strike, iv } of rows) {
        for (const type of ['C', 'P'] as const) {
            const name = `BTC-${yyyymmdd}-${strike}-${type}`;
            instruments.push({ instrument_name: name });
            // crude intrinsic + time value so premiums are positive and varied
            const intrinsic = type === 'C' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
            const mark = Math.round(intrinsic + spot * iv * 0.08);
            tickers[name] = {
                M: mark,
                b: Math.round(mark * 0.98),
                a: Math.round(mark * 1.02),
                option_pricing: { f: spot, i: iv },
            };
        }
    }

    return { yyyymmdd, spot, instruments, tickers };
}

/** Route all Derive/Deribit calls to the synthetic chain. */
export async function mockChain(page: Page, spot = 60000) {
    const chain = buildChain(spot);

    await page.route('**/api/derive/ticker*', route =>
        route.fulfill({ json: { result: { mark_price: chain.spot } } })
    );
    await page.route('**/api/derive/instruments*', route =>
        route.fulfill({ json: { result: chain.instruments } })
    );
    await page.route('**/api/derive/tickers*', route =>
        route.fulfill({ json: { result: { tickers: chain.tickers } } })
    );
    // Deribit overlay is best-effort; an empty result exercises the no-overlay path.
    await page.route('**/deribit.com/**', route =>
        route.fulfill({ json: { result: [] } })
    );

    return chain;
}
