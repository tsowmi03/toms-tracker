// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const trackerState = vi.hoisted(() => ({ ready: false, updateData: vi.fn() }))

vi.mock('./auth/AuthContext', () => ({
  useAuth: () => ({
    configured: true,
    signUpEnabled: false,
    user: { uid: 'user-uid', email: 'user@example.com' },
    loading: false,
    error: null,
    signOut: async () => undefined,
  }),
}))

vi.mock('./data/useTrackerData', () => ({
  useTrackerData: () => ({
    data: {
      version: 1,
      areas: [{ id: 'personal', name: 'Personal', color: '#77776e' }],
      tasks: [],
    },
    boards: [{
      id: 'personal-user-uid',
      name: 'My tasks',
      type: 'personal',
      ownerId: 'user-uid',
      role: 'owner',
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    }],
    activeBoard: {
      id: 'personal-user-uid',
      name: 'My tasks',
      type: 'personal',
      ownerId: 'user-uid',
      role: 'owner',
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    },
    selectBoard: () => undefined,
    addBoard: async () => 'board-id',
    joinBoard: async () => 'board-id',
    updateData: trackerState.updateData,
    ready: trackerState.ready,
    syncState: 'synced',
    error: null,
  }),
}))

let root: Root | undefined

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = undefined
  document.body.innerHTML = ''
  trackerState.ready = false
  trackerState.updateData.mockReset()
  localStorage.clear()
  delete document.documentElement.dataset.theme
  document.documentElement.style.removeProperty('color-scheme')
})

describe('authenticated workspace', () => {
  it('moves from the loading screen to the board without changing hook order', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => root?.render(<App />))
    expect(container.textContent).toContain('Loading your workspace')

    trackerState.ready = true
    await act(async () => root?.render(<App />))

    expect(container.textContent).toContain('My tasks')
    expect(container.textContent).toContain('Drop a task here')
  })

  it('persists dark mode from the top-bar control', async () => {
    trackerState.ready = true
    const container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => root?.render(<App />))
    const toggle = container.querySelector<HTMLButtonElement>('[aria-label="Switch to dark mode"]')

    expect(toggle).not.toBeNull()
    await act(async () => toggle?.click())

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('toms-tracker-theme-v1')).toBe('dark')
    expect(container.querySelector('[aria-label="Switch to light mode"]')).not.toBeNull()
  })

  it('adds a custom area to the current board', async () => {
    trackerState.ready = true
    const container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => root?.render(<App />))
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Add area"]')?.click())

    const input = container.querySelector<HTMLInputElement>('#area-name')
    expect(input).not.toBeNull()
    await act(async () => {
      if (!input) return
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Health')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => input?.closest('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))

    expect(trackerState.updateData).toHaveBeenCalledTimes(1)
    const updater = trackerState.updateData.mock.calls[0][0]
    const updated = updater({
      version: 1,
      areas: [{ id: 'personal', name: 'Personal', color: '#77776e' }],
      tasks: [],
    })
    expect(updated.areas).toEqual([
      { id: 'personal', name: 'Personal', color: '#77776e' },
      expect.objectContaining({ name: 'Health', color: '#ef6334' }),
    ])
    expect(container.querySelector('#area-name')).toBeNull()
  })
})
