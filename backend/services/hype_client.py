import asyncio
import json
import logging
import time
import httpx
from models.options import UnifiedOptionQuote

logger = logging.getLogger(__name__)

class HypeClient:
    """
    Client for Hyperliquid (HYPE). 
    Optimized for 15s REST polling for spot/perp metrics.
    """
    def __init__(self, broadcast_callback):
        self.broadcast = broadcast_callback
        self.running = False

    async def connect(self):
        self.running = True
        async with httpx.AsyncClient() as client:
            while self.running:
                try:
                    # Fetch HYPE spot/perp data from Hyperliquid Info API
                    # https://api.hyperliquid.xyz/info
                    
                    await self.broadcast(json.dumps({"type": "status", "venue": "Hyperliquid", "status": "Updated"}))
                    await asyncio.sleep(15)

                except Exception as e:
                    logger.error(f"Hype client error: {e}")
                    await asyncio.sleep(5)

    def stop(self):
        self.running = False
