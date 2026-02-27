import pandas as pd

def process_iv_surface(summary_data):
    """
    Transforms raw Deribit book summary into an IV surface.
    """
    data = []
    for item in summary_data:
        name = item['instrument_name']
        parts = name.split('-')
        if len(parts) < 4: continue
        
        data.append({
            'Expiry': parts[1],
            'Strike': int(parts[2]),
            'Type': parts[3],
            'IV': item.get('mark_iv', 0)
        })

    df = pd.DataFrame(data)
    # Average IV for Call/Put at same strike
    surface = df.groupby(['Strike', 'Expiry'])['IV'].mean().unstack()
    return surface.sort_index()

def get_iv_percentile(current_iv, historical_series):
    if len(historical_series) < 2:
        return 50.0
    return (historical_series < current_iv).mean() * 100
