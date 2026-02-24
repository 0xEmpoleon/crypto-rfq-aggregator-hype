import logging
import json
from models.options import UnifiedOptionQuote

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

    async def connect(self):
        if redis:
            try:
                self.redis_client = await redis.from_url("redis://localhost:6379", decode_responses=True)
                logger.info("Connected to Redis successfully.")
            except Exception as e:
                logger.error(f"Failed connecting to Redis (is docker-compose running?): {e}")

        if asyncpg:
            try:
                self.pg_pool = await asyncpg.create_pool(
                    user='postgres',
                    password='postgres',
                    database='rfq_db',
                    host='localhost',
                    port=5432
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
                    except Exception:
                        pass
            except Exception as e:
                logger.error(f"Failed connecting to TimescaleDB (is docker-compose running?): {e}")

    async def disconnect(self):
        if self.redis_client:
            await self.redis_client.close()
        if self.pg_pool:
            await self.pg_pool.close()

    async def insert_quote(self, quote: UnifiedOptionQuote):
        instrument_key = f"{quote.underlying_asset}-{quote.expiration_timestamp}-{int(quote.strike_price)}-{quote.option_type}"
        
        # 1. Redis Cache 
        if self.redis_client:
            cache_key = f"latest_quote:{instrument_key}:{quote.source_exchange}"
            try:
                await self.redis_client.set(cache_key, quote.model_dump_json())
            except Exception:
                pass
                
        # 2. TimescaleDB TS Data
        if self.pg_pool:
            try:
                async with self.pg_pool.acquire() as conn:
                    await conn.execute("""
                        INSERT INTO option_ticks (time, source_exchange, underlying_asset, strike_price, option_type, expiration_timestamp, bid_price, ask_price, bid_iv, ask_iv)
                        VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
                    """, quote.source_exchange, quote.underlying_asset, float(quote.strike_price), quote.option_type, quote.expiration_timestamp, quote.bid_price, quote.ask_price, quote.bid_iv, quote.ask_iv)
            except Exception:
                pass
