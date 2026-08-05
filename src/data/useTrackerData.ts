import { useCallback, useEffect, useRef, useState } from 'react'
import { hasStoredData, loadData, saveData } from '../storage'
import { seedData } from '../seed'
import type { TrackerData } from '../types'
import {
  initialiseWorkspace,
  persistWorkspaceChanges,
  subscribeToWorkspace,
} from './trackerRepository'

export type SyncState = 'local' | 'loading' | 'syncing' | 'synced' | 'offline' | 'error'

export function useTrackerData(uid?: string) {
  const [data, setData] = useState<TrackerData>(() => loadData(uid))
  const dataReference = useRef(data)
  const [ready, setReady] = useState(!uid)
  const [syncState, setSyncState] = useState<SyncState>(uid ? 'loading' : 'local')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) {
      setReady(true)
      setSyncState('local')
      return
    }

    let active = true
    let unsubscribe: (() => void) | undefined
    setReady(false)
    setSyncState('loading')
    setError(null)

    const initialCloudData = hasStoredData(uid)
      ? loadData(uid)
      : { ...seedData, tasks: [] }

    void initialiseWorkspace(uid, initialCloudData)
      .then(() => {
        if (!active) return
        unsubscribe = subscribeToWorkspace(
          uid,
          (cloudData, hasPendingWrites) => {
            if (!active) return
            dataReference.current = cloudData
            setData(cloudData)
            saveData(cloudData, uid)
            setReady(true)
            setSyncState(navigator.onLine ? (hasPendingWrites ? 'syncing' : 'synced') : 'offline')
          },
          () => {
            if (!active) return
            setError('Your workspace could not be loaded. Check the Firebase project and security rules.')
            setSyncState('error')
            setReady(true)
          },
        )
      })
      .catch(() => {
        if (!active) return
        setError('Your workspace could not be initialised. Check the Firebase project and security rules.')
        setSyncState('error')
        setReady(true)
      })

    const updateConnectivity = () => {
      if (!navigator.onLine) setSyncState('offline')
      else setSyncState((current) => current === 'offline' ? 'syncing' : current)
    }
    window.addEventListener('online', updateConnectivity)
    window.addEventListener('offline', updateConnectivity)

    return () => {
      active = false
      unsubscribe?.()
      window.removeEventListener('online', updateConnectivity)
      window.removeEventListener('offline', updateConnectivity)
    }
  }, [uid])

  const updateData = useCallback((updater: (current: TrackerData) => TrackerData) => {
    const previous = dataReference.current
    const next = updater(previous)
    dataReference.current = next
    setData(next)
    saveData(next, uid)

    if (!uid) {
      setSyncState('local')
      return
    }

    setSyncState(navigator.onLine ? 'syncing' : 'offline')
    void persistWorkspaceChanges(uid, previous, next)
      .catch(() => {
        setError('A change could not be synced. It remains saved on this device.')
        setSyncState(navigator.onLine ? 'error' : 'offline')
      })
  }, [uid])

  return { data, updateData, ready, syncState, error }
}
