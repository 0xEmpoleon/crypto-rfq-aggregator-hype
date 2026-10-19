/**
 * Option Strategy Math & Statistics Utilities
 *
 * Black-76 style: the "underlying" passed everywhere is Derive's forward
 * price (option_pricing.f), so no risk-free-rate term is needed in d1/d2.
 * The only simplification vs full Black-76 is the missing e^{-rT} discount.
 *
 * Methodology (revised 2026-10-19 after an adversarial review):
 *  - Without an INDEPENDENT fair value, every mark-derived "edge" is ≈0 or
 *    just −fee/−spread by construction. So EV and the edge ratio are scored
 *    only against a cross-venue Deribit mark; otherwise they are masked and
 *    the ranking is an honest yield pick (premium/day inside the P(ex) cap).
 *  - Skew vs ATM is displayed, never ranked: a convex smile makes every
 *    OTM strike look "rich" without saying anything about mispricing.
 */

export interface Greeks { delta: number; gamma: number; theta: number; vega: number }

export interface StrategyLeg {
    instrument: string;
    type: 'Put' | 'Call';
    strike: number;
    expiry: string;          // display label, e.g. '4JUL26'
    dte: number;             // whole days shown in the UI (ceil)
    tYears: number;          // exact time to expiry in years
    apr: number;             // simple annualized yield, net of fees (%)
    markIv: number;          // %
    futuresPrice: number;
    probExercise: number;
    premiumUsd: number;      // gross premium at the selected price source
    feeUsd: number;          // estimated fee per contract at the effective role
    tailLoss: number;        // unconditional expected ITM payoff
    moneyness: number;
    greeks: Greeks;
}

export interface LadderContext {
    /** Per-expiry-label ATM IV (%) — vol edge compares a leg to the ATM of its OWN expiry. */
    atmIvByExpiry: Record<string, number>;
    priceSource: 'mark' | 'market';
    /** Cross-venue fair value (Deribit mark, USD), keyed `TYPE-STRIKE-EXPIRY`
     *  (e.g. "C-63000-4JUL26"). The ONLY thing that unmasks EV and the edge
     *  ratio: a live Derive bid is not independent — Derive's own model value
     *  is ≈ its mark, so bid-vs-model is just the spread plus fees. */
    deribitMarkByKey?: Record<string, number>;
}

export interface ScoredLadder {
    legs: StrategyLeg[];
    score: number;
    topFactor: string;
    ev: number;
    evAnnual: number;
    /** EV ÷ net premium — the share of the premium that is edge. Equals the
     *  binary Kelly fraction 1 − E[payoff]/W. Ranked (when independent). */
    edge: number;
    /** Strike IV vs same-expiry ATM IV. DISPLAY ONLY — smile shape, not edge. */
    volEdge: number;
    thetaEff: number;
    /** EV ÷ expected payoff. Display only: monotone in `edge`, so ranking both double-counts. */
    riskReturn: number;
    /** max(0, edge) — kept for display continuity. */
    kelly: number;
    diversification: number;
    probAllOTM: number;
    /** true when the ladder spans more than one expiry — P(any ex) is then only a LOWER bound. */
    crossExpiry: boolean;
    /** true when EV was scored against an independent fair value (a Deribit mark for every leg). */
    evIsIndependent: boolean;
    totalPrem: number;
    totalFees: number;
    /** Structural worst case for display only (collateral → 0, net of premium). NOT a ranking input. */
    maxLossUsd: number;
    avgApr: number;
    factors: number[];
    factorMask: boolean[];
}

/* ── Derive fee schedule (V3) ─────────────────────────────────────
   Read live from public/get_all_instruments on 2026-10-19 — every option
   instrument on BTC/SOL/HYPE/ZEC carried base_fee 0.5, maker_fee_rate
   0.0001, taker_fee_rate 0.0003, mark_price_fee_rate_cap 0.125. (The old
   0.03% maker / 0.04% taker figures came from a stale help-centre page.)
   Per contract: notional fee = rate × index price, capped at 12.5% of the
   option's value. Takers ALSO pay a $0.50 base fee per TRADE — outside the
   cap and shared by every contract in the order. Makers pay no base fee.
   Role follows execution: hitting a resting bid ('market') is a taker
   fill; a resting quote filled at ~mark is a maker fill. */
export const DERIVE_TAKER_BASE_USD = 0.5;
export const DERIVE_TAKER_NOTIONAL_RATE = 0.0003;
export const DERIVE_MAKER_NOTIONAL_RATE = 0.0001;
export const DERIVE_FEE_CAP_OF_PREMIUM = 0.125;

export type FeeRole = 'maker' | 'taker';

/** Per-contract taker fee. `contractsPerOrder` amortises the per-trade base fee. */
export function deriveTakerFee(indexPrice: number, premiumUsd: number, contractsPerOrder = 1): number {
    if (premiumUsd <= 0 || indexPrice <= 0) return 0;
    const n = Math.max(1, contractsPerOrder);
    return Math.min(DERIVE_TAKER_NOTIONAL_RATE * indexPrice, DERIVE_FEE_CAP_OF_PREMIUM * premiumUsd)
        + DERIVE_TAKER_BASE_USD / n;
}

/** Per-contract maker fee (no base fee). */
export function deriveMakerFee(indexPrice: number, premiumUsd: number): number {
    if (premiumUsd <= 0 || indexPrice <= 0) return 0;
    return Math.min(DERIVE_MAKER_NOTIONAL_RATE * indexPrice, DERIVE_FEE_CAP_OF_PREMIUM * premiumUsd);
}

/** Estimated Derive fee for one contract at the given execution role. */
export function deriveFee(indexPrice: number, premiumUsd: number, role: FeeRole, contractsPerOrder = 1): number {
    return role === 'maker'
        ? deriveMakerFee(indexPrice, premiumUsd)
        : deriveTakerFee(indexPrice, premiumUsd, contractsPerOrder);
}

/** Selling into the live bid can only be a taker fill, whatever the toggle says. */
export function effectiveFeeRole(priceSource: 'mark' | 'market', chosen: FeeRole): FeeRole {
    return priceSource === 'market' ? 'taker' : chosen;
}

/**
 * Normal Cumulative Distribution Function.
 * Abramowitz–Stegun 7.1.26 erf approximation (|ε| < 1.5e-7):
 * Φ(x) = ½(1 + erf(x/√2)) — the polynomial argument must be x/√2,
 * matching the e^{-x²/2} = e^{-z²} exponent.
 */
export function normCdf(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const z = Math.abs(x) / Math.SQRT2;
    const t = 1 / (1 + p * z);
    const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    return 0.5 * (1 + sign * erf);
}

/**
 * Normal Probability Density Function
 */
export function normPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Black-Scholes Greeks Calculation
 */
export function calculateGreeks(S: number, K: number, T: number, sigma: number, type: 'C' | 'P'): Greeks {
    if (T <= 0 || sigma <= 0) return { delta: 0, gamma: 0, theta: 0, vega: 0 };
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);

    const Nd1 = normCdf(d1);
    const nPdfd1 = normPdf(d1);

    const delta = type === 'C' ? Nd1 : Nd1 - 1;
    const gamma = nPdfd1 / (S * sigma * sqrtT);
    const vega = S * nPdfd1 * sqrtT / 100;
    const theta = -(S * sigma * nPdfd1) / (2 * sqrtT) / 365;

    return { delta, gamma, theta, vega };
}

/**
 * Probability of Exercise (P(ex)) — N(d2) for calls, N(−d2) for puts.
 */
export function calculateProbExercise(S: number, K: number, T: number, sigma: number, type: 'C' | 'P'): number {
    if (T <= 0 || sigma <= 0) return 0;
    const d2 = (Math.log(S / K) - 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
    return type === 'C' ? normCdf(d2) : normCdf(-d2);
}

/**
 * Unconditional expected ITM payoff (undiscounted Black-76 option value).
 */
export function calculateTailLoss(S: number, K: number, T: number, sigma: number, type: 'C' | 'P'): number {
    if (T <= 0 || sigma <= 0) return 0;
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;

    if (type === 'P') {
        const Nd2 = normCdf(-d2);
        if (Nd2 < 1e-10) return 0;
        return Math.max(0, K * Nd2 - S * normCdf(-d1));
    } else {
        const Nd2 = normCdf(d2);
        if (Nd2 < 1e-10) return 0;
        return Math.max(0, S * normCdf(d1) - K * Nd2);
    }
}

/**
 * Simple annualized yield (APR, not compounded) for cash-secured puts:
 * net premium over strike collateral. `days` may be fractional.
 */
export function calculatePutApr(netPremium: number, strike: number, days: number): number {
    return days > 0 && strike > 0 ? (netPremium / strike) * (365 / days) * 100 : 0;
}

/**
 * Simple annualized yield (APR) for covered calls: net premium over the
 * underlying collateral. `days` may be fractional.
 */
export function calculateCallApr(netPremium: number, underlying: number, days: number): number {
    return days > 0 && underlying > 0 ? (netPremium / underlying) * (365 / days) * 100 : 0;
}

/**
 * Array combination utility
 */
export function combinations<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const [first, ...rest] = arr;
    return [...combinations(rest, k - 1).map(c => [first, ...c]), ...combinations(rest, k)];
}

/**
 * Array combination with repetition utility
 */
export function combinationsWithRep<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    const [first, ...rest] = arr;
    return [...combinationsWithRep(arr, k - 1).map(c => [first, ...c]), ...combinationsWithRep(rest, k)];
}

/**
 * Statistical Strategy Scoring.
 * Every dollar figure is net of estimated fees.
 */
export function scoreStrategy(legs: StrategyLeg[], ctx: LadderContext) {
    const n = legs.length;
    let totalEv = 0, totalPayoff = 0, totalPrem = 0, totalFees = 0, totalNetPrem = 0, totalApr = 0,
        volEdgeSum = 0, volEdgeCount = 0, thetaSum = 0, dteExactSum = 0,
        maxLossUsd = 0, independentEvLegs = 0;

    for (const l of legs) {
        const T = l.tYears;
        const dteExact = Math.max(T * 365, 1 / 24);
        const netPrem = Math.max(0, l.premiumUsd - (l.feeUsd || 0));

        // Short-seller EV = net credit − expected exercise payoff. The payoff
        // benchmark must be INDEPENDENT of the price being sold: a Deribit mark
        // for the same strike/expiry. Without one, the fallback is Derive's own
        // model (tailLoss, priced off Derive's mark IV and forward ≈ the mark),
        // which makes EV ≈ −fee (MARK) or −spread−fee (MARKET) by construction —
        // computed for display, masked from ranking below.
        const dKey = `${l.type === 'Call' ? 'C' : 'P'}-${l.strike}-${l.expiry}`;
        const fair = ctx.deribitMarkByKey?.[dKey];
        const hasFair = fair != null && fair > 0;
        if (hasFair) independentEvLegs++;
        const payoff = hasFair ? fair : l.tailLoss;

        totalEv += netPrem - payoff;
        totalPayoff += payoff;

        // Structural worst case for DISPLAY only: collateral (strike for CSP,
        // 1 coin at spot for a covered call) to zero, net of premium.
        maxLossUsd += Math.max(0, (l.type === 'Put' ? l.strike : l.futuresPrice) - netPrem);

        totalPrem += l.premiumUsd;
        totalFees += l.feeUsd || 0;
        totalNetPrem += netPrem;
        totalApr += l.apr;
        dteExactSum += dteExact;
        // Skew reading: this strike's IV vs the ATM IV of the SAME expiry.
        const atm = ctx.atmIvByExpiry[l.expiry];
        if (atm && atm > 0) { volEdgeSum += (l.markIv - atm) / atm; volEdgeCount++; }
        thetaSum += netPrem / dteExact;
    }

    const avgDte = dteExactSum / n;
    const fp0 = legs[0].futuresPrice;
    const avgApr = totalApr / n;
    // Ranking factors must be INTENSIVE (per-contract), not extensive sums —
    // otherwise a 5-leg ladder mechanically posts ~5× the EV/theta of a
    // 1-leg one and Auto mode always picks the maximum leg count.
    const evAnnual = (totalEv / n) * (365 / avgDte);
    const volEdge = volEdgeCount > 0 ? volEdgeSum / volEdgeCount : 0;
    const thetaEff = thetaSum / n;
    // Edge ratio: a seller keeps W, and on exercise (prob p) pays L given
    // exercise. Binary Kelly f = (1−p) − p·(L−W)/W = 1 − p·L/W = 1 − E[payoff]/W
    // = EV/W. (The old form subtracted p a second time, so it was always 0.)
    const edge = totalNetPrem > 0 ? totalEv / totalNetPrem : 0;
    const riskReturn = totalPayoff > 0 ? totalEv / totalPayoff : 0;
    const kelly = Math.max(0, edge);

    const maxPex = Math.max(...legs.map(l => l.probExercise));
    // Exact for single-expiry same-type ladders (ITM events nest by strike).
    // For cross-expiry ladders this is only a LOWER bound on P(any exercise).
    const probAllOTM = 1 - maxPex;
    const crossExpiry = new Set(legs.map(l => l.expiry)).size > 1;

    const strikes = legs.map(l => l.strike);
    const diversification = (Math.max(...strikes) - Math.min(...strikes)) / fp0;

    const factors = [evAnnual, edge, thetaEff, diversification];
    // EV and the edge ratio carry information only against an independent
    // fair value for EVERY leg; otherwise they are own-mark-vs-own-model.
    const evIsIndependent = independentEvLegs === n;
    const factorMask = [evIsIndependent, evIsIndependent, true, true];

    return {
        ev: totalEv,
        evAnnual,
        edge,
        volEdge,
        thetaEff,
        riskReturn,
        kelly,
        diversification,
        probAllOTM,
        crossExpiry,
        evIsIndependent,
        totalPrem,
        totalFees,
        maxLossUsd,
        avgApr,
        factors,
        factorMask,
    };
}

/* Weights are renormalised over the active factors. With a fair value:
   EV 37.5% · edge 37.5% · premium/day 18.75% · diversification 6.25%.
   Without one (yield pick): premium/day 75% · diversification 25%. */
const FACTOR_WEIGHTS = [0.30, 0.30, 0.15, 0.05];
const FACTOR_NAMES = ['Expected Value', 'Edge / premium', 'Premium / day', 'Diversification'];

/**
 * Min-max normalizes factors ACROSS THE WHOLE candidate pool and ranks by
 * weighted score. Factors that are masked out (see scoreStrategy) or carry
 * no spread across the pool are dropped and the remaining weights are
 * renormalized — a degenerate pool can no longer manufacture a 5.0 score.
 */
export function rankLadders(candidates: any[]): ScoredLadder[] {
    if (!candidates.length) return [];

    const nFactors = FACTOR_WEIGHTS.length;
    const mins = Array(nFactors).fill(Infinity);
    const maxs = Array(nFactors).fill(-Infinity);
    const active = Array(nFactors).fill(true);

    for (const c of candidates) {
        for (let i = 0; i < nFactors; i++) {
            mins[i] = Math.min(mins[i], c.factors[i]);
            maxs[i] = Math.max(maxs[i], c.factors[i]);
            if (!c.factorMask[i]) active[i] = false;
        }
    }
    for (let i = 0; i < nFactors; i++) {
        if (maxs[i] - mins[i] <= 1e-10) active[i] = false;
    }
    const weightSum = FACTOR_WEIGHTS.reduce((s, w, i) => s + (active[i] ? w : 0), 0);

    return candidates.map(c => {
        let score = 0;
        let topContrib = -Infinity;
        let topIdx = -1;
        if (weightSum > 0) {
            for (let i = 0; i < nFactors; i++) {
                if (!active[i]) continue;
                const norm = (c.factors[i] - mins[i]) / (maxs[i] - mins[i]);
                const contrib = (FACTOR_WEIGHTS[i] / weightSum) * norm;
                score += contrib;
                if (contrib > topContrib) { topContrib = contrib; topIdx = i; }
            }
        }
        const score10 = Math.min(10, Math.max(0, score * 10));
        return { ...c, score: score10, topFactor: topIdx >= 0 ? FACTOR_NAMES[topIdx] : '—' };
    }).sort((a, b) => b.score - a.score);
}

/** Picks `k` items spread evenly across `arr` (always keeps both ends). */
export function spreadPick<T>(arr: T[], k: number): T[] {
    if (arr.length <= k) return arr;
    if (k <= 1) return arr.slice(0, Math.max(0, k));
    const out: T[] = [];
    for (let i = 0; i < k; i++) out.push(arr[Math.round(i * (arr.length - 1) / (k - 1))]);
    return out;
}

/**
 * Generates scored (unranked) ladder candidates for one leg count.
 */
export function generateLadderCandidates(trades: StrategyLeg[], type: 'Call' | 'Put', ctx: LadderContext, numLegs: number, allowRep: boolean): any[] {
    const ofType = trades.filter(t => t.type === type);
    if (!allowRep && ofType.length < numLegs) return [];
    if (allowRep && ofType.length === 0) return [];

    const unique = new Map<string, StrategyLeg>();
    for (const t of ofType) {
        const key = `${t.strike}-${t.expiry}`;
        if (!unique.has(key)) unique.set(key, t);
    }

    const all = Array.from(unique.values()).sort((a, b) => b.apr - a.apr);
    const allCandidates: any[] = [];
    // One dedupe across BOTH generation passes — a single-expiry combo that is
    // also inside the top-APR pool must not be counted twice (poolSize gates
    // the "carries ranking information" check in the UI).
    const seen = new Set<string>();
    const pushCombo = (combo: StrategyLeg[]) => {
        const key = combo.map(x => `${x.strike}-${x.expiry}`).sort().join('|');
        if (seen.has(key)) return;
        seen.add(key);
        allCandidates.push({ legs: combo, ...scoreStrategy(combo, ctx) });
    };

    const perExpiryCap = allowRep ? Math.min(5, numLegs + 2) : Math.max(8, numLegs + 5);
    const byExpiry = new Map<string, StrategyLeg[]>();
    for (const t of all) {
        const arr = byExpiry.get(t.expiry) || [];
        arr.push(t);
        byExpiry.set(t.expiry, arr);
    }

    for (const [, expTrades] of Array.from(byExpiry.entries())) {
        // Sample strikes EVENLY across the eligible range, not the N nearest
        // the money — nearest-N packs every candidate against the P(ex) cap.
        const opts = spreadPick(
            expTrades.sort((a, b) => type === 'Call' ? a.strike - b.strike : b.strike - a.strike),
            perExpiryCap
        );
        if (!allowRep && opts.length < numLegs) continue;
        const combos = allowRep ? combinationsWithRep(opts, numLegs) : combinations(opts, numLegs);
        for (const combo of combos) pushCombo(combo);
    }

    const topCap = allowRep ? 8 : 15;
    const top = all.slice(0, topCap);
    if ((allowRep && top.length > 0) || (!allowRep && top.length >= numLegs)) {
        const combos = allowRep ? combinationsWithRep(top, numLegs) : combinations(top, numLegs);
        for (const combo of combos) pushCombo(combo);
    }

    return allCandidates;
}

export type RecommendationKind = 'edge' | 'negative' | 'yield';

export interface LadderPick {
    best: ScoredLadder;
    poolSize: number;
    /** true when the pool was ranked on EV against Deribit fair values. */
    edgeMode: boolean;
    kind: RecommendationKind;
}

/**
 * Core Strategy Finder.
 * Collects candidates for EVERY requested leg count into ONE pool and ranks
 * them in a single normalization pass, so scores are comparable across leg
 * counts. When at least two candidates are fully covered by an independent
 * fair value, ONLY those are ranked (edge mode) — mixing them with uncovered
 * candidates would silently mask EV for the whole pool.
 */
export function findBestLadder(trades: StrategyLeg[], type: 'Call' | 'Put', ctx: LadderContext, legCounts: number[], allowRep: boolean): LadderPick | null {
    const pool: any[] = [];
    for (const n of legCounts) {
        pool.push(...generateLadderCandidates(trades, type, ctx, n, allowRep));
    }
    if (!pool.length) return null;
    const covered = pool.filter(c => c.evIsIndependent);
    const edgeMode = covered.length >= 2;
    const ranked = rankLadders(edgeMode ? covered : pool);
    const best = ranked[0];
    const kind: RecommendationKind = edgeMode ? (best.ev > 0 ? 'edge' : 'negative') : 'yield';
    return { best, poolSize: ranked.length, edgeMode, kind };
}

/**
 * Absolute gate on top of the relative score: a pool of one carries no
 * ranking information, and a ladder that is −EV against an independent fair
 * value is never highlighted, however well it ranks against its peers.
 */
export function isRecommended(pick: LadderPick | null, minScore: number): boolean {
    if (!pick || pick.poolSize <= 1 || pick.best.score < minScore) return false;
    return pick.kind !== 'negative';
}

/**
 * DVOL Estimation via Linear Variance Interpolation
 */
export function estimateDvol(expiryAtms: { dte: number; iv: number }[]): number {
    if (expiryAtms.length === 0) return 0;
    if (expiryAtms.length === 1) return expiryAtms[0].iv;

    const sorted = [...expiryAtms].sort((a, b) => a.dte - b.dte);
    const e1 = [...sorted].reverse().find(e => e.dte <= 30);
    const e2 = sorted.find(e => e.dte > 30);

    if (e1 && e2) {
        const t1 = e1.dte / 365, t2 = e2.dte / 365, t30 = 30 / 365;
        const var1 = e1.iv * e1.iv * t1, var2 = e2.iv * e2.iv * t2;
        const var30 = var1 + (var2 - var1) * ((t30 - t1) / (t2 - t1));
        return Math.sqrt(Math.max(0, var30) / t30);
    } else if (e1) return e1.iv;
    else if (e2) return e2.iv;

    return 0;
}
