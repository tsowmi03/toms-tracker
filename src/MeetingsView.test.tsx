// @vitest-environment jsdom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MeetingsView } from './MeetingsView'
import type { TrackerData } from './types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const initialData: TrackerData = {
  version: 1,
  areas: [{ id: 'work', name: 'Work', color: '#ef6334' }],
  tasks: [],
  meetings: [],
}
let root: Root | undefined
let latestData: TrackerData

function Fixture({ shared = false, startingData = initialData, onOpenTask = vi.fn() }: { shared?: boolean; startingData?: TrackerData; onOpenTask?: (task: TrackerData['tasks'][number]) => void }) {
  const [data, setData] = useState(startingData)
  latestData = data
  return <MeetingsView
    data={data}
    members={shared ? [{ uid: 'bob', role: 'member', displayName: 'Bob', email: 'bob@example.com', joinedAt: '' }] : []}
    isSharedBoard={shared}
    onChange={setData}
    onOpenTask={onOpenTask}
  />
}

function setValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null, value: string) {
  if (!element) throw new Error('Missing form field')
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')
  descriptor?.set?.call(element, value)
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

function button(container: HTMLElement, label: string) {
  const found = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent?.trim() === label)
  if (!found) throw new Error(`Missing button: ${label}`)
  return found
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = undefined
  document.body.innerHTML = ''
})

describe('meeting workflow', () => {
  it('saves decisions and questions, creates a real action task, and carries unfinished work forward', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const onOpenTask = vi.fn()
    await act(async () => root?.render(<Fixture onOpenTask={onOpenTask} />))

    await act(async () => button(container, 'New meeting').click())
    await act(async () => {
      setValue(container.querySelector('#meeting-title'), 'Weekly Tenacity catch-up')
      setValue(container.querySelector('#meeting-series'), 'Weekly operations')
      button(container, 'Add decision').click()
      button(container, 'Add question').click()
    })
    await act(async () => {
      setValue(container.querySelector('[aria-label="Decision"]'), 'Hire another tutor')
      setValue(container.querySelector('[aria-label="Decision reason"]'), 'Demand is rising')
      setValue(container.querySelector('[aria-label="Open question"]'), 'Which subjects?')
      setValue(container.querySelector('[aria-label="Question owner"]'), 'Tom')
    })
    await act(async () => container.querySelector<HTMLFormElement>('.meeting-editor')?.requestSubmit())

    expect(latestData.meetings).toHaveLength(1)
    expect(latestData.meetings?.[0].decisions[0]).toEqual(expect.objectContaining({ text: 'Hire another tutor', reason: 'Demand is rising' }))
    expect(latestData.meetings?.[0].questions[0]).toEqual(expect.objectContaining({ text: 'Which subjects?', owner: 'Tom' }))

    await act(async () => setValue(container.querySelector('.meeting-action-form input'), 'Prepare tutor advert'))
    await act(async () => container.querySelector<HTMLFormElement>('.meeting-action-form')?.requestSubmit())

    expect(latestData.tasks).toHaveLength(1)
    expect(latestData.meetings?.[0].actionTaskIds).toEqual([latestData.tasks[0].id])
    await act(async () => container.querySelector<HTMLButtonElement>('.meeting-action-row')?.click())
    expect(onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Prepare tutor advert' }))

    await act(async () => button(container, 'Next meeting').click())
    await act(async () => container.querySelector<HTMLFormElement>('.meeting-editor')?.requestSubmit())

    expect(latestData.meetings).toHaveLength(2)
    expect(latestData.meetings?.[1].previousMeetingId).toBe(latestData.meetings?.[0].id)
    expect(container.querySelector('.meeting-carryover')?.textContent).toContain('Prepare tutor advert')
    expect(container.querySelector('.meeting-carryover')?.textContent).toContain('Which subjects?')
  })

  it('requires a shared-board owner and can link an existing task', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const existingTask = {
      id: 'existing-task', title: 'Review roster', description: '', status: 'todo' as const,
      priority: 'medium' as const, areaId: 'work', tags: [], isFocus: false,
      createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    }
    await act(async () => root?.render(<Fixture shared startingData={{ ...initialData, tasks: [existingTask] }} />))
    await act(async () => button(container, 'New meeting').click())
    await act(async () => setValue(container.querySelector('#meeting-title'), 'Tutor planning'))
    await act(async () => container.querySelector<HTMLFormElement>('.meeting-editor')?.requestSubmit())
    await act(async () => setValue(container.querySelector('.meeting-action-form input'), 'Confirm availability'))

    await act(async () => container.querySelector<HTMLFormElement>('.meeting-action-form')?.requestSubmit())
    expect(latestData.tasks).toHaveLength(1)

    await act(async () => setValue(container.querySelector('.meeting-action-form select[required]'), 'bob'))
    await act(async () => container.querySelector<HTMLFormElement>('.meeting-action-form')?.requestSubmit())
    expect(latestData.tasks.find((task) => task.title === 'Confirm availability')).toEqual(expect.objectContaining({ assigneeId: 'bob', assigneeName: 'Bob' }))
    await act(async () => setValue(container.querySelector('#meeting-existing-task'), existingTask.id))
    await act(async () => button(container, 'Link').click())
    expect(latestData.meetings?.[0].actionTaskIds).toContain(existingTask.id)
    expect(latestData.tasks).toHaveLength(2)
  })
})
