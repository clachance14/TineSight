"""Model loading and inference logic."""
import os
import math
import asyncio
from typing import Optional
from io import BytesIO
from PIL import Image
from ultralytics import YOLOWorld
from health import health_manager, HealthStatus


class YOLOWorldModel:
    """YOLO-World model wrapper for inference."""

    def __init__(self):
        self.model = None
        self.model_name = "yolov8m-world.pt"
        self.model_revision = "ultralytics"
        self.classes = ["deer", "antlers"]

    async def load_model(self):
        """Load the YOLO-World model."""
        try:
            health_manager.set_status(HealthStatus.WARMING, progress=0)

            health_manager.set_status(HealthStatus.WARMING, progress=25)

            # Load model in thread pool (blocking operation)
            await asyncio.to_thread(self._load_model_sync)

            health_manager.set_status(HealthStatus.WARMING, progress=75)

            # Set classes
            if self.model:
                self.model.set_classes(self.classes)

            health_manager.set_status(HealthStatus.WARMING, progress=100)
            health_manager.set_model_loaded(self.model_name)

        except Exception as e:
            error_msg = f"Failed to load model: {str(e)}"
            health_manager.set_error(error_msg)
            raise

    def _load_model_sync(self):
        """Synchronous model loading."""
        self.model = YOLOWorld(self.model_name)

    async def analyze_image(
        self,
        image_bytes: bytes,
        deer_threshold: float = 0.3,
        antler_threshold: float = 0.3,
        max_instances: int = 20
    ) -> dict:
        """
        Analyze image for deer and antlers.

        Args:
            image_bytes: Raw image bytes
            deer_threshold: Confidence threshold for deer detection
            antler_threshold: Confidence threshold for antler detection
            max_instances: Maximum number of instances to detect

        Returns:
            Detection results with deer and antler boxes
        """
        if not self.model:
            raise RuntimeError("Model not loaded")

        # Load image
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        width, height = image.size

        # Run inference in thread pool
        detections = await asyncio.to_thread(
            self._run_inference_sync,
            image,
            deer_threshold,
            antler_threshold,
            max_instances
        )

        # Match antlers to deer
        matched_detections = self._match_antlers_to_deer(detections)

        return {
            "detections": matched_detections,
            "image_dimensions": {"width": width, "height": height}
        }

    def _run_inference_sync(
        self,
        image: Image.Image,
        deer_threshold: float,
        antler_threshold: float,
        max_instances: int
    ) -> dict:
        """
        Synchronous inference execution.

        Runs YOLO-World inference with both "deer" and "antlers" classes
        and extracts boxes above threshold.
        """
        # Run inference with max_det parameter
        results = self.model.predict(
            image,
            conf=min(deer_threshold, antler_threshold),  # Use lower threshold to catch both
            max_det=max_instances * 2,  # Allow room for both deer and antlers
            verbose=False
        )

        # Extract boxes for each class
        deer_boxes = []
        antler_boxes = []

        if len(results) > 0:
            result = results[0]
            boxes = result.boxes

            if boxes is not None and len(boxes) > 0:
                # Get class names, boxes, and confidences
                class_ids = boxes.cls.cpu().numpy()
                xyxy = boxes.xyxy.cpu().numpy()
                confidences = boxes.conf.cpu().numpy()

                for class_id, box, conf in zip(class_ids, xyxy, confidences):
                    class_name = self.model.names[int(class_id)]

                    if class_name == "deer" and conf >= deer_threshold:
                        deer_boxes.append({
                            "box": box.tolist(),
                            "score": float(conf)
                        })
                    elif class_name == "antlers" and conf >= antler_threshold:
                        antler_boxes.append({
                            "box": box.tolist(),
                            "score": float(conf)
                        })

        # Limit to max_instances
        deer_boxes = deer_boxes[:max_instances]
        antler_boxes = antler_boxes[:max_instances]

        return {
            "deer": deer_boxes,
            "antlers": antler_boxes
        }

    def _match_antlers_to_deer(self, detections: dict) -> list:
        """
        Match antler boxes to nearest deer boxes by distance.

        Args:
            detections: Dict with "deer" and "antlers" box lists

        Returns:
            List of matched detections with deer and optional antler boxes
        """
        deer_boxes = detections.get("deer", [])
        antler_boxes = detections.get("antlers", [])

        matched = []
        used_antlers = set()

        for deer in deer_boxes:
            deer_box = deer["box"]
            deer_center = self._box_center(deer_box)

            # Find closest antler box
            closest_antler = None
            min_distance = float('inf')
            closest_idx = -1

            for idx, antler in enumerate(antler_boxes):
                if idx in used_antlers:
                    continue

                antler_box = antler["box"]
                antler_center = self._box_center(antler_box)

                distance = math.sqrt(
                    (deer_center[0] - antler_center[0]) ** 2 +
                    (deer_center[1] - antler_center[1]) ** 2
                )

                if distance < min_distance:
                    min_distance = distance
                    closest_antler = antler
                    closest_idx = idx

            # Mark antler as used
            if closest_idx >= 0:
                used_antlers.add(closest_idx)

            # Build detection object
            detection = {
                "deer_box_xyxy": deer_box,
                "deer_score": deer["score"],
                "antler_box_xyxy": closest_antler["box"] if closest_antler else None,
                "antler_score": closest_antler["score"] if closest_antler else None
            }

            matched.append(detection)

        return matched

    @staticmethod
    def _box_center(box: list) -> tuple:
        """Calculate center point of bounding box."""
        xmin, ymin, xmax, ymax = box
        return ((xmin + xmax) / 2, (ymin + ymax) / 2)


# Global model instance
yolo_model = YOLOWorldModel()
