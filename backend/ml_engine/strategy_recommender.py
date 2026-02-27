import logging
import asyncio
import pandas as pd
import numpy as np
try:
    import xgboost as xgb
except Exception:
    xgb = None
    logger = logging.getLogger(__name__)
    logger.warning("XGBoost not available via libomp. Using mock strategy selector.")
import json
from datetime import datetime
import time

logger = logging.getLogger(__name__)

class StrategyRecommenderEngine:
    def __init__(self, db_manager, broadcast_callback):
        self.db = db_manager
        self.broadcast = broadcast_callback
        self.running = False
        self.model = xgb.XGBRegressor(objective='reg:squarederror', n_estimators=50, max_depth=3) if xgb else None
        
    async def run(self):
        self.running = True
        logger.info("Started Option Strategy Recommender Engine (Deribit).")
        
        while self.running:
            try:
                await asyncio.sleep(15)
                if not self.db.pg_pool:
                    continue
                    
                # 1. Fetch historical Deribit data
                query = """
                    SELECT * FROM option_ticks 
                    WHERE time >= NOW() - INTERVAL '4 hours'
                    AND source_exchange = 'Deribit'
                    ORDER BY time ASC
                """
                async with self.db.pg_pool.acquire() as conn:
                    rows = await conn.fetch(query)
                    
                if len(rows) < 50:
                    continue
                
                df = pd.DataFrame([dict(r) for r in rows])
                
                # Group by underlying and expiration to analyze the chain
                latest_ticks = df.groupby(['underlying_asset', 'expiration_timestamp']).last().reset_index()
                
                for _, row in latest_ticks.iterrows():
                    underlying = row['underlying_asset']
                    exp = row['expiration_timestamp']
                    current_iv = row['ask_iv']
                    spot_approx = row['strike_price'] # Mocking spot price as the last traded strike for boilerplate
                    
                    # 2. Strategy Selection Logic (Simplified)
                    # In a real engine, we'd calculate IV Percentile (IVRank) over the 4-hour window.
                    historical_iv_mean = df[(df['underlying_asset'] == underlying) & (df['expiration_timestamp'] == exp)]['ask_iv'].mean()
                    
                    iv_diff = current_iv - historical_iv_mean
                    
                    strategy_name = ""
                    action = ""
                    reasoning = ""
                    
                    if iv_diff > 5.0:
                        # IV is unusually high, expect crush
                        strategy_name = "Iron Condor / Short Strangle"
                        action = "Sell Premium"
                        reasoning = f"IV is {current_iv:.1f}%, which is {iv_diff:.1f}% above the 4h mean. Expecting volatility crush."
                    elif iv_diff < -5.0:
                        # IV is unusually low, expect expansion
                        strategy_name = "Long Straddle / Strangle"
                        action = "Buy Premium"
                        reasoning = f"IV is {current_iv:.1f}%, which is {abs(iv_diff):.1f}% below the 4h mean. Expecting volatility expansion."
                    else:
                        continue # No strong signal
                    
                    # 3. Broadcast Alert
                    alert = {
                        "type": "suggestion",
                        "data": {
                            "id": f"strategy-{int(time.time())}",
                            "instrument": f"{underlying}-{exp}",
                            "type": strategy_name,
                            "action": action,
                            "spread": round(iv_diff, 2), # Repurposing standard schema field
                            "profit_estimate": round(abs(iv_diff) * 10, 2), 
                            "timestamp": int(time.time() * 1000),
                            "reasoning": reasoning
                        }
                    }
                    await self.broadcast(json.dumps(alert))
                    logger.info(f"Fired Strategy Alert for {underlying}-{exp}: {strategy_name}")
                    
            except Exception as e:
                logger.error(f"Strategy Engine Error: {e}")
                
    def stop(self):
        self.running = False
