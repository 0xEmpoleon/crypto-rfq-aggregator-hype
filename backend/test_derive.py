import asyncio
from services.derive_client import DeriveClient

async def mock_bc(msg):
    print("RECV:", msg)

client = DeriveClient(mock_bc)
asyncio.run(client.connect())
