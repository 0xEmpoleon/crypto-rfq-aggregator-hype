import asyncio
import json
import logging
import websockets
from websockets.exceptions import ConnectionClosed
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
        while self.running:
            try:
                async with websockets.connect(self.WS_URL) as websocket:
                    logger.info("Connected to Deribit WebSocket")
                    await self.broadcast(json.dumps({"type": "status", "venue": "Deribit", "status": "Connected"}))
                    
                    # 1. Fetch active BTC 100k options from Deribit
                    import httpx
                    async with httpx.AsyncClient() as client:
                        resp = await client.get("https://www.deribit.com/api/v2/public/get_instruments?currency=BTC&kind=option&expired=false")
                        data = resp.json()
                        deribit_instruments = [
                            item["instrument_name"] for item in data.get("result", [])
                            if "-100000-" in item["instrument_name"]
                        ][:20]
                        
                    channels = [f"ticker.{inst}.100ms" for inst in deribit_instruments]
                    
                    msg = {
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "public/subscribe",
                        "params": {
                            "channels": channels
                        }
                    }
                    await websocket.send(json.dumps(msg))

                    while self.running:
                        response = await websocket.recv()
                        data = json.loads(response)
                        
                        if "params" in data and "data" in data["params"]:
                            quote = self._parse_ticker(data["params"]["data"])
                            if quote:
                                await self.broadcast(quote.model_dump_json())

            except ConnectionClosed:
                logger.warning("Deribit WS closed, reconnecting in 5s...")
                await self.broadcast(json.dumps({"type": "status", "venue": "Deribit", "status": "Reconnecting..."}))
                await asyncio.sleep(5)
            except Exception as e:
                logger.error(f"Deribit client error: {e}")
                await self.broadcast(json.dumps({"type": "status", "venue": "Deribit", "status": "Error"}))
                await asyncio.sleep(5)

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
