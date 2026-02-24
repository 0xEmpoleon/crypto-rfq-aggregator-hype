import urllib.request, json, math

def norm_cdf(x):
    return (1.0 + math.erf(x / math.sqrt(2.0))) / 2.0

def bs_put_inverse(S, K, T, sigma):
    # Deribit inverse put premium in BTC
    r_usd = 0.0 # for inverse, quote currency is USD, but margined in BTC
    d1 = (math.log(S/K) + 0.5*sigma**2*T) / (sigma*math.sqrt(T))
    d2 = d1 - sigma*math.sqrt(T)
    P_usd = K * norm_cdf(-d2) - S * norm_cdf(-d1)
    return P_usd / S

def bs_put_linear(S, K, T, sigma, r):
    d1 = (math.log(S/K) + (r + 0.5*sigma**2)*T) / (sigma*math.sqrt(T))
    d2 = d1 - sigma*math.sqrt(T)
    P_usd = K * math.exp(-r*T) * norm_cdf(-d2) - S * norm_cdf(-d1)
    return P_usd

req = urllib.request.urlopen('https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option')
res = json.loads(req.read())['result']
puts = [x for x in res if x['instrument_name'].endswith('-P')]
opts = sorted(puts, key=lambda x: x['volume'], reverse=True)[:3]

now = json.loads(urllib.request.urlopen('https://www.deribit.com/api/v2/public/get_time').read())['result'] / 1000

M={'JAN':1,'FEB':2,'MAR':3,'APR':4,'MAY':5,'JUN':6,'JUL':7,'AUG':8,'SEP':9,'OCT':10,'NOV':11,'DEC':12}
from datetime import datetime

for o in opts:
    S = o['underlying_price']
    iv = o['mark_iv'] / 100
    p_btc_mark = o['mark_price']
    
    parts = o['instrument_name'].split('-')
    exp_dt = datetime(2000+int(parts[1][5:]), M[parts[1][2:5]], int(parts[1][:2]), 8, 0, 0)
    now_dt = datetime.utcnow()
    T = (exp_dt - now_dt).total_seconds() / 86400 / 365
    if T <= 0: continue
    K = float(parts[2])
    
    p_btc_bs = bs_put_inverse(S, K, T, iv)
    print(f"Option: {o['instrument_name']}")
    print(f"  Strike: {K}, Spot: {S:.1f}, IV: {iv*100:.1f}%, T: {T:.4f}y")
    print(f"  Deribit Mark (BTC): {p_btc_mark:.5f}")
    print(f"  BS Inverse r=0    : {p_btc_bs:.5f} (Diff: {abs(p_btc_mark - p_btc_bs):.5f})")
    print(f"  => Deribit inherently prices using r=0 for the underlying inverse contract.")
    
    # Linear USD value comparisons
    p_usd_mark = p_btc_mark * S
    p_usd_bs_r0 = bs_put_linear(S, K, T, iv, 0.0)
    p_usd_bs_r3_6 = bs_put_linear(S, K, T, iv, 0.0366)
    print(f"  USD Equivalent (Mark): ${p_usd_mark:.2f}")
    print(f"  Linear BS (r=0%)     : ${p_usd_bs_r0:.2f}")
    print(f"  Linear BS (r=3.66%)  : ${p_usd_bs_r3_6:.2f}")
    print(f"  Adding SOFR explicitly shifts the USD theoretical price from Deribit's inverse structure.")
    print("-" * 50)
