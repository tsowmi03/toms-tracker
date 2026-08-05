import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import { getFirebaseServices } from '../firebase'
import type { Area, Task, TrackerData } from '../types'

const SCHEMA_VERSION = 1
const MAX_BATCH_OPERATIONS = 450

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
    createdAt: String(data.createdAt ?? new Date().toISOString()),
    updatedAt: String(data.updatedAt ?? new Date().toISOString()),
    completedAt: data.completedAt ? String(data.completedAt) : undefined,
  }
}

function areaFromDocument(id: string, data: DocumentData): Area {
  return { id, name: String(data.name ?? 'Untitled'), color: String(data.color ?? '#77776e') }
}

export async function initialiseWorkspace(uid: string, initialData: TrackerData) {
  const { db } = servicesOrThrow()
  const userReference = doc(db, 'users', uid)
  const existing = await getDoc(userReference)
  if (existing.exists()) return

  const operations: Array<(batch: ReturnType<typeof writeBatch>) => void> = []
  for (const area of initialData.areas) {
    operations.push((batch) => batch.set(doc(db, 'users', uid, 'areas', area.id), area))
  }
  for (const task of initialData.tasks) {
    operations.push((batch) => batch.set(doc(db, 'users', uid, 'tasks', task.id), stripUndefined(task)))
  }
  await commitOperations(db, operations)
  await setDoc(userReference, {
    schemaVersion: SCHEMA_VERSION,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

async function commitOperations(db: Firestore, operations: Array<(batch: ReturnType<typeof writeBatch>) => void>) {
  for (let start = 0; start < operations.length; start += MAX_BATCH_OPERATIONS) {
    const batch = writeBatch(db)
    operations.slice(start, start + MAX_BATCH_OPERATIONS).forEach((operation) => operation(batch))
    await batch.commit()
  }
}

export function subscribeToWorkspace(
  uid: string,
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
    collection(db, 'users', uid, 'tasks'),
    { includeMetadataChanges: true },
    (snapshot) => {
      tasks = snapshot.docs.map((item) => taskFromDocument(item.id, item.data()))
      taskWritesPending = snapshot.metadata.hasPendingWrites
      publish()
    },
    onError,
  )
  const unsubscribeAreas = onSnapshot(
    collection(db, 'users', uid, 'areas'),
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

export async function persistWorkspaceChanges(uid: string, previous: TrackerData, next: TrackerData) {
  const { db } = servicesOrThrow()
  const operations: Array<(batch: ReturnType<typeof writeBatch>) => void> = []
  const previousTasks = new Map(previous.tasks.map((task) => [task.id, task]))
  const nextTasks = new Map(next.tasks.map((task) => [task.id, task]))
  const previousAreas = new Map(previous.areas.map((area) => [area.id, area]))
  const nextAreas = new Map(next.areas.map((area) => [area.id, area]))

  nextTasks.forEach((task, id) => {
    if (valuesDiffer(previousTasks.get(id), task)) {
      operations.push((batch) => batch.set(doc(db, 'users', uid, 'tasks', id), stripUndefined(task)))
    }
  })
  previousTasks.forEach((_, id) => {
    if (!nextTasks.has(id)) operations.push((batch) => batch.delete(doc(db, 'users', uid, 'tasks', id)))
  })
  nextAreas.forEach((area, id) => {
    if (valuesDiffer(previousAreas.get(id), area)) {
      operations.push((batch) => batch.set(doc(db, 'users', uid, 'areas', id), area))
    }
  })
  previousAreas.forEach((_, id) => {
    if (!nextAreas.has(id)) operations.push((batch) => batch.delete(doc(db, 'users', uid, 'areas', id)))
  })

  if (!operations.length) return
  operations.push((batch) => batch.set(doc(db, 'users', uid), {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: serverTimestamp(),
  }, { merge: true }))
  await commitOperations(db, operations)
}
