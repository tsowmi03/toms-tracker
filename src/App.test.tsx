// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const trackerState = vi.hoisted(() => ({ ready: false }))

vi.mock('./auth/AuthContext', () => ({
  useAuth: () => ({
    configured: true,
    signUpEnabled: false,
    user: { uid: 'owner-uid', email: 'owner@example.com' },
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
    updateData: () => undefined,
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

    expect(container.textContent).toContain('Life board')
    expect(container.textContent).toContain('Drop a task here')
  })
})
