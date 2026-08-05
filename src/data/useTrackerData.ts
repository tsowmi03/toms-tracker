import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { hasStoredData, loadData, saveData } from '../storage'
import { seedData } from '../seed'
import type { BoardType, TaskBoard, TrackerData } from '../types'
import {
  acceptBoardInvite,
  createBoard,
  initialiseWorkspace,
  persistWorkspaceChanges,
  removeStaleBoardReference,
  subscribeToBoard,
  subscribeToBoards,
  type MemberIdentity,
} from './trackerRepository'

export type SyncState = 'local' | 'loading' | 'syncing' | 'synced' | 'offline' | 'error'

const localBoard: TaskBoard = {
  id: 'local',
  name: 'My tasks',
  type: 'personal',
  ownerId: 'local',
  role: 'owner',
  createdAt: '',
  updatedAt: '',
}

function activeBoardStorageKey(uid: string) {
  return `toms-tracker-active-board-v1:${uid}`
}

function emptyBoardData(): TrackerData {
  return { ...seedData, tasks: [] }
}

export function useTrackerData(uid?: string, identity: MemberIdentity = {}) {
  const [data, setData] = useState<TrackerData>(() => loadData(uid))
  const dataReference = useRef(data)
  const [boards, setBoards] = useState<TaskBoard[]>(uid ? [] : [localBoard])
  const [activeBoardId, setActiveBoardId] = useState<string | undefined>(uid ? undefined : localBoard.id)
  const [loadedBoardId, setLoadedBoardId] = useState<string | undefined>(uid ? undefined : localBoard.id)
  const [workspaceReady, setWorkspaceReady] = useState(!uid)
  const [boardReady, setBoardReady] = useState(!uid)
  const [syncState, setSyncState] = useState<SyncState>(uid ? 'loading' : 'local')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) {
      setBoards([localBoard])
      setActiveBoardId(localBoard.id)
      setLoadedBoardId(localBoard.id)
      setWorkspaceReady(true)
      setBoardReady(true)
      setSyncState('local')
      return
    }

    let active = true
    let unsubscribe: (() => void) | undefined
    setWorkspaceReady(false)
    setSyncState('loading')
    setError(null)

    const initialCloudData = hasStoredData(uid) ? loadData(uid) : emptyBoardData()
    void initialiseWorkspace(uid, initialCloudData, identity)
      .then(() => {
        if (!active) return
        unsubscribe = subscribeToBoards(
          uid,
          (nextBoards, hasPendingWrites) => {
            if (!active) return
            setBoards(nextBoards)
            setActiveBoardId((current) => {
              if (current && nextBoards.some((board) => board.id === current)) return current
              const stored = localStorage.getItem(activeBoardStorageKey(uid))
              if (stored && nextBoards.some((board) => board.id === stored)) return stored
              return nextBoards[0]?.id
            })
            setWorkspaceReady(true)
            setSyncState(navigator.onLine ? (hasPendingWrites ? 'syncing' : 'synced') : 'offline')
          },
          () => {
            if (!active) return
            setError('Your board list could not be loaded. Check the Firebase project and security rules.')
            setSyncState('error')
            setWorkspaceReady(true)
          },
        )
      })
      .catch(() => {
        if (!active) return
        setError('Your boards could not be initialised. Your previous cloud data has not been removed.')
        setSyncState('error')
        setWorkspaceReady(true)
      })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [uid, identity.displayName, identity.email])

  useEffect(() => {
    if (!uid || !activeBoardId) return

    let active = true
    setBoardReady(false)
    setError(null)
    localStorage.setItem(activeBoardStorageKey(uid), activeBoardId)
    const cached = hasStoredData(uid, activeBoardId) ? loadData(uid, activeBoardId) : emptyBoardData()
    dataReference.current = cached
    setData(cached)
    setLoadedBoardId(activeBoardId)

    const unsubscribe = subscribeToBoard(
      activeBoardId,
      (cloudData, hasPendingWrites) => {
        if (!active) return
        dataReference.current = cloudData
        setData(cloudData)
        saveData(cloudData, uid, activeBoardId)
        setBoardReady(true)
        setSyncState(navigator.onLine ? (hasPendingWrites ? 'syncing' : 'synced') : 'offline')
      },
      (boardError) => {
        if (!active) return
        const code = 'code' in boardError ? String(boardError.code) : ''
        setError('This board could not be loaded. Check your connection and try again.')
        if (code === 'permission-denied') {
          // Only a confirmed removal unlinks the board, so wait for the verdict
          // before telling the user their access is gone.
          void removeStaleBoardReference(uid, activeBoardId).then((removed) => {
            if (active && removed) setError('You no longer have access to this board.')
          }).catch(() => {})
        }
        setSyncState('error')
        setBoardReady(true)
        setLoadedBoardId(activeBoardId)
      },
    )

    return () => {
      active = false
      unsubscribe()
    }
  }, [uid, activeBoardId])

  useEffect(() => {
    const updateConnectivity = () => {
      if (!navigator.onLine) setSyncState('offline')
      else setSyncState((current) => current === 'offline' ? 'syncing' : current)
    }
    window.addEventListener('online', updateConnectivity)
    window.addEventListener('offline', updateConnectivity)
    return () => {
      window.removeEventListener('online', updateConnectivity)
      window.removeEventListener('offline', updateConnectivity)
    }
  }, [])

  const selectBoard = useCallback((boardId: string) => {
    setActiveBoardId(boardId)
  }, [])

  const addBoard = useCallback(async (name: string, type: BoardType) => {
    if (!uid) throw new Error('Sign in to create multiple boards.')
    const boardId = await createBoard(uid, identity, name, type)
    setActiveBoardId(boardId)
    return boardId
  }, [uid, identity.displayName, identity.email])

  const joinBoard = useCallback(async (inviteId: string) => {
    if (!uid) throw new Error('Sign in to join a shared board.')
    const boardId = await acceptBoardInvite(uid, identity, inviteId)
    setActiveBoardId(boardId)
    return boardId
  }, [uid, identity.displayName, identity.email])

  const updateData = useCallback((updater: (current: TrackerData) => TrackerData) => {
    const previous = dataReference.current
    const next = updater(previous)
    dataReference.current = next
    setData(next)

    if (!uid) {
      saveData(next)
      setSyncState('local')
      return
    }
    if (!activeBoardId) return

    saveData(next, uid, activeBoardId)
    setSyncState(navigator.onLine ? 'syncing' : 'offline')
    void persistWorkspaceChanges(activeBoardId, previous, next, uid)
      .catch(() => {
        setError('A change could not be synced. It remains saved on this device.')
        setSyncState(navigator.onLine ? 'error' : 'offline')
      })
  }, [uid, activeBoardId])

  const activeBoard = useMemo(
    () => boards.find((board) => board.id === activeBoardId),
    [boards, activeBoardId],
  )

  return {
    data,
    updateData,
    boards,
    activeBoard,
    selectBoard,
    addBoard,
    joinBoard,
    ready: workspaceReady && boardReady && Boolean(activeBoard) && loadedBoardId === activeBoardId,
    syncState,
    error,
  }
}
