# MegaDescriptor-L-384 for Replicate

Deer/wildlife re-identification embedding model deployed to Replicate.

## Model Info

- **Model**: [BVRA/MegaDescriptor-L-384](https://huggingface.co/BVRA/MegaDescriptor-L-384)
- **Architecture**: Swin-L Transformer (384x384 input)
- **Output**: 1536-dimensional embedding vector
- **Paper**: WACV 2024 Best Paper - "WildlifeDatasets: An open-source toolkit for animal re-identification"

## Local Testing

1. Install Cog:
   ```bash
   curl -o /usr/local/bin/cog -L https://github.com/replicate/cog/releases/latest/download/cog_$(uname -s)_$(uname -m)
   chmod +x /usr/local/bin/cog
   ```

2. Test locally:
   ```bash
   cd replicate/megadescriptor
   cog predict -i image=@path/to/test/deer.jpg
   ```

## Deploy to Replicate

1. Login to Replicate:
   ```bash
   cog login
   ```

2. Push model:
   ```bash
   cog push r8.im/<your-username>/megadescriptor
   ```

3. Get the version string from the output (e.g., `username/megadescriptor:abc123...`)

4. Update `.env.local`:
   ```
   EMBEDDING_MODEL_VERSION=username/megadescriptor:abc123...
   ```

## Usage

The model returns a JSON object:
```json
{
  "embedding": [0.123, -0.456, ...],  // 1536 floats
  "dimension": 1536
}
```

For best re-identification accuracy, pass cropped images of the deer's head and antler region rather than full-body images.
