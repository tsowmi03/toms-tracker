import { describe, expect, it } from 'vitest'
import { filterTasks, formatDueDate, isOverdue, localDateKey, moveTask } from './board'
import type { Task } from './types'

const task: Task = {
  id: 'one',
  title: 'Book dentist',
  description: 'Call the city practice',
  status: 'todo',
  priority: 'high',
  areaId: 'personal',
  dueDate: '2026-08-05',
  tags: ['admin'],
  isFocus: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

describe('board utilities', () => {
  it('formats local date keys without UTC drift', () => {
    expect(localDateKey(new Date(2026, 7, 5, 23, 30))).toBe('2026-08-05')
  })

  it('moves a task and records completion', () => {
    const result = moveTask([task], 'one', 'done', '2026-08-05T10:00:00.000Z')[0]
    expect(result.status).toBe('done')
    expect(result.completedAt).toBe('2026-08-05T10:00:00.000Z')
  })

  it('clears completion when work is reopened', () => {
    const result = moveTask([{ ...task, status: 'done', completedAt: '2026-08-05T10:00:00.000Z' }], 'one', 'progress')[0]
    expect(result.completedAt).toBeUndefined()
  })

  it('matches titles, descriptions, tags, area, and priority', () => {
    expect(filterTasks([task], { query: 'practice' })).toHaveLength(1)
    expect(filterTasks([task], { query: 'admin' })).toHaveLength(1)
    expect(filterTasks([task], { areaId: 'work' })).toHaveLength(0)
    expect(filterTasks([task], { priority: 'high' })).toHaveLength(1)
  })

  it('does not treat completed work as overdue', () => {
    expect(isOverdue(task, '2026-08-06')).toBe(true)
    expect(isOverdue({ ...task, status: 'done' }, '2026-08-06')).toBe(false)
  })

  it('uses friendly near-term dates', () => {
    expect(formatDueDate('2026-08-05', '2026-08-05')).toBe('Today')
    expect(formatDueDate('2026-08-06', '2026-08-05')).toBe('Tomorrow')
  })
})
