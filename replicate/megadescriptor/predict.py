"""
MegaDescriptor-L-384 Predictor for Replicate

Generates 1536-dimensional embeddings for deer/wildlife re-identification.
Based on the WACV 2024 Best Paper: "WildlifeDatasets: An open-source toolkit
for animal re-identification"

Model: https://huggingface.co/BVRA/MegaDescriptor-L-384
"""

from cog import BasePredictor, Input, Path
import torch
import timm
import torchvision.transforms as T
from PIL import Image


class Predictor(BasePredictor):
    def setup(self):
        """Load MegaDescriptor-L-384 into GPU memory"""
        print("Loading MegaDescriptor-L-384 model...")

        self.model = timm.create_model(
            "hf-hub:BVRA/MegaDescriptor-L-384",
            pretrained=True,
            num_classes=0  # Return embedding features, not classification
        )
        self.model.eval()

        if torch.cuda.is_available():
            self.model = self.model.cuda()
            print("Model loaded on GPU")
        else:
            print("Warning: Running on CPU (slower)")

        # MegaDescriptor-L-384 expects 384x384 input with specific normalization
        self.transform = T.Compose([
            T.Resize((384, 384)),
            T.ToTensor(),
            T.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5])
        ])

        print("Model ready for inference")

    def predict(
        self,
        image: Path = Input(
            description="Image containing deer/animal to generate embedding for. "
                        "Best results with cropped head/antler regions."
        )
    ) -> dict:
        """
        Generate 1536-dimensional embedding for re-identification.

        Returns:
            dict with 'embedding' (list of 1536 floats) and 'dimension' (1536)
        """
        # Load and preprocess image
        img = Image.open(image).convert('RGB')
        tensor = self.transform(img).unsqueeze(0)

        if torch.cuda.is_available():
            tensor = tensor.cuda()

        # Generate embedding
        with torch.no_grad():
            embedding = self.model(tensor)

        # Convert to list for JSON serialization
        embedding_list = embedding[0].cpu().tolist()

        return {
            "embedding": embedding_list,
            "dimension": len(embedding_list)  # Should be 1536
        }
