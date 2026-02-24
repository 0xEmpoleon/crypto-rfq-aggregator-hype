import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json

from contextlib import asynccontextmanager
from services.deribit_client import DeribitClient
from engine.analyzer import SpreadAnalyzer
from services.db_manager import DBManager

from ml_engine.strategy_recommender import StrategyRecommenderEngine

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()
db_manager = DBManager()
analyzer = SpreadAnalyzer(manager.broadcast, db_manager)
deribit = DeribitClient(analyzer.process_quote)
ml_engine = StrategyRecommenderEngine(db_manager, manager.broadcast)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Connect DBs
    await db_manager.connect()
    # Start tasks
    task1 = asyncio.create_task(deribit.connect())
    task3 = asyncio.create_task(ml_engine.run())
    yield
    # Stop tasks
    deribit.stop()
    ml_engine.stop()
    task1.cancel()
    task3.cancel()
    await db_manager.disconnect()

app = FastAPI(title="Crypto Deribit Option Strategist", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Crypto RFQ API is running"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Push initial connection states immediately to the newly joined client
        if deribit.running:
            await websocket.send_text(json.dumps({"type": "status", "venue": "Deribit", "status": "Connected"}))
        if derive.running:
            await websocket.send_text(json.dumps({"type": "status", "venue": "Derive", "status": "Connected"}))
            
        while True:
            # We just send data out, ignore incoming for now
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
