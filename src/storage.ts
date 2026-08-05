import { seedData } from './seed'
import { localDateKey } from './board'
import type { TrackerData } from './types'

const STORAGE_KEY = 'toms-tracker-data-v1'

function storageKey(uid?: string) {
  return uid ? `${STORAGE_KEY}:user:${uid}` : STORAGE_KEY
}

export function hasStoredData(uid?: string) {
  return localStorage.getItem(storageKey(uid)) !== null
}

export function loadData(uid?: string): TrackerData {
  try {
    const stored = localStorage.getItem(storageKey(uid))
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

export function saveData(data: TrackerData, uid?: string) {
  localStorage.setItem(storageKey(uid), JSON.stringify(data))
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
