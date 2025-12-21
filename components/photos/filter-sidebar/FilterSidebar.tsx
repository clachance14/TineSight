"use client"

import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion"
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Calendar,
  MapPin,
  Activity
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useUIStore } from "@/lib/stores/ui"
import type { PhotoFilters } from "@/components/photos/photo-filters"

interface FilterSidebarProps {
  filters: PhotoFilters
  onFiltersChange: (filters: PhotoFilters) => void
  resultCount?: number
  deerList?: { id: string; name: string }[]
  cameraList?: { id: string; name: string }[]
  areaList?: string[]
}

export function FilterSidebar({
  filters,
  onFiltersChange,
  resultCount,
  deerList: _deerList = [],
  cameraList: _cameraList = [],
  areaList: _areaList = []
}: FilterSidebarProps) {
  // Suppress unused variable warnings - props will be used when filter UI is implemented
  void _deerList
  void _cameraList
  void _areaList
  const {
    filterSidebarOpen,
    toggleFilterSidebar,
    filterSidebarExpandedSections,
    setFilterSidebarExpandedSections
  } = useUIStore()

  // Clear all filters
  const handleClearAll = () => {
    onFiltersChange({
      status: 'all',
      hasDeer: null,
      hasDetections: null,
      qualityStatus: 'all',
      sex: 'all',
      sizeClass: 'all',
      ageClass: 'all',
      sortBy: 'imported_at',
      sortDirection: 'desc',
    })
  }

  // Check if any filters are active
  const hasActiveFilters =
    (filters.status && filters.status !== 'all') ||
    filters.hasDeer !== null ||
    filters.hasDetections !== null ||
    (filters.qualityStatus && filters.qualityStatus !== 'all') ||
    filters.minConfidence !== undefined ||
    (filters.sex && filters.sex !== 'all') ||
    filters.minPoints !== undefined ||
    filters.maxPoints !== undefined ||
    (filters.sizeClass && filters.sizeClass !== 'all') ||
    (filters.ageClass && filters.ageClass !== 'all') ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.datePreset ||
    filters.cameraId ||
    filters.deerId ||
    filters.areaName !== undefined ||
    filters.deerCountMin !== undefined ||
    filters.deerCountMax !== undefined ||
    filters.hasCows ||
    filters.hasGoats ||
    filters.hasHogs ||
    filters.hasPeople ||
    filters.hasVehicles ||
    filters.sortBy === 'captured_at' // Only count as active if non-default

  return (
    <>
      {/* Sidebar Container */}
      <aside
        className={cn(
          "fixed left-0 top-16 bottom-0 z-40 flex flex-col transition-all duration-300 ease-in-out",
          "bg-[var(--color-deep-forest)] border-r border-[var(--color-forest-light)]",
          filterSidebarOpen ? "w-[280px]" : "w-0"
        )}
        style={{
          backgroundColor: 'var(--color-deep-forest)',
          borderColor: 'var(--color-forest-light)'
        }}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between gap-2 p-4 border-b border-[var(--color-forest-light)]">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-[var(--color-parchment)] truncate">
              Filters
            </h2>
            {resultCount !== undefined && (
              <span className="text-xs text-[var(--color-weathered)] shrink-0">
                ({resultCount})
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="h-7 px-2 text-xs text-[var(--color-weathered)] hover:text-[var(--color-brass)] hover:bg-[var(--color-forest)]"
              >
                Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Scrollable Filter Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <Accordion
            type="multiple"
            value={filterSidebarExpandedSections}
            onValueChange={setFilterSidebarExpandedSections}
            className="w-full"
          >
            {/* Sort Section */}
            <AccordionItem value="sort" className="border-b border-[var(--color-forest-light)] px-4">
              <AccordionTrigger className="text-[var(--color-parchment)] hover:text-[var(--color-brass)] py-3">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="size-4" />
                  <span className="text-sm font-medium">Sort</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="text-xs text-[var(--color-weathered)] py-2">
                  Sort controls (placeholder)
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Animal Section */}
            <AccordionItem value="animal" className="border-b border-[var(--color-forest-light)] px-4">
              <AccordionTrigger className="text-[var(--color-parchment)] hover:text-[var(--color-brass)] py-3">
                <div className="flex items-center gap-2">
                  <Activity className="size-4" />
                  <span className="text-sm font-medium">Animal</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="text-xs text-[var(--color-weathered)] py-2">
                  Sex, size class, age class, points (placeholder)
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Detection Section */}
            <AccordionItem value="detection" className="border-b border-[var(--color-forest-light)] px-4">
              <AccordionTrigger className="text-[var(--color-parchment)] hover:text-[var(--color-brass)] py-3">
                <div className="flex items-center gap-2">
                  <MapPin className="size-4" />
                  <span className="text-sm font-medium">Detection</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="text-xs text-[var(--color-weathered)] py-2">
                  Has deer, deer count, named deer, quality (placeholder)
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Other Animals Section */}
            <AccordionItem value="other-animals" className="border-b border-[var(--color-forest-light)] px-4">
              <AccordionTrigger className="text-[var(--color-parchment)] hover:text-[var(--color-brass)] py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Other Animals</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="text-xs text-[var(--color-weathered)] py-2">
                  Cows, goats, hogs, people, vehicles (placeholder)
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Date Section */}
            <AccordionItem value="date" className="border-b border-[var(--color-forest-light)] px-4">
              <AccordionTrigger className="text-[var(--color-parchment)] hover:text-[var(--color-brass)] py-3">
                <div className="flex items-center gap-2">
                  <Calendar className="size-4" />
                  <span className="text-sm font-medium">Date</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="text-xs text-[var(--color-weathered)] py-2">
                  Date range picker (placeholder)
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Location Section */}
            <AccordionItem value="location" className="border-b border-[var(--color-forest-light)] px-4">
              <AccordionTrigger className="text-[var(--color-parchment)] hover:text-[var(--color-brass)] py-3">
                <div className="flex items-center gap-2">
                  <MapPin className="size-4" />
                  <span className="text-sm font-medium">Location</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="text-xs text-[var(--color-weathered)] py-2">
                  Camera, area, upload session (placeholder)
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Status Section */}
            <AccordionItem value="status" className="border-b-0 px-4">
              <AccordionTrigger className="text-[var(--color-parchment)] hover:text-[var(--color-brass)] py-3">
                <div className="flex items-center gap-2">
                  <Activity className="size-4" />
                  <span className="text-sm font-medium">Status</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="text-xs text-[var(--color-weathered)] py-2 pb-4">
                  Processing status, confidence slider (placeholder)
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </aside>

      {/* Toggle Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleFilterSidebar}
        className={cn(
          "fixed top-20 z-50 h-8 w-8 p-0 transition-all duration-300",
          "bg-[var(--color-forest)] border border-[var(--color-forest-light)]",
          "hover:bg-[var(--color-forest-light)] text-[var(--color-parchment)]",
          filterSidebarOpen ? "left-[280px]" : "left-0"
        )}
        title={filterSidebarOpen ? "Hide filters" : "Show filters"}
      >
        {filterSidebarOpen ? (
          <ChevronLeft className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
      </Button>
    </>
  )
}
