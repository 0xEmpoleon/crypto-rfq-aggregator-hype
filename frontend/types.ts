import type { Greeks } from './utils/optionsMath';

/** One live option row parsed from Derive's ticker feed. */
export interface ParsedOption {
    instrument: string;
    strike: number;
    expiry: string;    // display label, e.g. '4JUL26' (matches Deribit segments)
    expiryTs: number;
    type: 'C' | 'P';
    markPrice: number;
    bidPrice: number;
    askPrice: number;
    markIv: number;    // %
    futuresPrice: number;
    dte: number;       // whole days for display (ceil)
    tYears: number;    // exact time to expiry in years
    greeks: Greeks;
    probExercise: number;
    tailLoss: number;
}

/** Everything a matrix cell needs to render and explain itself. */
export interface CellData {
    instrument: string;   // Derive instrument name, e.g. "BTC-20260704-63000-C"
    apr: number;          // net of estimated fees
    markIv: number;
    markPrice: number;
    bidPrice: number;
    futuresPrice: number;
    dte: number;
    premiumUsd: number;   // gross premium at the selected price source
    feeUsd: number;
    probExercise: number;
    greeks: Greeks;
}

export interface TooltipData extends CellData {
    type: 'Put' | 'Call';
    strike: number;
    exp: string;
}

export interface HoverTip { d: TooltipData; x: number; y: number }
export interface MetaTip { title: string; text: string; x: number; y: number }

export type Status = 'ok' | 'err' | 'load';
export interface FeedStatus { spot: Status; opt: Status; dvol: Status }

export interface ExpiryCol { label: string; ts: number; dte: number; fp: number }

export interface DeribitMaps {
    mark: Record<string, number>;
    bid: Record<string, number>;
    ask: Record<string, number>;
}

/* ── Upstream API shapes (the fields this app actually reads) ── */

export interface DeriveTickerEntry {
    M: number | string;              // mark price
    b?: number | string;             // best bid
    best_bid?: number | string;
    a?: number | string;             // best ask
    best_ask?: number | string;
    I?: number | string;             // index price (fallback underlying)
    option_pricing?: { f?: number | string; i?: number | string };
}

export interface DeriveTickersResponse {
    result?: { tickers?: Record<string, DeriveTickerEntry> };
}

export interface DeriveInstrumentsResponse {
    result?: { instrument_name: string }[];
}

export interface DerivePerpTickerResponse {
    result?: { mark_price?: number | string };
}

export interface DeribitBookSummary {
    instrument_name: string;
    mark_price: number;
    bid_price: number | null;
    ask_price: number | null;
    underlying_price?: number;
}

export interface DeribitBookResponse {
    result?: DeribitBookSummary[];
}
