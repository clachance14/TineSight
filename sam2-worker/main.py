"""FastAPI application for SAM2 GPU worker."""
import time
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl
import httpx

from health import router as health_router, health_manager
from inference import yolo_model


class Thresholds(BaseModel):
    deer: float = 0.3
    antlers: float = 0.3


class AnalyzeImageRequest(BaseModel):
    imageUrl: HttpUrl
    thresholds: Optional[Thresholds] = Thresholds()
    maxInstances: int = 20


class ModelInfo(BaseModel):
    name: str
    revision: str


class Detection(BaseModel):
    deer_box_xyxy: list[float]
    deer_score: float
    antler_box_xyxy: Optional[list[float]] = None
    antler_score: Optional[float] = None


class AnalyzeImageResponse(BaseModel):
    deer_present: bool
    detections: list[Detection]
    model: ModelInfo
    processing_time_ms: int


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown."""
    # Startup: Load model
    try:
        await yolo_model.load_model()
    except Exception as e:
        print(f"Failed to load model during startup: {e}")
        # Continue running to allow health checks

    yield

    # Shutdown: Clean up if needed
    pass


# Create FastAPI app
app = FastAPI(
    title="SAM2 GPU Worker",
    description="GPU worker for SAM2 deer and antler detection",
    version="1.0.0",
    lifespan=lifespan
)

# Include health router
app.include_router(health_router)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "SAM2 GPU Worker",
        "version": "1.0.0",
        "status": health_manager.status.value
    }


@app.post("/v1/analyze-image", response_model=AnalyzeImageResponse)
async def analyze_image(request: AnalyzeImageRequest):
    """
    Analyze an image for deer and antler detections.

    Args:
        request: Analysis request with image URL and parameters

    Returns:
        Detection results with deer and antler bounding boxes

    Raises:
        HTTPException: If model not ready or processing fails
    """
    # Check model is ready
    if not health_manager.model_loaded:
        raise HTTPException(
            status_code=503,
            detail=f"Model not ready. Status: {health_manager.status.value}"
        )

    start_time = time.time()

    try:
        # Fetch image from URL
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(str(request.imageUrl))
            response.raise_for_status()
            image_bytes = response.content
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to fetch image: {str(e)}"
        )

    try:
        # Run inference
        result = await yolo_model.analyze_image(
            image_bytes=image_bytes,
            deer_threshold=request.thresholds.deer,
            antler_threshold=request.thresholds.antlers,
            max_instances=request.maxInstances
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Inference failed: {str(e)}"
        )

    # Calculate processing time
    processing_time_ms = int((time.time() - start_time) * 1000)

    # Build response
    detections = [Detection(**d) for d in result["detections"]]

    return AnalyzeImageResponse(
        deer_present=len(detections) > 0,
        detections=detections,
        model=ModelInfo(
            name=yolo_model.model_name,
            revision=yolo_model.model_revision
        ),
        processing_time_ms=processing_time_ms
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
