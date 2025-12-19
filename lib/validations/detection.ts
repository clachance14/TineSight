import { z } from 'zod'

/**
 * Valid values for detection sex classification
 */
export const SEX_OPTIONS = ['buck', 'doe', 'fawn', 'unknown'] as const
export type SexOption = typeof SEX_OPTIONS[number]

/**
 * Valid values for detection age classification
 */
export const AGE_CLASS_OPTIONS = ['young', 'mature', 'old', 'unknown'] as const
export type AgeClassOption = typeof AGE_CLASS_OPTIONS[number]

/**
 * Valid values for deer species
 */
export const SPECIES_OPTIONS = ['whitetail', 'mule_deer', 'elk', 'unknown'] as const
export type SpeciesOption = typeof SPECIES_OPTIONS[number]

/**
 * Valid values for size class (buck antler development)
 */
export const SIZE_CLASS_OPTIONS = ['spike', 'basket', 'standard', 'trophy', 'unknown'] as const
export type SizeClassOption = typeof SIZE_CLASS_OPTIONS[number]

/**
 * Valid values for estimated point range
 */
export const ESTIMATED_POINT_RANGE_OPTIONS = ['spike', 'fork', '6-8 points', '8-10 points', '10+ points', 'unknown'] as const
export type EstimatedPointRangeOption = typeof ESTIMATED_POINT_RANGE_OPTIONS[number]

/**
 * Schema for updating detection classification fields via the edit panel
 */
export const detectionUpdateSchema = z.object({
  sex: z.enum(SEX_OPTIONS).nullable().optional(),
  sizeClass: z.enum(SIZE_CLASS_OPTIONS).nullable().optional(),
  estimatedPointRange: z.enum(ESTIMATED_POINT_RANGE_OPTIONS).nullable().optional(),
  ageClass: z.enum(AGE_CLASS_OPTIONS).nullable().optional(),
  species: z.enum(SPECIES_OPTIONS).nullable().optional(),
  distinguishingFeatures: z.string().max(500).nullable().optional(),
  deerId: z.string().uuid().nullable().optional(),
})

export type DetectionUpdateInput = z.infer<typeof detectionUpdateSchema>

/**
 * Schema for the detection edit form (all fields required for form state)
 */
export const detectionEditFormSchema = z.object({
  sex: z.enum(SEX_OPTIONS).nullable(),
  sizeClass: z.enum(SIZE_CLASS_OPTIONS).nullable(),
  estimatedPointRange: z.enum(ESTIMATED_POINT_RANGE_OPTIONS).nullable(),
  ageClass: z.enum(AGE_CLASS_OPTIONS).nullable(),
  species: z.enum(SPECIES_OPTIONS).nullable(),
  distinguishingFeatures: z.string().max(500).nullable(),
})

export type DetectionEditFormValues = z.infer<typeof detectionEditFormSchema>

/**
 * Default form values for detection editing
 */
export const defaultDetectionFormValues: DetectionEditFormValues = {
  sex: null,
  sizeClass: null,
  estimatedPointRange: null,
  ageClass: null,
  species: null,
  distinguishingFeatures: null,
}

/**
 * Human-readable labels for form fields
 */
export const FIELD_LABELS = {
  sex: 'Sex',
  sizeClass: 'Size Class',
  estimatedPointRange: 'Estimated Point Range',
  ageClass: 'Age Class',
  species: 'Species',
  distinguishingFeatures: 'Distinguishing Features',
} as const

/**
 * Human-readable labels for select options
 */
export const SEX_LABELS: Record<SexOption, string> = {
  buck: 'Buck',
  doe: 'Doe',
  fawn: 'Fawn',
  unknown: 'Unknown',
}

export const SIZE_CLASS_LABELS: Record<SizeClassOption, string> = {
  spike: 'Spike',
  basket: 'Basket',
  standard: 'Standard',
  trophy: 'Trophy',
  unknown: 'Unknown',
}

export const ESTIMATED_POINT_RANGE_LABELS: Record<EstimatedPointRangeOption, string> = {
  spike: 'Spike',
  fork: 'Fork',
  '6-8 points': '6-8 Points',
  '8-10 points': '8-10 Points',
  '10+ points': '10+ Points',
  unknown: 'Unknown',
}

export const AGE_CLASS_LABELS: Record<AgeClassOption, string> = {
  young: 'Young (1-2 years)',
  mature: 'Mature (3-5 years)',
  old: 'Old (6+ years)',
  unknown: 'Unknown',
}

export const SPECIES_LABELS: Record<SpeciesOption, string> = {
  whitetail: 'Whitetail',
  mule_deer: 'Mule Deer',
  elk: 'Elk',
  unknown: 'Unknown',
}
