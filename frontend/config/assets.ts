/** Last verified listings, used only while live discovery is unavailable.
 * The API's live option universe is authoritative after discovery succeeds.
 * New symbols require no code change or placeholder price. */
export const ASSETS = ['BTC', 'ETH', 'SOL', 'HYPE', 'XRP', 'ADA', 'ZEC', 'XAUT', 'CC', 'VVV', 'LIT', 'PUMP'];
export type AssetSymbol = string;

/** Deribit cross-venue fair value — the independent reference that lets EV
 *  be scored. 'inverse' = coin-settled book (currency=BTC/ETH, marks in coin
 *  units); 'linear' = USDC-settled book (currency=USDC, marks already in USD,
 *  instruments prefixed `<SYM>_USDC`). Verified 2026-10-19: Deribit's linear
 *  book lists SOL, HYPE, XRP (also AVAX/TRX, which Derive has no options
 *  for). Any coin not here gets yield picks only. */
export const DERIBIT_BOOK: Record<string, 'inverse' | 'linear'> = {
    BTC: 'inverse', ETH: 'inverse', SOL: 'linear', HYPE: 'linear', XRP: 'linear',
};

export interface AssetConfig {
    symbol: string;
    /** ±40% of the live reference price, independent of an asset's unit price. */
    strikeRange: number;
    priceDecimals: number;
    deribit: 'inverse' | 'linear' | null;
}

export function getAssetConfig(asset: AssetSymbol, reference = 0): AssetConfig {
    const validReference = Number.isFinite(reference) && reference > 0 ? reference : 0;
    return {
        symbol: asset === 'BTC' ? '₿' : asset === 'ETH' ? 'Ξ' : asset,
        strikeRange: validReference * 0.4,
        priceDecimals: validReference > 0 ? Math.min(10, Math.max(2, 4 - Math.floor(Math.log10(validReference)))) : 2,
        deribit: DERIBIT_BOOK[asset] ?? null,
    };
}
