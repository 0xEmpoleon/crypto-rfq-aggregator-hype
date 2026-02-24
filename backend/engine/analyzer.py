import logging
import uuid
import time
import json
from models.options import UnifiedOptionQuote, TradeSuggestion

logger = logging.getLogger(__name__)

class SpreadAnalyzer:
    def __init__(self, broadcast_callback, db_manager=None):
        self.broadcast = broadcast_callback
        self.db_manager = db_manager
        self.quotes_cache = {}

    async def process_quote(self, raw_quote_json: str):
        try:
            data = json.loads(raw_quote_json)
            quote = UnifiedOptionQuote.model_validate(data)
        except Exception as e:
            return

        instrument = f"{quote.underlying_asset}-{quote.expiration_timestamp}-{int(quote.strike_price)}-{quote.option_type}"
        venue = quote.source_exchange

        if instrument not in self.quotes_cache:
            self.quotes_cache[instrument] = {}

        self.quotes_cache[instrument][venue] = quote
        
        if self.db_manager:
            await self.db_manager.insert_quote(quote)
            
        # Stream the quote to the frontend immediately for the orderbook
        await self.broadcast(quote.model_dump_json())
        
        # Run spread analysis
        await self._analyze(instrument)

    async def _analyze(self, instrument: str):
        quotes = self.quotes_cache.get(instrument, {})
        if "Deribit" in quotes and "Derive" in quotes:
            dbit = quotes["Deribit"]
            drve = quotes["Derive"]

            # Arbitrage Logic
            if drve.ask_price and dbit.bid_price and drve.ask_price < dbit.bid_price:
                spread = dbit.bid_price - drve.ask_price
                suggestion = TradeSuggestion(
                    id=str(uuid.uuid4()),
                    instrument=instrument,
                    type="Arbitrage",
                    action="Buy Derive / Sell Deribit",
                    spread=round((spread / drve.ask_price) * 100, 2), # percentage
                    profit_estimate=round(spread * 1000, 2),
                    timestamp=int(time.time() * 1000)
                )
                await self.broadcast(suggestion.model_dump_json())

            # IV Skew Logic
            elif dbit.bid_iv and drve.ask_iv and dbit.bid_iv - drve.ask_iv > 1.0:
                 suggestion = TradeSuggestion(
                    id=str(uuid.uuid4()),
                    instrument=instrument,
                    type="Volatility Skew",
                    action="Sell Deribit / Buy Derive",
                    spread=round(dbit.bid_iv - drve.ask_iv, 2),
                    profit_estimate=150.0,
                    timestamp=int(time.time() * 1000)
                )
                 # Wrap in standard message envelope for frontend
                 msg = {"type": "suggestion", "data": suggestion.model_dump()}
                 await self.broadcast(json.dumps(msg))
