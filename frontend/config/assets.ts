/* ═══════════════════════════════════════════════════════════════════
   Asset Registry — single source of truth for tradable underlyings.

   Every asset here has a live option market on Derive (api.lyra.finance).
   To add a new coin: confirm it returns option instruments from
   `get_instruments` and a mark price from `<COIN>-PERP`, then add one
   row below. Nothing else in the app needs to change.
   ═══════════════════════════════════════════════════════════════════ */

export interface AssetConfig {
    /** Suffix shown after a premium quoted in coin units, e.g. "0.0123 ₿". */
    symbol: string;
    /** ± strike window (USD) around spot rendered in the yield matrix. */
    strikeRange: number;
    /** Decimal places for USD premium display (scales with unit price). */
    priceDecimals: number;
    /** Overlay Deribit cross-venue arb prices. Only valid for inverse
     *  (coin-settled) venues, where mark_price is in coin units. */
    deribitArb: boolean;
    /** Spot used for the first render frame before the live PERP loads. */
    fallbackSpot: number;
}

/** Ordered list rendered in the asset switcher. */
export const ASSETS = ['BTC', 'ETH', 'SOL', 'HYPE', 'XRP', 'ADA', 'ZEC', 'XAUT', 'CC'] as const;

export type AssetSymbol = typeof ASSETS[number];

export const ASSET_CONFIG: Record<AssetSymbol, AssetConfig> = {
    BTC:  { symbol: '₿',    strikeRange: 20000, priceDecimals: 0, deribitArb: true,  fallbackSpot: 60000 },
    ETH:  { symbol: 'Ξ',    strikeRange: 800,   priceDecimals: 0, deribitArb: true,  fallbackSpot: 1700 },
    SOL:  { symbol: 'SOL',  strikeRange: 50,    priceDecimals: 2, deribitArb: false, fallbackSpot: 80 },
    HYPE: { symbol: 'HYPE', strikeRange: 20,    priceDecimals: 2, deribitArb: false, fallbackSpot: 70 },
    // ── added coins (all live on Derive) ─────────────────────────────
    XRP:  { symbol: 'XRP',  strikeRange: 0.5,   priceDecimals: 3, deribitArb: false, fallbackSpot: 1.1 },
    ADA:  { symbol: 'ADA',  strikeRange: 0.08,  priceDecimals: 3, deribitArb: false, fallbackSpot: 0.17 },
    ZEC:  { symbol: 'ZEC',  strikeRange: 200,   priceDecimals: 0, deribitArb: false, fallbackSpot: 450 },
    XAUT: { symbol: 'XAUT', strikeRange: 1000,  priceDecimals: 0, deribitArb: false, fallbackSpot: 4100 },
    CC:   { symbol: 'CC',   strikeRange: 0.06,  priceDecimals: 4, deribitArb: false, fallbackSpot: 0.14 },
};
