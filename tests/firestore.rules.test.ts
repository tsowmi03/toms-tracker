import fs from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const projectId = 'demo-toms-tracker'
const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
const aliceUid = 'alice-uid'
const bobUid = 'bob-uid'
const charlieUid = 'charlie-uid'
const boardId = 'shared-board'
let environment: RulesTestEnvironment

const now = '2026-08-05T00:00:00.000Z'
const validTask = {
  id: 'task-one',
  title: 'Shared task',
  description: '',
  status: 'todo',
  priority: 'high',
  areaId: 'personal',
  tags: ['shared'],
  isFocus: true,
  createdAt: now,
  updatedAt: now,
}

function boardFields(id: string, ownerId: string, type: 'personal' | 'shared' = 'shared') {
  return { id, name: type === 'shared' ? 'Household' : 'My tasks', type, ownerId, createdAt: now, updatedAt: now }
}

function memberFields(uid: string, role: 'owner' | 'member', inviteId?: string) {
  return {
    uid,
    role,
    displayName: uid === aliceUid ? 'Alice' : uid === bobUid ? 'Bob' : 'Charlie',
    email: `${uid}@example.com`,
    joinedAt: now,
    ...(inviteId ? { inviteId } : {}),
  }
}

function referenceFields(id: string, ownerId: string, role: 'owner' | 'member', type: 'personal' | 'shared' = 'shared') {
  const { id: _boardDocumentId, ...board } = boardFields(id, ownerId, type)
  return { boardId: id, ...board, role }
}

async function createOwnedBoard(database: Firestore, ownerId: string, id = boardId, type: 'personal' | 'shared' = 'shared') {
  const batch = writeBatch(database)
  batch.set(doc(database, 'boards', id), boardFields(id, ownerId, type))
  batch.set(doc(database, 'boards', id, 'members', ownerId), memberFields(ownerId, 'owner'))
  batch.set(doc(database, 'users', ownerId, 'boardRefs', id), referenceFields(id, ownerId, 'owner', type))
  await assertSucceeds(batch.commit())
}

async function createInvite(database: Firestore, id = 'invite-token', targetBoardId = boardId) {
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await assertSucceeds(setDoc(doc(database, 'boardInvites', id), {
    id,
    boardId: targetBoardId,
    boardName: 'Household',
    createdBy: aliceUid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(future),
  }))
}

async function acceptInvite(database: Firestore, uid: string, inviteId = 'invite-token') {
  const batch = writeBatch(database)
  batch.set(doc(database, 'boards', boardId, 'members', uid), memberFields(uid, 'member', inviteId))
  batch.set(doc(database, 'users', uid, 'boardRefs', boardId), referenceFields(boardId, aliceUid, 'member'))
  await assertSucceeds(batch.commit())
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { rules } })
})

beforeEach(async () => environment.clearFirestore())
afterAll(async () => environment.cleanup())

describe('Firestore task-board membership rules', () => {
  it('keeps legacy per-user data private during migration', async () => {
    const aliceDatabase = environment.authenticatedContext(aliceUid).firestore()
    const bobDatabase = environment.authenticatedContext(bobUid).firestore()

    await assertSucceeds(setDoc(doc(aliceDatabase, 'users', aliceUid), {
      schemaVersion: 2,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }))
    await assertSucceeds(setDoc(doc(aliceDatabase, 'users', aliceUid, 'tasks', validTask.id), validTask))
    await assertSucceeds(getDoc(doc(aliceDatabase, 'users', aliceUid, 'tasks', validTask.id)))
    await assertFails(getDoc(doc(bobDatabase, 'users', aliceUid, 'tasks', validTask.id)))
    await assertFails(getDocs(collection(bobDatabase, 'users', aliceUid, 'tasks')))
  })

  it('lets a user atomically create personal and shared boards', async () => {
    const database = environment.authenticatedContext(aliceUid).firestore()
    await createOwnedBoard(database, aliceUid)
    await createOwnedBoard(database, aliceUid, 'personal-board', 'personal')

    await assertSucceeds(getDoc(doc(database, 'boards', boardId)))
    await assertSucceeds(getDocs(collection(database, 'boards', boardId, 'members')))
    await assertSucceeds(setDoc(doc(database, 'boards', boardId, 'tasks', validTask.id), validTask))
    await assertSucceeds(setDoc(doc(database, 'boards', 'personal-board', 'tasks', validTask.id), validTask))

    const rollbackMirror = writeBatch(database)
    rollbackMirror.set(doc(database, 'boards', 'personal-board', 'tasks', 'mirrored-task'), { ...validTask, id: 'mirrored-task' })
    rollbackMirror.set(doc(database, 'users', aliceUid, 'tasks', 'mirrored-task'), { ...validTask, id: 'mirrored-task' })
    await assertSucceeds(rollbackMirror.commit())
  })

  it('blocks every non-member from a board and its collections', async () => {
    const aliceDatabase = environment.authenticatedContext(aliceUid).firestore()
    const bobDatabase = environment.authenticatedContext(bobUid).firestore()
    await createOwnedBoard(aliceDatabase, aliceUid)
    await assertSucceeds(setDoc(doc(aliceDatabase, 'boards', boardId, 'tasks', validTask.id), validTask))

    await assertFails(getDoc(doc(bobDatabase, 'boards', boardId)))
    await assertFails(getDoc(doc(bobDatabase, 'boards', boardId, 'tasks', validTask.id)))
    await assertFails(getDocs(collection(bobDatabase, 'boards', boardId, 'tasks')))
    await assertFails(setDoc(doc(bobDatabase, 'boards', boardId, 'tasks', 'bob-task'), { ...validTask, id: 'bob-task' }))
  })

  it('lets an invited user join and collaborate on tasks', async () => {
    const aliceDatabase = environment.authenticatedContext(aliceUid).firestore()
    const bobDatabase = environment.authenticatedContext(bobUid).firestore()
    await createOwnedBoard(aliceDatabase, aliceUid)
    await createInvite(aliceDatabase)

    await assertSucceeds(getDoc(doc(bobDatabase, 'boardInvites', 'invite-token')))
    await acceptInvite(bobDatabase, bobUid)
    await assertSucceeds(getDoc(doc(bobDatabase, 'boards', boardId)))
    await assertSucceeds(setDoc(doc(bobDatabase, 'boards', boardId, 'tasks', 'bob-task'), { ...validTask, id: 'bob-task' }))
    await assertSucceeds(getDocs(collection(aliceDatabase, 'boards', boardId, 'tasks')))
  })

  it('lets a member whose board pointer went missing restore it on its own', async () => {
    const aliceDatabase = environment.authenticatedContext(aliceUid).firestore()
    const bobDatabase = environment.authenticatedContext(bobUid).firestore()
    await createOwnedBoard(aliceDatabase, aliceUid)
    await createInvite(aliceDatabase)
    await acceptInvite(bobDatabase, bobUid)

    // The pointer is lost while the membership survives, which is the state a
    // transient permission-denied used to leave behind.
    await assertSucceeds(deleteDoc(doc(bobDatabase, 'users', bobUid, 'boardRefs', boardId)))
    await assertSucceeds(getDoc(doc(bobDatabase, 'boards', boardId, 'members', bobUid)))

    // Rewriting the surviving membership is still refused, so the repair must
    // restore the pointer by itself.
    await assertFails(setDoc(doc(bobDatabase, 'boards', boardId, 'members', bobUid), memberFields(bobUid, 'member', 'invite-token')))
    await assertSucceeds(setDoc(doc(bobDatabase, 'users', bobUid, 'boardRefs', boardId), referenceFields(boardId, aliceUid, 'member')))
    await assertSucceeds(getDoc(doc(bobDatabase, 'boards', boardId)))
  })

  it('does not let an invite grant access to the wrong user role or board', async () => {
    const aliceDatabase = environment.authenticatedContext(aliceUid).firestore()
    const bobDatabase = environment.authenticatedContext(bobUid).firestore()
    await createOwnedBoard(aliceDatabase, aliceUid)
    await createInvite(aliceDatabase)

    await assertFails(setDoc(doc(bobDatabase, 'boards', boardId, 'members', bobUid), memberFields(bobUid, 'owner', 'invite-token')))
    await assertFails(setDoc(doc(bobDatabase, 'boards', 'other-board', 'members', bobUid), memberFields(bobUid, 'member', 'invite-token')))
    await assertFails(setDoc(doc(bobDatabase, 'boards', boardId, 'members', charlieUid), memberFields(charlieUid, 'member', 'invite-token')))
  })

  it('keeps invite tokens unlistable and prevents personal-board invites', async () => {
    const aliceDatabase = environment.authenticatedContext(aliceUid).firestore()
    const bobDatabase = environment.authenticatedContext(bobUid).firestore()
    const publicDatabase = environment.unauthenticatedContext().firestore()
    await createOwnedBoard(aliceDatabase, aliceUid)
    await createOwnedBoard(aliceDatabase, aliceUid, 'personal-board', 'personal')
    await createInvite(aliceDatabase)

    await assertFails(getDocs(collection(bobDatabase, 'boardInvites')))
    await assertFails(getDoc(doc(publicDatabase, 'boardInvites', 'invite-token')))
    await assertFails(setDoc(doc(aliceDatabase, 'boardInvites', 'personal-invite'), {
      id: 'personal-invite',
      boardId: 'personal-board',
      boardName: 'My tasks',
      createdBy: aliceUid,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    }))
  })

  it('does not accept an expired invite', async () => {
    const aliceDatabase = environment.authenticatedContext(aliceUid).firestore()
    const bobDatabase = environment.authenticatedContext(bobUid).firestore()
    await createOwnedBoard(aliceDatabase, aliceUid)
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'boardInvites', 'expired-invite'), {
        id: 'expired-invite',
        boardId,
        boardName: 'Household',
        createdBy: aliceUid,
        createdAt: Timestamp.fromDate(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)),
        expiresAt: Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
      })
    })

    const joining = writeBatch(bobDatabase)
    joining.set(doc(bobDatabase, 'boards', boardId, 'members', bobUid), memberFields(bobUid, 'member', 'expired-invite'))
    joining.set(doc(bobDatabase, 'users', bobUid, 'boardRefs', boardId), referenceFields(boardId, aliceUid, 'member'))
    await assertFails(joining.commit())
  })

  it('lets members leave and owners remove members without affecting the board', async () => {
    const aliceDatabase = environment.authenticatedContext(aliceUid).firestore()
    const bobDatabase = environment.authenticatedContext(bobUid).firestore()
    await createOwnedBoard(aliceDatabase, aliceUid)
    await createInvite(aliceDatabase)
    await acceptInvite(bobDatabase, bobUid)

    await assertFails(deleteDoc(doc(bobDatabase, 'boards', boardId, 'members', aliceUid)))
    await assertFails(setDoc(doc(bobDatabase, 'boards', boardId), { ...boardFields(boardId, aliceUid), name: 'Renamed by Bob' }))

    const removal = writeBatch(aliceDatabase)
    removal.delete(doc(aliceDatabase, 'boards', boardId, 'members', bobUid))
    removal.delete(doc(aliceDatabase, 'users', bobUid, 'boardRefs', boardId))
    removal.delete(doc(aliceDatabase, 'boardInvites', 'invite-token'))
    await assertSucceeds(removal.commit())
    await assertFails(getDoc(doc(bobDatabase, 'boards', boardId)))
    await assertSucceeds(getDoc(doc(aliceDatabase, 'boards', boardId)))

    const rejoin = writeBatch(bobDatabase)
    rejoin.set(doc(bobDatabase, 'boards', boardId, 'members', bobUid), memberFields(bobUid, 'member', 'invite-token'))
    rejoin.set(doc(bobDatabase, 'users', bobUid, 'boardRefs', boardId), referenceFields(boardId, aliceUid, 'member'))
    await assertFails(rejoin.commit())
  })

  it('allows a non-owner member to leave their shared board', async () => {
    const aliceDatabase = environment.authenticatedContext(aliceUid).firestore()
    const bobDatabase = environment.authenticatedContext(bobUid).firestore()
    await createOwnedBoard(aliceDatabase, aliceUid)
    await createInvite(aliceDatabase)
    await acceptInvite(bobDatabase, bobUid)

    const leaving = writeBatch(bobDatabase)
    leaving.delete(doc(bobDatabase, 'boards', boardId, 'members', bobUid))
    leaving.delete(doc(bobDatabase, 'users', bobUid, 'boardRefs', boardId))
    await assertSucceeds(leaving.commit())
    await assertFails(getDoc(doc(bobDatabase, 'boards', boardId)))
  })

  it('rejects invalid tasks and unexpected board fields', async () => {
    const database = environment.authenticatedContext(aliceUid).firestore()
    const bobDatabase = environment.authenticatedContext(bobUid).firestore()
    await createOwnedBoard(database, aliceUid)
    await createInvite(database)
    await acceptInvite(bobDatabase, bobUid)

    await assertFails(setDoc(doc(database, 'boards', boardId, 'tasks', validTask.id), { ...validTask, status: 'someday' }))
    await assertFails(setDoc(doc(database, 'boards', boardId, 'tasks', 'other-id'), validTask))
    await assertSucceeds(setDoc(doc(database, 'boards', boardId, 'tasks', 'assigned-task'), { ...validTask, id: 'assigned-task', assigneeId: bobUid, assigneeName: 'Bob' }))
    await assertFails(setDoc(doc(database, 'boards', boardId, 'tasks', 'invalid-assignee'), { ...validTask, id: 'invalid-assignee', assigneeId: bobUid }))
    await assertFails(setDoc(doc(database, 'boards', boardId, 'tasks', 'non-member-assignee'), { ...validTask, id: 'non-member-assignee', assigneeId: charlieUid, assigneeName: 'Charlie' }))
    await assertFails(setDoc(doc(database, 'boards', 'bad-board'), { ...boardFields('bad-board', aliceUid), memberIds: [aliceUid] }))
  })
})
