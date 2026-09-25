import { forwardToDerive, badRequest, PERP_RE } from '../_upstream';

export async function GET(req: Request) {
    const name = new URL(req.url).searchParams.get('instrument_name') || '';
    if (!PERP_RE.test(name)) return badRequest('instrument_name must be a <CURRENCY>-PERP symbol');
    return forwardToDerive('/public/get_ticker', { instrument_name: name }, result => {
        // v3 returns the slim ticker (M), not the old mark_price field.
        if (!result || typeof result !== 'object' || !('M' in result)
            || (typeof result.M !== 'string' && typeof result.M !== 'number')
            || !Number.isFinite(+result.M) || +result.M <= 0) {
            throw new Error('Invalid mark price');
        }
        return { mark_price: result.M };
    });
}
