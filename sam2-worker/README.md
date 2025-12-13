# SAM2 GPU Worker

FastAPI application for running SAM2 deer and antler detection on GPU infrastructure.

## Overview

This worker provides a REST API for analyzing trail camera images using the SAM2 (Segment Anything Model) vision model. It detects deer and antlers in images and returns bounding box coordinates with confidence scores.

## Architecture

- **FastAPI** - Web framework with async support
- **PyTorch** - Deep learning framework
- **Transformers** - HuggingFace model loading
- **WebSocket** - Real-time status streaming

## API Endpoints

### Health Check

```http
GET /health
```

Returns current worker status:

```json
{
  "status": "ready",
  "model_loaded": true,
  "model_name": "facebook/sam2-hiera-large",
  "uptime_seconds": 3600,
  "progress_percent": null,
  "error_message": null
}
```

Status values:
- `cold` - Worker started, model not loaded
- `warming` - Model loading in progress
- `ready` - Model loaded, ready for inference
- `error` - Model loading failed

### WebSocket Status

```http
WS /ws/status
```

Real-time status updates via WebSocket. Broadcasts status changes during model warmup.

### Analyze Image

```http
POST /v1/analyze-image
```

Request body:

```json
{
  "imageUrl": "https://example.com/image.jpg",
  "thresholds": {
    "deer": 0.3,
    "antlers": 0.3
  },
  "maxInstances": 20
}
```

Response:

```json
{
  "deer_present": true,
  "detections": [
    {
      "deer_box_xyxy": [100, 200, 300, 400],
      "deer_score": 0.95,
      "antler_box_xyxy": [150, 200, 250, 280],
      "antler_score": 0.87
    }
  ],
  "model": {
    "name": "facebook/sam2-hiera-large",
    "revision": "main"
  },
  "processing_time_ms": 1250
}
```

## Environment Variables

- `HF_TOKEN` - HuggingFace API token for gated model access
- `HF_HOME` - Model cache directory (default: `/data/hf`)
- `PYTHONUNBUFFERED` - Disable Python output buffering (set to `1`)

## Local Development

### Prerequisites

- Python 3.11+
- CUDA 12.1+ (for GPU support)
- 16GB+ GPU memory recommended

### Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Run server
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### Testing

```bash
# Health check
curl http://localhost:8000/health

# Analyze image
curl -X POST http://localhost:8000/v1/analyze-image \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://example.com/deer.jpg",
    "thresholds": {"deer": 0.3, "antlers": 0.3},
    "maxInstances": 20
  }'
```

## Docker Deployment

### Build Image

```bash
docker build -t sam2-worker .
```

### Run Container

```bash
docker run -d \
  --gpus all \
  -p 8000:8000 \
  -v /path/to/cache:/data/hf \
  -e HF_TOKEN=your_token_here \
  sam2-worker
```

### Vast.ai Deployment

This worker is designed to run on Vast.ai GPU instances:

1. Upload Docker image to registry
2. Create Vast.ai instance with GPU
3. Configure environment variables
4. Expose port 8000

## Implementation Notes

### Model Selection

Currently using `facebook/sam2-hiera-large` as a placeholder. The actual SAM2 model may need to be updated based on availability.

### Antler Matching

Antler boxes are matched to deer boxes using nearest-center distance matching. Each deer is paired with its closest antler detection.

### Async Processing

All I/O operations (image fetching, model loading) use async/await to prevent blocking the event loop.

### Error Handling

- 503 Service Unavailable - Model not loaded
- 400 Bad Request - Invalid image URL or fetch failed
- 500 Internal Server Error - Inference failed

## Performance

Expected performance on A100 GPU:
- Model warmup: ~60 seconds
- Inference per image: ~1-2 seconds
- Concurrent requests: Up to 4 (batch size 1)

## Monitoring

Monitor worker health via:
1. HTTP `/health` endpoint
2. WebSocket `/ws/status` for real-time updates
3. Container logs for errors

## Troubleshooting

### Model Loading Fails

Check:
- HF_TOKEN is valid
- Network access to HuggingFace
- Sufficient disk space in HF_HOME
- GPU memory available

### Slow Inference

Check:
- GPU utilization (nvidia-smi)
- Image resolution (resize large images)
- Concurrent request count

### WebSocket Disconnects

WebSocket connections require periodic ping/pong to stay alive. Client should send periodic messages.
