import logging
import json
import asyncio
from models.options import UnifiedOptionQuote
import time

try:
    import redis.asyncio as redis
except ImportError:
    redis = None

try:
    import asyncpg
except ImportError:
    asyncpg = None

logger = logging.getLogger(__name__)

class DBManager:
    def __init__(self):
        self.redis_client = None
        self.pg_pool = None
        self.write_buffer = []
        self.batch_size = 100
        self.flush_interval = 5.0 # seconds
        self._flush_task = None
        self.running = False

    async def connect(self):
        if redis:
            try:
                self.redis_client = await redis.from_url("redis://localhost:6379", decode_responses=True)
                logger.info("Connected to Redis successfully.")
            except Exception as e:
                logger.error(f"Failed connecting to Redis: {e}")

        if asyncpg:
            try:
                self.pg_pool = await asyncpg.create_pool(
                    user='postgres', password='postgres', database='rfq_db', host='localhost', port=5432
                )
                logger.info("Connected to TimescaleDB successfully.")
                
                async with self.pg_pool.acquire() as conn:
                    await conn.execute("""
                        CREATE TABLE IF NOT EXISTS option_ticks (
                            time TIMESTAMPTZ NOT NULL,
                            source_exchange TEXT,
                            underlying_asset TEXT,
                            strike_price DOUBLE PRECISION,
                            option_type TEXT,
                            expiration_timestamp TEXT,
                            bid_price DOUBLE PRECISION,
                            ask_price DOUBLE PRECISION,
                            bid_iv DOUBLE PRECISION,
                            ask_iv DOUBLE PRECISION
                        );
                    """)
                    try:
                        await conn.execute("SELECT create_hypertable('option_ticks', 'time', if_not_exists => TRUE);")
                    except Exception: pass
                
                self.running = True
                self._flush_task = asyncio.create_task(self._periodic_flush())
            except Exception as e:
                logger.error(f"Failed connecting to TimescaleDB: {e}")

    async def disconnect(self):
        self.running = False
        if self._flush_task:
            self._flush_task.cancel()
        await self._flush_buffer()
        if self.redis_client: await self.redis_client.close()
        if self.pg_pool: await self.pg_pool.close()

    async def insert_quote(self, quote: UnifiedOptionQuote):
        # 1. Redis is still real-time for dashboard speed
        if self.redis_client:
            key = f"latest_quote:{quote.underlying_asset}:{quote.source_exchange}"
            try: await self.redis_client.set(key, quote.model_dump_json())
            except Exception: pass
                
        # 2. Add to buffer for batch writing to TimescaleDB
        self.write_buffer.append(quote)
        if len(self.write_buffer) >= self.batch_size:
            await self._flush_buffer()

    async def _periodic_flush(self):
        while self.running:
            await asyncio.sleep(self.flush_interval)
            await self._flush_buffer()

    async def _flush_buffer(self):
        if not self.write_buffer or not self.pg_pool:
            return
        
        batch = self.write_buffer[:]
        self.write_buffer = []
        
        try:
            async with self.pg_pool.acquire() as conn:
                # Use executemany for high-performance batch insert
                data = [
                    (
                        item.source_exchange, item.underlying_asset, float(item.strike_price),
                        item.option_type, item.expiration_timestamp, item.bid_price,
                        item.ask_price, item.bid_iv, item.ask_iv
                    ) for item in batch
                ]
                await conn.executemany("""
                    INSERT INTO option_ticks (time, source_exchange, underlying_asset, strike_price, option_type, expiration_timestamp, bid_price, ask_price, bid_iv, ask_iv)
                    VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
                """, data)
                logger.info(f"Batched {len(batch)} quotes to TimescaleDB")
        except Exception as e:
            logger.error(f"Batch insert failed: {e}")
