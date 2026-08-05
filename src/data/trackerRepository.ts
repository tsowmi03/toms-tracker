import {
  Timestamp,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  where,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import { getFirebaseServices } from '../firebase'
import { seedData } from '../seed'
import type {
  Area,
  BoardInvite,
  BoardMember,
  BoardRole,
  BoardType,
  Task,
  TaskBoard,
  TrackerData,
} from '../types'

const SCHEMA_VERSION = 2
const MAX_BATCH_OPERATIONS = 220
const INVITE_LIFETIME_DAYS = 7

export interface MemberIdentity {
  displayName?: string | null
  email?: string | null
}

function servicesOrThrow() {
  const services = getFirebaseServices()
  if (!services) throw new Error('Firebase is not configured')
  return services
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

function taskFromDocument(id: string, data: DocumentData): Task {
  return {
    id,
    title: String(data.title ?? ''),
    description: String(data.description ?? ''),
    status: data.status as Task['status'],
    priority: data.priority as Task['priority'],
    areaId: String(data.areaId ?? ''),
    dueDate: data.dueDate ? String(data.dueDate) : undefined,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    isFocus: Boolean(data.isFocus),
    assigneeId: data.assigneeId ? String(data.assigneeId) : undefined,
    assigneeName: data.assigneeName ? String(data.assigneeName) : undefined,
    createdAt: String(data.createdAt ?? new Date().toISOString()),
    updatedAt: String(data.updatedAt ?? new Date().toISOString()),
    completedAt: data.completedAt ? String(data.completedAt) : undefined,
  }
}

function areaFromDocument(id: string, data: DocumentData): Area {
  return { id, name: String(data.name ?? 'Untitled'), color: String(data.color ?? '#77776e') }
}

function boardFromReference(id: string, data: DocumentData): TaskBoard {
  return {
    id,
    name: String(data.name ?? 'Untitled board'),
    type: data.type === 'shared' ? 'shared' : 'personal',
    ownerId: String(data.ownerId ?? ''),
    role: data.role === 'member' ? 'member' : 'owner',
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  }
}

function memberFromDocument(id: string, data: DocumentData): BoardMember {
  return {
    uid: id,
    role: data.role === 'owner' ? 'owner' : 'member',
    displayName: String(data.displayName ?? ''),
    email: String(data.email ?? ''),
    joinedAt: String(data.joinedAt ?? ''),
  }
}

function identityFields(uid: string, identity: MemberIdentity, role: BoardRole, joinedAt: string) {
  return {
    uid,
    role,
    displayName: identity.displayName?.trim() ?? '',
    email: identity.email?.trim() ?? '',
    joinedAt,
  }
}

function boardReferenceFields(board: Omit<TaskBoard, 'role'>, role: BoardRole) {
  return {
    boardId: board.id,
    name: board.name,
    type: board.type,
    ownerId: board.ownerId,
    role,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  }
}

async function commitOperations(db: Firestore, operations: Array<(batch: ReturnType<typeof writeBatch>) => void>) {
  for (let start = 0; start < operations.length; start += MAX_BATCH_OPERATIONS) {
    const batch = writeBatch(db)
    operations.slice(start, start + MAX_BATCH_OPERATIONS).forEach((operation) => operation(batch))
    await batch.commit()
  }
}

export async function initialiseWorkspace(uid: string, initialData: TrackerData, identity: MemberIdentity) {
  const { db } = servicesOrThrow()
  const userReference = doc(db, 'users', uid)
  const boardReferences = collection(db, 'users', uid, 'boardRefs')
  const [profile, existingReferences] = await Promise.all([
    getDoc(userReference),
    getDocs(boardReferences),
  ])

  if (!existingReferences.empty && profile.data()?.schemaVersion === SCHEMA_VERSION) return

  const legacyAreas = await getDocs(collection(db, 'users', uid, 'areas'))
  const legacyTasks = await getDocs(collection(db, 'users', uid, 'tasks'))
  const migratedData: TrackerData = {
    version: 1,
    areas: legacyAreas.empty
      ? initialData.areas
      : legacyAreas.docs.map((item) => areaFromDocument(item.id, item.data())),
    tasks: legacyTasks.empty
      ? initialData.tasks
      : legacyTasks.docs.map((item) => taskFromDocument(item.id, item.data())),
  }
  const boardId = `personal-${uid}`
  const now = new Date().toISOString()
  const board: Omit<TaskBoard, 'role'> = {
    id: boardId,
    name: 'My tasks',
    type: 'personal',
    ownerId: uid,
    createdAt: now,
    updatedAt: now,
  }

  if (existingReferences.empty) {
    const coreBatch = writeBatch(db)
    coreBatch.set(doc(db, 'boards', boardId), board)
    coreBatch.set(doc(db, 'boards', boardId, 'members', uid), identityFields(uid, identity, 'owner', now))
    coreBatch.set(doc(boardReferences, boardId), boardReferenceFields(board, 'owner'))
    coreBatch.set(userReference, {
      schemaVersion: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true })
    await coreBatch.commit()
  }

  const operations: Array<(batch: ReturnType<typeof writeBatch>) => void> = []
  migratedData.areas.forEach((area) => {
    operations.push((batch) => batch.set(doc(db, 'boards', boardId, 'areas', area.id), area))
  })
  migratedData.tasks.forEach((task) => {
    operations.push((batch) => batch.set(doc(db, 'boards', boardId, 'tasks', task.id), stripUndefined(task)))
  })
  await commitOperations(db, operations)
  await setDoc(userReference, {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export function subscribeToBoards(
  uid: string,
  onData: (boards: TaskBoard[], hasPendingWrites: boolean) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const { db } = servicesOrThrow()
  return onSnapshot(
    collection(db, 'users', uid, 'boardRefs'),
    { includeMetadataChanges: true },
    (snapshot) => {
      const boards = snapshot.docs
        .map((item) => boardFromReference(item.id, item.data()))
        .sort((left, right) => {
          if (left.type !== right.type) return left.type === 'personal' ? -1 : 1
          return left.name.localeCompare(right.name)
        })
      onData(boards, snapshot.metadata.hasPendingWrites)
    },
    onError,
  )
}

export function subscribeToBoard(
  boardId: string,
  onData: (data: TrackerData, hasPendingWrites: boolean) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const { db } = servicesOrThrow()
  let tasks: Task[] | null = null
  let areas: Area[] | null = null
  let taskWritesPending = false
  let areaWritesPending = false

  const publish = () => {
    if (!tasks || !areas) return
    onData({ version: 1, tasks, areas }, taskWritesPending || areaWritesPending)
  }

  const unsubscribeTasks = onSnapshot(
    collection(db, 'boards', boardId, 'tasks'),
    { includeMetadataChanges: true },
    (snapshot) => {
      tasks = snapshot.docs.map((item) => taskFromDocument(item.id, item.data()))
      taskWritesPending = snapshot.metadata.hasPendingWrites
      publish()
    },
    onError,
  )
  const unsubscribeAreas = onSnapshot(
    collection(db, 'boards', boardId, 'areas'),
    { includeMetadataChanges: true },
    (snapshot) => {
      areas = snapshot.docs.map((item) => areaFromDocument(item.id, item.data()))
      areaWritesPending = snapshot.metadata.hasPendingWrites
      publish()
    },
    onError,
  )

  return () => {
    unsubscribeTasks()
    unsubscribeAreas()
  }
}

function valuesDiffer(left: unknown, right: unknown) {
  return JSON.stringify(left) !== JSON.stringify(right)
}

export async function persistWorkspaceChanges(boardId: string, previous: TrackerData, next: TrackerData, legacyUid?: string) {
  const { db } = servicesOrThrow()
  const mirrorLegacyWorkspace = Boolean(legacyUid && boardId === `personal-${legacyUid}`)
  const operations: Array<(batch: ReturnType<typeof writeBatch>) => void> = []
  const previousTasks = new Map(previous.tasks.map((task) => [task.id, task]))
  const nextTasks = new Map(next.tasks.map((task) => [task.id, task]))
  const previousAreas = new Map(previous.areas.map((area) => [area.id, area]))
  const nextAreas = new Map(next.areas.map((area) => [area.id, area]))

  nextTasks.forEach((task, id) => {
    if (valuesDiffer(previousTasks.get(id), task)) {
      operations.push((batch) => {
        batch.set(doc(db, 'boards', boardId, 'tasks', id), stripUndefined(task))
        if (mirrorLegacyWorkspace && legacyUid) batch.set(doc(db, 'users', legacyUid, 'tasks', id), stripUndefined(task))
      })
    }
  })
  previousTasks.forEach((_, id) => {
    if (!nextTasks.has(id)) operations.push((batch) => {
      batch.delete(doc(db, 'boards', boardId, 'tasks', id))
      if (mirrorLegacyWorkspace && legacyUid) batch.delete(doc(db, 'users', legacyUid, 'tasks', id))
    })
  })
  nextAreas.forEach((area, id) => {
    if (valuesDiffer(previousAreas.get(id), area)) {
      operations.push((batch) => {
        batch.set(doc(db, 'boards', boardId, 'areas', id), area)
        if (mirrorLegacyWorkspace && legacyUid) batch.set(doc(db, 'users', legacyUid, 'areas', id), area)
      })
    }
  })
  previousAreas.forEach((_, id) => {
    if (!nextAreas.has(id)) operations.push((batch) => {
      batch.delete(doc(db, 'boards', boardId, 'areas', id))
      if (mirrorLegacyWorkspace && legacyUid) batch.delete(doc(db, 'users', legacyUid, 'areas', id))
    })
  })

  await commitOperations(db, operations)
}

export async function createBoard(uid: string, identity: MemberIdentity, name: string, type: BoardType) {
  const { db } = servicesOrThrow()
  const boardId = crypto.randomUUID()
  const now = new Date().toISOString()
  const board: Omit<TaskBoard, 'role'> = {
    id: boardId,
    name: name.trim(),
    type,
    ownerId: uid,
    createdAt: now,
    updatedAt: now,
  }
  const batch = writeBatch(db)
  batch.set(doc(db, 'boards', boardId), board)
  batch.set(doc(db, 'boards', boardId, 'members', uid), identityFields(uid, identity, 'owner', now))
  batch.set(doc(db, 'users', uid, 'boardRefs', boardId), boardReferenceFields(board, 'owner'))
  seedData.areas.forEach((area) => batch.set(doc(db, 'boards', boardId, 'areas', area.id), area))
  await batch.commit()
  return boardId
}

export function subscribeToBoardMembers(
  boardId: string,
  onData: (members: BoardMember[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const { db } = servicesOrThrow()
  return onSnapshot(collection(db, 'boards', boardId, 'members'), (snapshot) => {
    onData(snapshot.docs.map((item) => memberFromDocument(item.id, item.data())))
  }, onError)
}

export async function createBoardInvite(board: TaskBoard) {
  const { db } = servicesOrThrow()
  if (board.type !== 'shared' || board.role !== 'owner') throw new Error('Only shared board owners can invite members.')
  const id = crypto.randomUUID().replaceAll('-', '')
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + INVITE_LIFETIME_DAYS)
  await setDoc(doc(db, 'boardInvites', id), {
    id,
    boardId: board.id,
    boardName: board.name,
    createdBy: board.ownerId,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
  })
  return { id, expiresAt }
}

export async function getBoardInvite(inviteId: string): Promise<BoardInvite> {
  const { db } = servicesOrThrow()
  const snapshot = await getDoc(doc(db, 'boardInvites', inviteId))
  if (!snapshot.exists()) throw new Error('This invitation is invalid or has been revoked.')
  const data = snapshot.data()
  const expiresAt = data.expiresAt instanceof Timestamp ? data.expiresAt.toDate() : new Date(0)
  if (expiresAt.getTime() <= Date.now()) throw new Error('This invitation has expired.')
  return {
    id: inviteId,
    boardId: String(data.boardId ?? ''),
    boardName: String(data.boardName ?? 'Shared board'),
    createdBy: String(data.createdBy ?? ''),
    expiresAt,
  }
}

export async function acceptBoardInvite(uid: string, identity: MemberIdentity, inviteId: string) {
  const { db } = servicesOrThrow()
  const invite = await getBoardInvite(inviteId)
  const now = new Date().toISOString()
  const board: Omit<TaskBoard, 'role'> = {
    id: invite.boardId,
    name: invite.boardName,
    type: 'shared',
    ownerId: invite.createdBy,
    createdAt: now,
    updatedAt: now,
  }

  const batch = writeBatch(db)
  batch.set(doc(db, 'boards', board.id, 'members', uid), {
    ...identityFields(uid, identity, 'member', now),
    inviteId,
  })
  batch.set(doc(db, 'users', uid, 'boardRefs', board.id), boardReferenceFields(board, 'member'))
  await batch.commit()
  return board.id
}

export async function leaveBoard(uid: string, boardId: string) {
  const { db } = servicesOrThrow()
  await clearTaskAssignments(db, boardId, uid)
  const batch = writeBatch(db)
  batch.delete(doc(db, 'boards', boardId, 'members', uid))
  batch.delete(doc(db, 'users', uid, 'boardRefs', boardId))
  await batch.commit()
}

export async function removeBoardMember(boardId: string, memberUid: string) {
  const { db } = servicesOrThrow()
  const memberReference = doc(db, 'boards', boardId, 'members', memberUid)
  const member = await getDoc(memberReference)
  await clearTaskAssignments(db, boardId, memberUid)
  const batch = writeBatch(db)
  batch.delete(memberReference)
  batch.delete(doc(db, 'users', memberUid, 'boardRefs', boardId))
  const inviteId = member.exists() ? member.data().inviteId : undefined
  if (typeof inviteId === 'string' && inviteId) batch.delete(doc(db, 'boardInvites', inviteId))
  await batch.commit()
}

async function clearTaskAssignments(db: Firestore, boardId: string, memberUid: string) {
  const assignedTasks = await getDocs(query(
    collection(db, 'boards', boardId, 'tasks'),
    where('assigneeId', '==', memberUid),
  ))

  for (let start = 0; start < assignedTasks.docs.length; start += MAX_BATCH_OPERATIONS) {
    const batch = writeBatch(db)
    assignedTasks.docs.slice(start, start + MAX_BATCH_OPERATIONS).forEach((task) => {
      batch.update(task.ref, { assigneeId: deleteField(), assigneeName: deleteField() })
    })
    await batch.commit()
  }
}

export async function removeStaleBoardReference(uid: string, boardId: string) {
  const { db } = servicesOrThrow()
  await deleteDoc(doc(db, 'users', uid, 'boardRefs', boardId))
}
