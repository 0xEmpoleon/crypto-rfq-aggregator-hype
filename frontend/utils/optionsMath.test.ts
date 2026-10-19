import { describe, it, expect } from 'vitest';
import {
    normCdf,
    calculateGreeks,
    calculateProbExercise,
    calculateTailLoss,
    calculatePutApr,
    calculateCallApr,
    deriveTakerFee,
    deriveMakerFee,
    deriveFee,
    effectiveFeeRole,
    scoreStrategy,
    rankLadders,
    findBestLadder,
    isRecommended,
    spreadPick,
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

// Live V3 schedule (get_all_instruments, 2026-10-19): base 0.5, maker 0.0001,
// taker 0.0003, cap 0.125 — the cap applies to the NOTIONAL part only and the
// taker base fee is per order.
describe('deriveTakerFee', () => {
    it('is notional rate on the index plus the $0.50 base when under the cap', () => {
        // $60k index: 0.0003·60000 = $18 (< cap $125 on a $1000 premium) + $0.50 base
        expect(deriveTakerFee(60000, 1000)).toBeCloseTo(18.5, 9);
    });
    it('caps only the notional part at 12.5% of the premium; the base fee sits outside the cap', () => {
        // Cheap OTM BTC wing: $82.6k index, $6 premium → min(24.79, 0.75) + 0.5
        expect(deriveTakerFee(82634, 6)).toBeCloseTo(1.25, 9);
    });
    it('shares the per-order base fee across the contracts in the order', () => {
        expect(deriveTakerFee(60000, 1000, 10)).toBeCloseTo(18 + 0.05, 9);
    });
    it('returns 0 for degenerate inputs', () => {
        expect(deriveTakerFee(0, 10)).toBe(0);
        expect(deriveTakerFee(100, 0)).toBe(0);
    });
});

describe('deriveMakerFee / deriveFee role dispatch', () => {
    it('maker (0.01%, no base) is cheaper than taker for the same row', () => {
        expect(deriveMakerFee(60000, 1000)).toBeCloseTo(6, 9);
        expect(deriveMakerFee(60000, 1000)).toBeLessThan(deriveTakerFee(60000, 1000));
    });
    it('the 12.5%-of-premium cap binds the maker notional fee on cheap wings', () => {
        expect(deriveMakerFee(82634, 6)).toBeCloseTo(0.75, 9);
        expect(deriveMakerFee(40, 2)).toBeCloseTo(0.004, 9);
    });
    it('deriveFee dispatches by role and forwards the order size', () => {
        expect(deriveFee(60000, 1000, 'maker')).toBeCloseTo(deriveMakerFee(60000, 1000), 9);
        expect(deriveFee(60000, 1000, 'taker', 4)).toBeCloseTo(deriveTakerFee(60000, 1000, 4), 9);
    });
    it('selling into the bid is always a taker fill (MARKET forces taker)', () => {
        expect(effectiveFeeRole('market', 'maker')).toBe('taker');
        expect(effectiveFeeRole('mark', 'maker')).toBe('maker');
        expect(effectiveFeeRole('mark', 'taker')).toBe('taker');
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
    const fv = (k: Record<string, number>): LadderContext => ({ ...ctx, priceSource: 'mark', deribitMarkByKey: k });

    it('EV is net of fees (own-model fallback when there is no fair value)', () => {
        const s = scoreStrategy([mkLeg({})], ctx);
        expect(s.ev).toBeCloseTo(2 - 0.25 - 1.5, 9);
        expect(s.totalFees).toBeCloseTo(0.25, 9);
    });

    it('skew (display only) compares to the ATM of the leg’s own expiry', () => {
        const s = scoreStrategy([mkLeg({ markIv: 66 })], ctx);
        expect(s.volEdge).toBeCloseTo((66 - 55) / 55, 9);
        expect(s.factors).toHaveLength(4); // skew is not a ranking factor
    });

    it('a live Derive bid is NOT an independent fair value: EV and edge stay masked under MARKET', () => {
        // Regression: market mode used to unmask EV = bid − own-model value,
        // which is just −spread − fee (always ≤ 0) at 30% weight.
        for (const priceSource of ['market', 'mark'] as const) {
            const s = scoreStrategy([mkLeg({})], { ...ctx, priceSource });
            expect(s.evIsIndependent).toBe(false);
            expect(s.factorMask[0]).toBe(false); // EV
            expect(s.factorMask[1]).toBe(false); // edge (subsumes Risk/Return + Kelly)
        }
    });

    it('unmasks EV and edge when a Deribit fair value covers every leg', () => {
        const s = scoreStrategy([mkLeg({})], fv({ 'P-90-4JUL26': 1.0 }));
        expect(s.evIsIndependent).toBe(true);
        expect(s.factorMask.slice(0, 2)).toEqual([true, true]);
        // EV = netPrem − Deribit mark = (2 − 0.25) − 1.0 = 0.75
        expect(s.ev).toBeCloseTo(0.75, 9);
        expect(s.edge).toBeCloseTo(0.75 / 1.75, 9);
        // A leg without Deribit coverage keeps everything masked
        const partial = scoreStrategy([mkLeg({}), mkLeg({ strike: 85 })], fv({ 'P-90-4JUL26': 1.0 }));
        expect(partial.evIsIndependent).toBe(false);
    });

    it('edge is the binary Kelly fraction 1 − E[payoff]/premium (no double-counted P(ex))', () => {
        // Regression: the old kelly subtracted P(ex) twice and was 0 here.
        const leg = (premiumUsd: number) => mkLeg({ probExercise: 0.3, premiumUsd, feeUsd: 0 });
        const k = fv({ 'P-90-4JUL26': 1000 });
        expect(scoreStrategy([leg(1250)], k).edge).toBeCloseTo(0.2, 9);
        expect(scoreStrategy([leg(1500)], k).edge).toBeCloseTo(1 / 3, 9);
        expect(scoreStrategy([leg(1500)], k).kelly).toBeCloseTo(1 / 3, 9);
        expect(scoreStrategy([leg(900)], k).kelly).toBe(0); // −EV → no bet
    });

    it('risk severity is symmetric across puts and calls (Risk/Return comparable)', () => {
        const put = scoreStrategy([mkLeg({ type: 'Put' })], ctx);
        const call = scoreStrategy([mkLeg({ type: 'Call' })], ctx);
        expect(call.riskReturn).toBeCloseTo(put.riskReturn, 9);
    });

    it('reports a displayed max loss (collateral → 0, net of premium) per type', () => {
        const put = scoreStrategy([mkLeg({ type: 'Put' })], ctx);   // strike 90 − netPrem 1.75
        expect(put.maxLossUsd).toBeCloseTo(88.25, 9);
        const call = scoreStrategy([mkLeg({ type: 'Call' })], ctx); // futures 100 − netPrem 1.75
        expect(call.maxLossUsd).toBeCloseTo(98.25, 9);
    });

    it('ranking factors are intensive: N identical legs score like 1 leg', () => {
        const k = fv({ 'P-90-4JUL26': 1.0 });
        const one = scoreStrategy([mkLeg({})], k);
        const three = scoreStrategy([mkLeg({}), mkLeg({}), mkLeg({})], k);
        expect(three.evAnnual).toBeCloseTo(one.evAnnual, 9);
        expect(three.edge).toBeCloseTo(one.edge, 9);
        expect(three.thetaEff).toBeCloseTo(one.thetaEff, 9);
        expect(three.riskReturn).toBeCloseTo(one.riskReturn, 9);
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

describe('findBestLadder + isRecommended', () => {
    const ctx: LadderContext = { atmIvByExpiry: { '4JUL26': 55 }, priceSource: 'market' };

    it('poolSize counts unique combos once (per-expiry and top-APR passes overlap)', () => {
        const trades = [mkLeg({ strike: 90 }), mkLeg({ strike: 85, premiumUsd: 1.5 })];
        const res = findBestLadder(trades, 'Put', ctx, [1], false);
        expect(res).not.toBeNull();
        expect(res!.poolSize).toBe(2);
    });

    it('returns null when no candidates exist', () => {
        expect(findBestLadder([], 'Put', ctx, [1, 2], false)).toBeNull();
    });

    it('without a fair value the pick is labelled a yield pick, never an edge claim', () => {
        const trades = [mkLeg({ strike: 90 }), mkLeg({ strike: 85, premiumUsd: 1.5 })];
        const res = findBestLadder(trades, 'Put', ctx, [1], false)!;
        expect(res.edgeMode).toBe(false);
        expect(res.kind).toBe('yield');
    });

    it('never highlights a ladder that is −EV against Deribit, however well it ranks', () => {
        // Regression: the gate used to be relative score only, so the best of
        // an all-negative pool was still recommended.
        const trades = [mkLeg({ strike: 90 }), mkLeg({ strike: 85, premiumUsd: 1.5 })];
        const rich = { ...ctx, deribitMarkByKey: { 'P-90-4JUL26': 5, 'P-85-4JUL26': 4 } };
        const neg = findBestLadder(trades, 'Put', rich, [1], false)!;
        expect(neg.edgeMode).toBe(true);
        expect(neg.kind).toBe('negative');
        expect(neg.best.score).toBeGreaterThan(5);
        expect(isRecommended(neg, 5)).toBe(false);

        const cheap = { ...ctx, deribitMarkByKey: { 'P-90-4JUL26': 0.5, 'P-85-4JUL26': 0.6 } };
        const pos = findBestLadder(trades, 'Put', cheap, [1], false)!;
        expect(pos.kind).toBe('edge');
        expect(isRecommended(pos, 5)).toBe(true);
    });

    it('ranks only Deribit-covered candidates when two or more exist', () => {
        const trades = [mkLeg({ strike: 90 }), mkLeg({ strike: 85 }), mkLeg({ strike: 80, premiumUsd: 9 })];
        const k = { ...ctx, deribitMarkByKey: { 'P-90-4JUL26': 1, 'P-85-4JUL26': 1 } };
        const res = findBestLadder(trades, 'Put', k, [1], false)!;
        expect(res.edgeMode).toBe(true);
        expect(res.best.legs[0].strike).not.toBe(80); // uncovered, however rich
    });
});

describe('spreadPick (candidate strike sampling)', () => {
    it('spreads evenly across the range instead of taking the nearest N', () => {
        const strikes = Array.from({ length: 20 }, (_, i) => i);
        expect(spreadPick(strikes, 5)).toEqual([0, 5, 10, 14, 19]);
        expect(spreadPick([1, 2, 3], 5)).toEqual([1, 2, 3]);
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
