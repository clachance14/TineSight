export interface PhotoAnalysis {
  deer_present: boolean;
  detections: DeerDetection[];
  image_quality_score: number;
  analysis_notes: string;
}

export interface DeerDetection {
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
  head_bbox?: { ymin: number; xmin: number; ymax: number; xmax: number } | null;
  species: 'whitetail' | 'mule_deer' | 'elk' | 'unknown';
  sex: 'buck' | 'doe' | 'fawn' | 'unknown';
  antler_points: number | null;
  age_class: 'young' | 'mature' | 'old' | 'unknown';
  distinguishing_features: string | null;
  confidence: number; // 0-100
}

export interface MatchComparison {
  best_match: {
    deer_id: string;
    deer_name: string;
    confidence: number;
    reasoning: string;
  } | null;
  other_possibilities: {
    deer_id: string;
    deer_name: string;
    confidence: number;
  }[];
  is_likely_new_deer: boolean;
}
