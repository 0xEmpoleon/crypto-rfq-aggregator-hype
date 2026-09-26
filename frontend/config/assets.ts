/** Last verified listings, used only while live discovery is unavailable.
 * The API's live option universe is authoritative after discovery succeeds.
 * New symbols require no code change or placeholder price. */
export const ASSETS = ['BTC', 'ETH', 'SOL', 'HYPE', 'XRP', 'ADA', 'ZEC', 'XAUT', 'CC', 'VVV', 'LIT', 'PUMP'];
export type AssetSymbol = string;

export interface AssetConfig {
    symbol: string;
    /** ±40% of the live reference price, independent of an asset's unit price. */
    strikeRange: number;
    priceDecimals: number;
    deribitArb: boolean;
}

export function getAssetConfig(asset: AssetSymbol, reference = 0): AssetConfig {
    const validReference = Number.isFinite(reference) && reference > 0 ? reference : 0;
    return {
        symbol: asset === 'BTC' ? '₿' : asset === 'ETH' ? 'Ξ' : asset,
        strikeRange: validReference * 0.4,
        priceDecimals: validReference > 0 ? Math.min(10, Math.max(2, 4 - Math.floor(Math.log10(validReference)))) : 2,
        deribitArb: asset === 'BTC' || asset === 'ETH',
    };
}
