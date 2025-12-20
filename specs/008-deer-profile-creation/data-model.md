# Data Model: Deer Profile Creation

**Feature**: 008-deer-profile-creation
**Date**: 2025-12-12

## Entities

### Deer Profile

Represents a tracked buck in the user's catalog.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| user_id | UUID | FK → profiles(id), NOT NULL | Owner of the deer profile |
| name | TEXT | NOT NULL (app-level) | User-assigned name for the deer |
| notes | TEXT | nullable | Optional notes/description |
| reference_detection_id | UUID | FK → detections(id), nullable | Best detection for this deer |
| representative_image_id | UUID | FK → images(id), nullable | Display image |
| status | TEXT | DEFAULT 'watching' | 'watching' \| 'target' \| 'harvested' |
| first_seen | TIMESTAMPTZ | nullable | Date of first sighting |
| last_seen | TIMESTAMPTZ | nullable | Date of most recent sighting |
| harvested_at | TIMESTAMPTZ | nullable | Harvest date if applicable |
| tags | TEXT[] | nullable | User-defined tags |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last update timestamp |

### Detection (relevant fields)

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| image_id | UUID | Source photo |
| deer_id | UUID \| null | Linked deer profile (null if unlinked) |
| is_reference | BOOLEAN | TRUE if this is the reference detection for a deer |
| sex | TEXT | 'buck' \| 'doe' \| 'fawn' \| 'unknown' |
| antler_points | INTEGER | 0-30 |
| captured_at | TIMESTAMPTZ | Via images.captured_at |

### Sighting (derived)

A "sighting" is a detection linked to a deer profile. Not a separate table - derived from detections where `deer_id IS NOT NULL`.

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| id | string | detection.id | Detection ID |
| image_id | string | detection.image_id | Source image |
| thumbnail_url | string | Generated | Signed URL for display |
| captured_at | string | images.captured_at | When photo was taken |
| antler_points | number \| null | detection.antler_points | Point count if known |
| is_reference | boolean | detection.is_reference | Whether this is the reference detection |

## Relationships

```
profiles (1) ←──user_id─── (many) deer
deer (1) ──reference_detection_id──→ (0..1) detections
deer (1) ←──deer_id─── (many) detections [sightings]
detections (many) ──image_id──→ (1) images
```

## State Transitions

### Deer Profile States

```
[created] → watching → target → harvested
                ↓         ↓
              watching  watching
```

- Default state is `watching`
- Can transition to `target` (buck of interest)
- Can transition to `harvested` (end state, sets harvested_at)
- Can revert from `target` back to `watching`

### Detection Linking States

```
[unlinked] → linked (deer_id set)
   ↓            ↓
created    is_reference = true (optional)
```

- Detection starts unlinked (`deer_id = null`)
- When linked to deer, `deer_id` is set
- Can optionally be marked as reference detection

## Validation Rules

1. **Deer name**: Non-empty string (required at creation)
2. **Detection linkage**: Only buck detections can be linked to deer profiles
3. **Reference detection**: Only one detection per deer can be `is_reference = true`
4. **User ownership**: Users can only access deer where `user_id = auth.uid()`

## Indexes (existing)

- `idx_detections_deer_id` - Find sightings for a deer
- `idx_detections_is_reference` - Find reference detections
- `deer_user_id_idx` - Filter deer by owner
