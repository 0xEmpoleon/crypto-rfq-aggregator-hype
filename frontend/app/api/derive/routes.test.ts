import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as instruments } from './instruments/route';
import { GET as ticker } from './ticker/route';
import { GET as tickers } from './tickers/route';

const upstream = vi.fn();
const request = (path: string) => new Request(`https://example.test/api/derive/${path}`);
const reply = (result: unknown) => upstream.mockResolvedValue(Response.json({ id: 'test', result }));

beforeEach(() => { upstream.mockReset(); vi.stubGlobal('fetch', upstream); });
afterEach(() => vi.unstubAllGlobals());

describe('Derive v3 market-data adapters', () => {
    it.each(['BTC', 'ETH', 'SOL', 'HYPE', 'XRP', 'ADA', 'ZEC', 'XAUT', 'CC'])(
        'discovers only %s options from the full live instrument list', async currency => {
            const names = [`${currency}-20261225-0_5-C`, `${currency}-20261225-100-P`];
            reply([...names, `${currency}-PERP`, `${currency}X-20261225-100-C`, 'USDC', `${currency}-malformed`]);
            const response = await instruments(request(`instruments?currency=${currency}`));
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ id: 'test', result: names.map(instrument_name => ({ instrument_name })) });
            expect(upstream).toHaveBeenCalledWith('https://api.derive.xyz/v3/public/get_all_live_instruments', expect.objectContaining({
                method: 'POST', body: '{}',
            }));
            expect(response.headers.get('Cache-Control')).toContain('s-maxage=15');
        },
    );

    it('adapts a slim ZEC perpetual mark to the existing browser contract', async () => {
        reply({ M: '1570.21', I: '1570.3', b: '0', a: '0', option_pricing: null });
        const response = await ticker(request('ticker?instrument_name=ZEC-PERP'));
        expect(await response.json()).toEqual({ id: 'test', result: { mark_price: '1570.21' } });
        expect(upstream).toHaveBeenCalledWith('https://api.derive.xyz/v3/public/get_ticker', expect.objectContaining({
            body: JSON.stringify({ instrument_name: 'ZEC-PERP' }),
        }));
    });

    it('loads the ZEC option chain from v3 and preserves zero bids', async () => {
        const result = { tickers: { 'ZEC-20261225-1700-C': {
            M: '340.1', b: '0', a: '0', I: '1570.1', option_pricing: { f: '1617.3', i: '1.23516' },
        } } };
        reply(result);
        const response = await tickers(request('tickers?currency=ZEC&expiry_date=20261225'));
        expect(await response.json()).toEqual({ id: 'test', result });
        expect(upstream).toHaveBeenCalledWith('https://api.derive.xyz/v3/public/get_tickers', expect.objectContaining({
            body: JSON.stringify({ currency: 'ZEC', instrument_type: 'option', expiry_date: '20261225' }),
        }));
    });

    it.each([undefined, null, {}, ['ZEC-PERP', 123]])('rejects malformed instrument lists: %j', async result => {
        reply(result);
        const response = await instruments(request('instruments?currency=ZEC'));
        expect(response.status).toBe(502);
        expect(response.headers.get('Cache-Control')).toBeNull();
    });

    it.each([{}, { M: 'NaN' }, { M: 'Infinity' }, { M: '0' }, { M: null }, { M: true }])(
        'rejects invalid spot prices: %j', async result => {
            reply(result);
            const response = await ticker(request('ticker?instrument_name=ZEC-PERP'));
            expect(response.status).toBe(502);
            expect(response.headers.get('Cache-Control')).toBeNull();
        },
    );

    it('preserves JSON-RPC errors without caching them', async () => {
        const error = { error: { code: -32602, message: 'Invalid params' } };
        upstream.mockResolvedValue(Response.json(error));
        const response = await instruments(request('instruments?currency=ZEC'));
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual(error);
        expect(response.headers.get('Cache-Control')).toBeNull();
    });

    it.each(['network', 'http', 'non-json'])('handles %s upstream failures', async failure => {
        if (failure === 'network') upstream.mockRejectedValue(new Error('offline'));
        else upstream.mockResolvedValue(new Response('unavailable', { status: failure === 'http' ? 503 : 200 }));
        const response = await tickers(request('tickers?currency=ZEC&expiry_date=20261225'));
        expect(response.status).toBe(502);
        expect(response.headers.get('Cache-Control')).toBeNull();
    });

    it('rejects invalid parameters before calling Derive', async () => {
        expect((await instruments(request('instruments?currency=ZEC.*'))).status).toBe(400);
        expect((await ticker(request('ticker?instrument_name=ZEC-20261225-1700-C'))).status).toBe(400);
        expect((await tickers(request('tickers?currency=ZEC&expiry_date=bad'))).status).toBe(400);
        expect(upstream).not.toHaveBeenCalled();
    });
});
