'use client'

import type { DashboardStats } from '@/lib/services/trophy'

interface SummaryStatsProps {
  stats: DashboardStats
}

/**
 * Quiet placard line for the Review workroom — replaces the old 5-up stat-tile
 * dashboard (forbidden by DESIGN.md). The three actionable counts (matches /
 * new bucks / unsorted) live on the tabs; this line carries the standing totals.
 */
export function SummaryStats({ stats }: SummaryStatsProps): React.JSX.Element {
  return (
    <div className="border-b border-cream/10 pb-2.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-cream-dark">
        <span className="tabular-nums text-cream">{stats.totalTrophyDetections}</span> Trophy Detection
        {stats.totalTrophyDetections === 1 ? '' : 's'}
        {' · '}
        <span className="tabular-nums text-cream">{stats.assignedCount}</span> Named
      </span>
    </div>
  )
}
