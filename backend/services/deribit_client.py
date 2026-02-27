import asyncio
import json
import logging
import time
from models.options import UnifiedOptionQuote

logger = logging.getLogger(__name__)

class DeribitClient:
    WS_URL = "wss://www.deribit.com/ws/api/v2"

    def __init__(self, broadcast_callback):
        self.broadcast = broadcast_callback
        self.running = False
        self.assets = ["BTC", "ETH", "SOL"]

    async def connect(self):
        self.running = True
        import httpx
        async with httpx.AsyncClient() as client:
            while self.running:
                try:
                    # 1. Fetch active BTC options and Mark Data
                    # We pool the summary every 15s to minimize external calls
                    resp = await client.get("https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option")
                    data = resp.json()
                    
                    results = data.get("result", [])
                    # Filter for top 20 liquid instruments (highest volume/OI)
                    results.sort(key=lambda x: x.get("open_interest", 0), reverse=True)
                    top_instruments = results[:20]

                    for item in top_instruments:
                        quote = self._parse_summary_item(item)
                        if quote:
                            await self.broadcast(quote.model_dump_json())
                    
                    await self.broadcast(json.dumps({"type": "status", "venue": "Deribit", "status": "Updated"}))
                    # Requirement: 15 second interval
                    await asyncio.sleep(15)

                except Exception as e:
                    logger.error(f"Deribit REST Polling error: {e}")
                    await self.broadcast(json.dumps({"type": "status", "venue": "Deribit", "status": "Error"}))
                    await asyncio.sleep(5)

    def _parse_summary_item(self, item: dict) -> UnifiedOptionQuote:
        instrument = item.get("instrument_name", "")
        parts = instrument.split("-")
        if len(parts) != 4: return None
        
        return UnifiedOptionQuote(
            source_exchange="Deribit",
            underlying_asset=parts[0],
            strike_price=float(parts[2]),
            option_type=parts[3],
            expiration_timestamp=parts[1],
            bid_price=item.get("bid"),
            ask_price=item.get("ask"),
            bid_iv=item.get("bid_iv"),
            ask_iv=item.get("ask_iv"),
            greeks={}, # Summary has limited greeks, usually fine for RFQ
            timestamp=int(time.time() * 1000)
        )

    def _parse_ticker(self, data: dict) -> UnifiedOptionQuote:
        instrument = data.get("instrument_name", "")
        # Very basic parse example "BTC-29DEC26-100000-C"
        parts = instrument.split("-")
        if len(parts) != 4:
            return None
        
        base_asset = parts[0]
        expiration = parts[1]
        strike = float(parts[2])
        opt_type = parts[3]
        
        return UnifiedOptionQuote(
            source_exchange="Deribit",
            underlying_asset=base_asset,
            strike_price=strike,
            option_type=opt_type,
            expiration_timestamp=expiration,
            bid_price=data.get("best_bid_price"),
            ask_price=data.get("best_ask_price"),
            bid_iv=data.get("bid_iv"),
            ask_iv=data.get("ask_iv"),
            greeks=data.get("greeks", {}),
            timestamp=data.get("timestamp") or 0
        )

    def stop(self):
        self.running = False
