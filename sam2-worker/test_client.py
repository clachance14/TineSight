#!/usr/bin/env python3
"""Simple test client for SAM2 worker."""
import asyncio
import json
import httpx
import websockets


async def test_health():
    """Test health endpoint."""
    async with httpx.AsyncClient() as client:
        response = await client.get("http://localhost:8000/health")
        print("Health Check:")
        print(json.dumps(response.json(), indent=2))
        print()


async def test_websocket():
    """Test WebSocket status updates."""
    print("WebSocket Status Stream:")
    try:
        async with websockets.connect("ws://localhost:8000/ws/status") as websocket:
            # Receive initial status
            message = await websocket.recv()
            print(json.dumps(json.loads(message), indent=2))
            print()

            # Send ping to keep alive
            await websocket.send("ping")

            # Receive one more update (if any)
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                print("Status Update:")
                print(json.dumps(json.loads(message), indent=2))
                print()
            except asyncio.TimeoutError:
                print("No additional updates (timeout)")
                print()
    except Exception as e:
        print(f"WebSocket error: {e}")
        print()


async def test_analyze(image_url: str):
    """Test analyze image endpoint."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        request = {
            "imageUrl": image_url,
            "thresholds": {
                "deer": 0.3,
                "antlers": 0.3
            },
            "maxInstances": 20
        }

        print(f"Analyzing image: {image_url}")
        try:
            response = await client.post(
                "http://localhost:8000/v1/analyze-image",
                json=request
            )

            if response.status_code == 200:
                print("Analysis Result:")
                print(json.dumps(response.json(), indent=2))
            else:
                print(f"Error {response.status_code}:")
                print(response.text)
        except Exception as e:
            print(f"Request failed: {e}")
        print()


async def main():
    """Run all tests."""
    print("=" * 60)
    print("SAM2 Worker Test Client")
    print("=" * 60)
    print()

    # Test health
    await test_health()

    # Test WebSocket
    await test_websocket()

    # Test analyze (example URL - replace with real image)
    example_url = "https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/2010-kodiak-bear-1.jpg/1200px-2010-kodiak-bear-1.jpg"
    await test_analyze(example_url)


if __name__ == "__main__":
    asyncio.run(main())
