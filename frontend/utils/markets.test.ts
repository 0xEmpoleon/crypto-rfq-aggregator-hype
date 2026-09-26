import { describe, expect, it } from 'vitest';
import { discoverOptionMarkets } from './markets';
import { getAssetConfig } from '../config/assets';
import { formatPrice } from './format';

const now = Date.UTC(2026, 8, 26);

describe('live options market discovery', () => {
    it('finds new symbols without configuration and ignores perps, spot, expired and invalid contracts', () => {
        expect(discoverOptionMarkets([
            'NEWCOIN-20261002-0_0025-C', 'NEWCOIN-20261002-0_0025-P',
            'NEWCOIN-20261002-0_0025-P', 'NEWCOIN-20261030-0_003-C',
            'BTC-20261002-60000-C', 'PUMP-20261002-0_0045-P',
            'DOGE-PERP', 'USDC', 'OLD-20260925-1-C',
            'BAD-20261302-1-C', 'BAD-20260931-1-C', 'BAD-20261002-0-C', 'BAD-20261002-1-X',
        ], now)).toEqual([
            { symbol: 'BTC', optionCount: 1, expiryCount: 1 },
            { symbol: 'PUMP', optionCount: 1, expiryCount: 1 },
            { symbol: 'NEWCOIN', optionCount: 3, expiryCount: 2 },
        ]);
    });

    it('removes a market at its 08:00 UTC expiry boundary', () => {
        const names = ['VVV-20260926-30-C'];
        expect(discoverOptionMarkets(names, Date.UTC(2026, 8, 26, 7, 59))).toHaveLength(1);
        expect(discoverOptionMarkets(names, Date.UTC(2026, 8, 26, 8))).toEqual([]);
    });

    it.each([null, {}, ['BTC-PERP', 123]])('rejects malformed upstream lists: %j', value => {
        expect(() => discoverOptionMarkets(value, now)).toThrow();
    });
});

describe('small-token display and live-price configuration', () => {
    it('keeps nearby PUMP strikes distinct and fees nonzero', () => {
        expect(formatPrice(0.0045)).toBe('0.0045');
        expect(formatPrice(0.004)).toBe('0.004');
        expect(formatPrice(0.00000132, 2)).toBe('0.00000132');
        expect(formatPrice(-0.00000021, 2)).toBe('-0.00000021');
        expect(formatPrice(0, 2)).toBe('0.00');
        expect(formatPrice(NaN)).toBe('—');
    });

    it('configures unknown assets from live prices without a fabricated fallback', () => {
        const cfg = getAssetConfig('NEWCOIN', 0.0044);
        expect(cfg.symbol).toBe('NEWCOIN');
        expect(cfg.strikeRange).toBeCloseTo(0.00176, 8);
        expect(cfg.deribitArb).toBe(false);
        expect(getAssetConfig('NEWCOIN').strikeRange).toBe(0);
        expect(getAssetConfig('BTC', 100000).strikeRange).toBe(40000);
        expect(getAssetConfig('BTC', 100000).deribitArb).toBe(true);
    });
});
