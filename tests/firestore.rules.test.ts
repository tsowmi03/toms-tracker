import fs from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const projectId = 'demo-toms-tracker'
const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
const ownerUid = rules.match(/request\.auth\.uid == '([^']+)'/)?.[1]
if (!ownerUid || ownerUid === 'REPLACE_WITH_FIREBASE_OWNER_UID') {
  throw new Error('firestore.rules must contain the configured owner UID')
}
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

describe('Firestore ownership rules', () => {
  it('allows the owner profile marker but prevents deletion or unexpected fields', async () => {
    const database = environment.authenticatedContext(ownerUid).firestore()
    const reference = doc(database, 'users', ownerUid)
    await assertSucceeds(setDoc(reference, {
      schemaVersion: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }))
    await assertFails(setDoc(reference, { schemaVersion: 1, role: 'admin' }))
    await assertFails(deleteDoc(reference))
  })

  it('allows the configured owner to create and read a valid task', async () => {
    const database = environment.authenticatedContext(ownerUid).firestore()
    const reference = doc(database, 'users', ownerUid, 'tasks', validTask.id)
    await assertSucceeds(setDoc(reference, validTask))
    await assertSucceeds(getDoc(reference))
  })

  it('denies unauthenticated access', async () => {
    const database = environment.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(database, 'users', ownerUid, 'tasks', validTask.id)))
  })

  it('denies a different signed-in account', async () => {
    const database = environment.authenticatedContext('someone-else').firestore()
    await assertFails(setDoc(doc(database, 'users', 'someone-else', 'tasks', validTask.id), validTask))
    await assertFails(getDoc(doc(database, 'users', ownerUid, 'tasks', validTask.id)))
  })

  it('denies invalid task statuses and unexpected fields', async () => {
    const database = environment.authenticatedContext(ownerUid).firestore()
    const reference = doc(database, 'users', ownerUid, 'tasks', validTask.id)
    await assertFails(setDoc(reference, { ...validTask, status: 'someday' }))
    await assertFails(setDoc(reference, { ...validTask, ownerId: ownerUid }))
  })

  it('prevents a task document from claiming another id', async () => {
    const database = environment.authenticatedContext(ownerUid).firestore()
    await assertFails(setDoc(doc(database, 'users', ownerUid, 'tasks', 'other-id'), validTask))
  })
})
