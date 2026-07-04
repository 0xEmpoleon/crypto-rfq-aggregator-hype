/** Poll cadence for Derive/Deribit market data (ms). */
export const POLL_INTERVAL_MS = 15000;

/** Legs with fewer days to expiry than this are excluded from strategies. */
export const MIN_DTE_DAYS = 7;

/** Net-APR band considered tradeable; outside it is noise or a data glitch. */
export const APR_MIN_PCT = 5;
export const APR_MAX_PCT = 300;

/** A ladder is highlighted in the matrix only above this score, and only
 *  when it was ranked against at least one alternative. */
export const RECOMMEND_MIN_SCORE = 5.0;

/** How many top-APR trades feed the ladder search. */
export const TRADE_POOL_MIN = 15;
