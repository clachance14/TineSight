'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Trophy, CheckCircle, Clock, Grid3x3, FileQuestion } from 'lucide-react'
import type { DashboardStats } from '@/lib/services/trophy'

interface SummaryStatsProps {
  stats: DashboardStats
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: number
  variant?: 'default' | 'success' | 'warning' | 'info'
}

function StatCard({ icon, label, value, variant = 'default' }: StatCardProps) {
  const variantColors = {
    default: 'text-copper',
    success: 'text-green-500',
    warning: 'text-yellow-500',
    info: 'text-blue-500',
  }

  return (
    <Card variant="elevated" className="py-4">
      <CardContent className="flex items-center gap-4">
        <div className={`${variantColors[variant]}`}>{icon}</div>
        <div>
          <div className="text-2xl font-bold text-cream">{value}</div>
          <div className="text-sm text-cream-dark">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export function SummaryStats({ stats }: SummaryStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <StatCard
        icon={<Trophy className="h-8 w-8" />}
        label="Total Trophy Detections"
        value={stats.totalTrophyDetections}
        variant="default"
      />
      <StatCard
        icon={<CheckCircle className="h-8 w-8" />}
        label="Assigned to Deer"
        value={stats.assignedCount}
        variant="success"
      />
      <StatCard
        icon={<Clock className="h-8 w-8" />}
        label="Pending Matches"
        value={stats.pendingMatchCount}
        variant="warning"
      />
      <StatCard
        icon={<Grid3x3 className="h-8 w-8" />}
        label="Suggested Clusters"
        value={stats.clusterCount}
        variant="info"
      />
      <StatCard
        icon={<FileQuestion className="h-8 w-8" />}
        label="Unclustered"
        value={stats.unclusteredCount}
        variant="info"
      />
    </div>
  )
}
