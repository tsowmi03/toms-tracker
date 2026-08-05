// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { hasStoredData, loadData, saveData } from './storage'
import type { TrackerData } from './types'

function workspace(title: string): TrackerData {
  return {
    version: 1,
    areas: [{ id: 'personal', name: 'Personal', color: '#77776e' }],
    tasks: [{
      id: `${title}-task`,
      title,
      description: '',
      status: 'todo',
      priority: 'none',
      areaId: 'personal',
      tags: [],
      isFocus: false,
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    }],
  }
}

beforeEach(() => localStorage.clear())

describe('browser workspace isolation', () => {
  it('stores independent mirrors for different signed-in users', () => {
    const alice = workspace('Alice private')
    const bob = workspace('Bob private')

    saveData(alice, 'alice-uid')
    saveData(bob, 'bob-uid')

    expect(loadData('alice-uid')).toEqual(alice)
    expect(loadData('bob-uid')).toEqual(bob)
    expect(hasStoredData('alice-uid')).toBe(true)
    expect(hasStoredData('bob-uid')).toBe(true)
  })

  it('keeps unauthenticated local mode separate from every account', () => {
    const local = workspace('Local only')
    const signedIn = workspace('Signed in')

    saveData(local)
    saveData(signedIn, 'user-uid')

    expect(loadData()).toEqual(local)
    expect(loadData('user-uid')).toEqual(signedIn)
    expect(hasStoredData('new-user-uid')).toBe(false)
  })
})
