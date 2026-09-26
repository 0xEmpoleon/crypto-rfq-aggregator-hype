import { forwardToDerive } from '../_upstream';
import { discoverOptionMarkets } from '../../../../utils/markets';

// Cache successful results at the edge; keep upstream failures uncached.
export const dynamic = 'force-dynamic';

export async function GET() {
    return forwardToDerive('/public/get_all_live_instruments', {}, discoverOptionMarkets);
}
