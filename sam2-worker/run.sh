#!/bin/bash
# Development runner for SAM3 worker

# Load environment variables if .env file exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Set defaults
export HF_HOME=${HF_HOME:-./cache}
export PYTHONUNBUFFERED=1

# Create cache directory
mkdir -p "$HF_HOME"

echo "Starting SAM3 GPU Worker..."
echo "HF_HOME: $HF_HOME"
echo "Python: $(python3 --version)"
echo ""

# Run server
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
