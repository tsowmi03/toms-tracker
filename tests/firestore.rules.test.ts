import fs from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const projectId = 'demo-toms-tracker'
const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
const aliceUid = 'alice-uid'
const bobUid = 'bob-uid'
let environment: RulesTestEnvironment

const validTask = {
  id: 'task-one',
  title: 'Private task',
  description: '',
  status: 'todo',
  priority: 'high',
  areaId: 'personal',
  tags: ['private'],
  isFocus: true,
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  })
})

beforeEach(async () => environment.clearFirestore())
afterAll(async () => environment.cleanup())

describe('Firestore per-user isolation rules', () => {
  it('allows each user to initialise and use their own workspace', async () => {
    const aliceDatabase = environment.authenticatedContext(aliceUid).firestore()
    const bobDatabase = environment.authenticatedContext(bobUid).firestore()

    await assertSucceeds(setDoc(doc(aliceDatabase, 'users', aliceUid), {
      schemaVersion: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }))
    await assertSucceeds(setDoc(doc(bobDatabase, 'users', bobUid), {
      schemaVersion: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }))
    await assertSucceeds(setDoc(doc(aliceDatabase, 'users', aliceUid, 'tasks', validTask.id), validTask))
    await assertSucceeds(setDoc(doc(bobDatabase, 'users', bobUid, 'tasks', validTask.id), validTask))
    await assertSucceeds(getDoc(doc(aliceDatabase, 'users', aliceUid, 'tasks', validTask.id)))
    await assertSucceeds(getDoc(doc(bobDatabase, 'users', bobUid, 'tasks', validTask.id)))
    await assertSucceeds(getDocs(collection(aliceDatabase, 'users', aliceUid, 'tasks')))
    await assertSucceeds(getDocs(collection(bobDatabase, 'users', bobUid, 'tasks')))
  })

  it('prevents profile deletion and unexpected profile fields', async () => {
    const database = environment.authenticatedContext(aliceUid).firestore()
    const reference = doc(database, 'users', aliceUid)
    await assertSucceeds(setDoc(reference, {
      schemaVersion: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }))
    await assertFails(setDoc(reference, { schemaVersion: 1, role: 'admin' }))
    await assertFails(deleteDoc(reference))
  })

  it('denies unauthenticated access', async () => {
    const database = environment.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(database, 'users', aliceUid, 'tasks', validTask.id)))
  })

  it('denies all cross-user reads and writes', async () => {
    const aliceDatabase = environment.authenticatedContext(aliceUid).firestore()
    const bobDatabase = environment.authenticatedContext(bobUid).firestore()

    await assertFails(getDoc(doc(aliceDatabase, 'users', bobUid)))
    await assertFails(getDoc(doc(bobDatabase, 'users', aliceUid, 'tasks', validTask.id)))
    await assertFails(getDocs(collection(aliceDatabase, 'users', bobUid, 'tasks')))
    await assertFails(getDocs(collection(bobDatabase, 'users', aliceUid, 'tasks')))
    await assertFails(setDoc(doc(aliceDatabase, 'users', bobUid, 'tasks', validTask.id), validTask))
    await assertFails(setDoc(doc(bobDatabase, 'users', aliceUid, 'tasks', validTask.id), validTask))
  })

  it('denies invalid task statuses and unexpected fields', async () => {
    const database = environment.authenticatedContext(aliceUid).firestore()
    const reference = doc(database, 'users', aliceUid, 'tasks', validTask.id)
    await assertFails(setDoc(reference, { ...validTask, status: 'someday' }))
    await assertFails(setDoc(reference, { ...validTask, ownerId: aliceUid }))
  })

  it('prevents a task document from claiming another id', async () => {
    const database = environment.authenticatedContext(aliceUid).firestore()
    await assertFails(setDoc(doc(database, 'users', aliceUid, 'tasks', 'other-id'), validTask))
  })

  it('denies access outside the per-user workspace tree', async () => {
    const database = environment.authenticatedContext(aliceUid).firestore()
    await assertFails(setDoc(doc(database, 'public', 'task-one'), validTask))
  })
})
