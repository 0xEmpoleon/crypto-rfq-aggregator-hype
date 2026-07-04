import { describe, it, expect } from 'vitest';
import {
    normCdf,
    calculateGreeks,
    calculateProbExercise,
    calculateTailLoss,
    calculatePutApr,
    calculateCallApr,
    deriveTakerFee,
    scoreStrategy,
    rankLadders,
    estimateDvol,
    type StrategyLeg,
    type LadderContext,
} from './optionsMath';

describe('normCdf', () => {
    // Known Φ values; the A&S 7.1.26 approximation is good to |ε| < 1.5e-7.
    it('matches the standard normal CDF to 1e-5', () => {
        expect(normCdf(0)).toBeCloseTo(0.5, 5);
        expect(normCdf(1)).toBeCloseTo(0.841345, 5);
        expect(normCdf(2)).toBeCloseTo(0.977250, 5);
        expect(normCdf(-1)).toBeCloseTo(0.158655, 5);
        expect(normCdf(0.567)).toBeCloseTo(0.714643, 5);
    });

    it('is symmetric: Φ(x) + Φ(−x) = 1', () => {
        for (const x of [0.1, 0.5, 1.3, 2.7]) {
            expect(normCdf(x) + normCdf(-x)).toBeCloseTo(1, 9);
        }
    });
});

describe('calculateProbExercise', () => {
    it('reproduces the reference OTM call case (F=100, K=115, 21d, IV 60%)', () => {
        // With the correct CDF this is ~14.85%; the old scaling bug gave 12.08%.
        expect(calculateProbExercise(100, 115, 21 / 365, 0.6, 'C')).toBeCloseTo(0.1485, 3);
    });

    it('call and put probabilities at the same strike sum to 1', () => {
        const c = calculateProbExercise(100, 105, 30 / 365, 0.5, 'C');
        const p = calculateProbExercise(100, 105, 30 / 365, 0.5, 'P');
        expect(c + p).toBeCloseTo(1, 9);
    });

    it('returns 0 for zero IV or expired options', () => {
        expect(calculateProbExercise(100, 115, 21 / 365, 0, 'C')).toBe(0);
        expect(calculateProbExercise(100, 115, 0, 0.6, 'C')).toBe(0);
    });
});

describe('calculateGreeks', () => {
    it('ATM call delta is ~0.5 (slightly above under Black-76)', () => {
        const { delta } = calculateGreeks(100, 100, 30 / 365, 0.5, 'C');
        expect(delta).toBeGreaterThan(0.5);
        expect(delta).toBeLessThan(0.6);
    });

    it('put-call delta parity: Δc − Δp = 1', () => {
        const c = calculateGreeks(100, 110, 45 / 365, 0.6, 'C').delta;
        const p = calculateGreeks(100, 110, 45 / 365, 0.6, 'P').delta;
        expect(c - p).toBeCloseTo(1, 9);
    });
});

describe('calculateTailLoss (undiscounted Black-76 value)', () => {
    it('respects put-call parity: C − P = F − K', () => {
        const F = 100, K = 90, T = 30 / 365, iv = 0.55;
        const c = calculateTailLoss(F, K, T, iv, 'C');
        const p = calculateTailLoss(F, K, T, iv, 'P');
        expect(c - p).toBeCloseTo(F - K, 6);
    });
});

describe('APR', () => {
    it('CSP: full-year premium of 10 on strike 100 is 10% APR', () => {
        expect(calculatePutApr(10, 100, 365)).toBeCloseTo(10, 9);
    });
    it('covered call annualizes over the underlying and accepts fractional days', () => {
        expect(calculateCallApr(1, 100, 36.5)).toBeCloseTo(10, 9);
    });
    it('guards zero collateral/days', () => {
        expect(calculatePutApr(10, 0, 30)).toBe(0);
        expect(calculateCallApr(10, 100, 0)).toBe(0);
    });
});

describe('deriveTakerFee', () => {
    it('is base + notional rate when under the cap', () => {
        // $60k notional: 0.5 + 0.0004·60000 = $24.5, cap 12.5% of $1000 premium = $125
        expect(deriveTakerFee(60000, 1000)).toBeCloseTo(24.5, 9);
    });
    it('is capped at 12.5% of the premium', () => {
        // $40 notional HYPE, $2 premium: base alone (0.516) > cap (0.25)
        expect(deriveTakerFee(40, 2)).toBeCloseTo(0.25, 9);
    });
    it('returns 0 for degenerate inputs', () => {
        expect(deriveTakerFee(0, 10)).toBe(0);
        expect(deriveTakerFee(100, 0)).toBe(0);
    });
});

function mkLeg(over: Partial<StrategyLeg>): StrategyLeg {
    return {
        instrument: 'X', type: 'Put', strike: 90, expiry: '4JUL26',
        dte: 30, tYears: 30 / 365, apr: 20, markIv: 60, futuresPrice: 100,
        probExercise: 0.2, premiumUsd: 2, feeUsd: 0.25,
        tailLoss: 1.5, moneyness: 10, greeks: { delta: -0.2, gamma: 0, theta: 0, vega: 0 },
        ...over,
    };
}

describe('scoreStrategy', () => {
    const ctx: LadderContext = { atmIvByExpiry: { '4JUL26': 55, '1AUG26': 50 }, priceSource: 'market' };

    it('EV is net of fees', () => {
        const s = scoreStrategy([mkLeg({})], ctx);
        expect(s.ev).toBeCloseTo(2 - 0.25 - 1.5, 9);
        expect(s.totalFees).toBeCloseTo(0.25, 9);
    });

    it('vol edge compares to the ATM of the leg’s own expiry', () => {
        const s = scoreStrategy([mkLeg({ markIv: 66 })], ctx);
        expect(s.volEdge).toBeCloseTo((66 - 55) / 55, 9);
    });

    it('masks EV under mark pricing and vol edge without an ATM reference', () => {
        const mark = scoreStrategy([mkLeg({})], { ...ctx, priceSource: 'mark' });
        expect(mark.factorMask[0]).toBe(false);
        const noAtm = scoreStrategy([mkLeg({ expiry: 'UNKNOWN' })], ctx);
        expect(noAtm.factorMask[1]).toBe(false);
        expect(noAtm.volEdge).toBe(0);
    });

    it('flags cross-expiry ladders where P(any ex) is only a lower bound', () => {
        const single = scoreStrategy([mkLeg({}), mkLeg({ strike: 85 })], ctx);
        expect(single.crossExpiry).toBe(false);
        const cross = scoreStrategy([mkLeg({}), mkLeg({ expiry: '1AUG26' })], ctx);
        expect(cross.crossExpiry).toBe(true);
        expect(1 - cross.probAllOTM).toBeCloseTo(0.2, 9); // = max(pex), a lower bound
    });
});

describe('rankLadders', () => {
    const ctx: LadderContext = { atmIvByExpiry: { '4JUL26': 55 }, priceSource: 'market' };

    it('a single candidate no longer scores an automatic 5.0', () => {
        const [only] = rankLadders([{ legs: [mkLeg({})], ...scoreStrategy([mkLeg({})], ctx) }]);
        expect(only.score).toBe(0); // no factor spread → no information → no score
    });

    it('ranks a strictly better candidate first', () => {
        const good = [mkLeg({ premiumUsd: 4, apr: 40 })];
        const bad = [mkLeg({ premiumUsd: 1, apr: 8, probExercise: 0.5 })];
        const ranked = rankLadders([
            { legs: good, ...scoreStrategy(good, ctx) },
            { legs: bad, ...scoreStrategy(bad, ctx) },
        ]);
        expect(ranked[0].legs[0].premiumUsd).toBe(4);
        expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    });
});

describe('estimateDvol', () => {
    it('is exact on a flat vol curve', () => {
        expect(estimateDvol([{ dte: 10, iv: 50 }, { dte: 60, iv: 50 }])).toBeCloseTo(50, 6);
    });
    it('interpolates total variance between the bracketing expiries', () => {
        const v = estimateDvol([{ dte: 10, iv: 40 }, { dte: 60, iv: 60 }]);
        expect(v).toBeGreaterThan(40);
        expect(v).toBeLessThan(60);
    });
    it('falls back flat when only one side brackets 30d', () => {
        expect(estimateDvol([{ dte: 10, iv: 45 }])).toBe(45);
        expect(estimateDvol([{ dte: 50, iv: 65 }, { dte: 90, iv: 70 }])).toBe(65);
    });
});
