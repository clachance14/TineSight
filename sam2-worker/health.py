"""Health check endpoints and status management."""
import time
from enum import Enum
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel


class HealthStatus(str, Enum):
    COLD = "cold"
    WARMING = "warming"
    READY = "ready"
    ERROR = "error"


class HealthResponse(BaseModel):
    status: HealthStatus
    model_loaded: bool
    model_name: Optional[str] = None
    uptime_seconds: int
    progress_percent: Optional[int] = None
    error_message: Optional[str] = None


class HealthManager:
    """Global health state manager."""

    def __init__(self):
        self.status = HealthStatus.COLD
        self.model_loaded = False
        self.model_name: Optional[str] = None
        self.start_time = time.time()
        self.progress_percent: Optional[int] = None
        self.error_message: Optional[str] = None
        self._ws_connections: list[WebSocket] = []

    def get_uptime(self) -> int:
        """Get uptime in seconds."""
        return int(time.time() - self.start_time)

    def set_status(self, status: HealthStatus, progress: Optional[int] = None, error: Optional[str] = None):
        """Update health status and broadcast to WebSocket clients."""
        self.status = status
        self.progress_percent = progress
        self.error_message = error

        # Broadcast to all connected WebSocket clients
        if self._ws_connections:
            import asyncio
            response = self.get_health_response()
            for ws in self._ws_connections[:]:  # Copy list to avoid modification during iteration
                try:
                    asyncio.create_task(ws.send_json(response.model_dump()))
                except Exception:
                    # Remove dead connections
                    if ws in self._ws_connections:
                        self._ws_connections.remove(ws)

    def set_model_loaded(self, model_name: str):
        """Mark model as loaded."""
        self.model_loaded = True
        self.model_name = model_name
        self.set_status(HealthStatus.READY)

    def set_error(self, error_message: str):
        """Set error state."""
        self.set_status(HealthStatus.ERROR, error=error_message)

    def get_health_response(self) -> HealthResponse:
        """Get current health response."""
        return HealthResponse(
            status=self.status,
            model_loaded=self.model_loaded,
            model_name=self.model_name,
            uptime_seconds=self.get_uptime(),
            progress_percent=self.progress_percent,
            error_message=self.error_message
        )

    def add_ws_connection(self, ws: WebSocket):
        """Add WebSocket connection for status updates."""
        self._ws_connections.append(ws)

    def remove_ws_connection(self, ws: WebSocket):
        """Remove WebSocket connection."""
        if ws in self._ws_connections:
            self._ws_connections.remove(ws)


# Global health manager instance
health_manager = HealthManager()

# Router for health endpoints
router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Get current health status."""
    return health_manager.get_health_response()


@router.websocket("/ws/status")
async def websocket_status(websocket: WebSocket):
    """WebSocket endpoint for real-time status updates."""
    await websocket.accept()
    health_manager.add_ws_connection(websocket)

    try:
        # Send initial status
        await websocket.send_json(health_manager.get_health_response().model_dump())

        # Keep connection alive and wait for client disconnect
        while True:
            # Wait for any message from client (ping/pong)
            await websocket.receive_text()
    except WebSocketDisconnect:
        health_manager.remove_ws_connection(websocket)
    except Exception:
        health_manager.remove_ws_connection(websocket)
