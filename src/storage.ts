import { seedData } from './seed'
import { localDateKey } from './board'
import type { TrackerData } from './types'

const STORAGE_KEY = 'toms-tracker-data-v1'

export function hasStoredData() {
  return localStorage.getItem(STORAGE_KEY) !== null
}

export function loadData(): TrackerData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return seedData
    const parsed = JSON.parse(stored) as TrackerData
    if (parsed.version !== 1 || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.areas)) {
      return seedData
    }
    return parsed
  } catch {
    return seedData
  }
}

export function saveData(data: TrackerData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function exportData(data: TrackerData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = `toms-tracker-${localDateKey()}.json`
  link.click()
  URL.revokeObjectURL(href)
}
