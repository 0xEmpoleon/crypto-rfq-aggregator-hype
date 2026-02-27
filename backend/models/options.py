from pydantic import BaseModel
from typing import Optional

class UnifiedOptionQuote(BaseModel):
    source_exchange: str # 'Deribit' or 'Derive'
    underlying_asset: str  # BTC, ETH, SOL
    strike_price: float
    option_type: str # C or P
    expiration_timestamp: str  # e.g., '29DEC26'
    
    bid_price: Optional[float] = None
    ask_price: Optional[float] = None
    bid_iv: Optional[float] = None
    ask_iv: Optional[float] = None
    
    greeks: Optional[dict] = None
    timestamp: int

class TradeSuggestion(BaseModel):
    id: str
    instrument: str
    type: str  # e.g., 'Arbitrage', 'Volatility Skew'
    action: str
    spread: float
    profit_estimate: float
    gamma_impact: Optional[float] = None
    reasoning: Optional[str] = None
    pro_insight_url: Optional[str] = None
    timestamp: int
