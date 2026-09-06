import { expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeerDetailsContent } from '@/components/photos/deer-details-content'
import type { DetectionResponse } from '@/lib/hooks/use-detection'
import type { AntlerFingerprint } from '@/types/fingerprint'
import savedFingerprint from './fixtures/antler-fingerprint.json'

const fingerprint = {
  ...savedFingerprint,
  measurements: {
    ...savedFingerprint.measurements,
    points_per_side: savedFingerprint.measurements.points_per_side as [number, number],
  },
} as AntlerFingerprint
const detection: DetectionResponse = {
  id: 'deer', imageId: 'photo', imageUrl: null, cropUrl: null,
  bboxX: null, bboxY: null, bboxWidth: null, bboxHeight: null,
  sex: 'buck', sizeClass: 'trophy', estimatedPointRange: '10-12', ageClass: 'mature', species: 'whitetail',
  distinguishingFeatures: 'Split brow tine', confidence: 0.9, geminiConfidence: 90,
  deerId: null, createdAt: '2026-09-05', antlerFingerprint: fingerprint,
  trophyThreshold: fingerprint.scores.gross_score - 5,
}

it('keeps the real score visible across tabs and compares against the account threshold', async () => {
  const user = userEvent.setup()
  render(<DeerDetailsContent detection={detection} />)
  expect(screen.getByText('Trophy', { exact: true })).toBeInTheDocument()
  expect(screen.getByText('5.0″', { exact: true })).toBeInTheDocument()
  expect(screen.getByText('Split brow tine', { exact: true })).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  await user.click(screen.getByRole('tab', { name: 'Measurements' }))
  const beams = screen.getByRole('table', { name: 'Beams & tines' })
  expect(within(beams).getByRole('columnheader', { name: 'Left' })).toBeInTheDocument()
  expect(screen.getByRole('table', { name: 'Circumference' })).toBeInTheDocument()
  expect(screen.getByText('Photo-based gross score')).toBeInTheDocument()
  await user.click(screen.getByRole('tab', { name: 'Identification' }))
  expect(screen.getByText('Comparison ratios')).toBeInTheDocument()
  expect(screen.getByText('Photo-based gross score')).toBeInTheDocument()
})

it('never awards trophy status from size class alone and labels an estimate accurately', () => {
  render(<DeerDetailsContent detection={{ ...detection, antlerFingerprint: null, scoreEstimate: 115, scoreEstimateConfidence: 60, trophyThreshold: 130 }} />)
  expect(screen.getByText('Estimated gross score')).toBeInTheDocument()
  expect(screen.queryByText('Trophy', { exact: true })).not.toBeInTheDocument()
  expect(screen.getByText('Below threshold')).toBeInTheDocument()
  expect(screen.getByText('15.0″')).toBeInTheDocument()
  expect(screen.getByText('60%')).toBeInTheDocument()
})

it('handles missing scores and measurements without inventing data', async () => {
  const user = userEvent.setup()
  render(<DeerDetailsContent detection={{ ...detection, antlerFingerprint: null, trophyThreshold: null }} />)
  expect(screen.getByText('A score is not available for this sighting yet.')).toBeInTheDocument()
  expect(screen.getByText('Unavailable', { exact: true })).toBeInTheDocument()
  await user.click(screen.getByRole('tab', { name: 'Measurements' }))
  expect(screen.getByText('Detailed measurements will appear when an antler fingerprint is available.')).toBeInTheDocument()
})
