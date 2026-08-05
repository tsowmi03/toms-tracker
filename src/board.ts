import type { Priority, Status, Task } from './types'

export const STATUSES: { id: Exclude<Status, 'inbox'>; label: string; description: string }[] = [
  { id: 'todo', label: 'To do', description: 'Ready when you are' },
  { id: 'progress', label: 'In progress', description: 'Keep this list short' },
  { id: 'waiting', label: 'Waiting', description: 'Blocked or with someone else' },
  { id: 'done', label: 'Done', description: 'Completed recently' },
]

export const PRIORITIES: { id: Priority; label: string }[] = [
  { id: 'none', label: 'No priority' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'urgent', label: 'Urgent' },
]

export function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function moveTask(tasks: Task[], taskId: string, status: Status, now = new Date().toISOString()) {
  return tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          status,
          updatedAt: now,
          completedAt: status === 'done' ? now : undefined,
        }
      : task,
  )
}

export function isDueToday(task: Task, today = localDateKey()) {
  return task.dueDate === today
}

export function isOverdue(task: Task, today = localDateKey()) {
  return Boolean(task.dueDate && task.dueDate < today && task.status !== 'done')
}

export function formatDueDate(dueDate?: string, today = localDateKey()) {
  if (!dueDate) return ''
  if (dueDate === today) return 'Today'

  const tomorrow = new Date(`${today}T12:00:00`)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (dueDate === localDateKey(tomorrow)) return 'Tomorrow'

  const date = new Date(`${dueDate}T12:00:00`)
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
  }).format(date)
}

export function filterTasks(
  tasks: Task[],
  options: { query?: string; areaId?: string; priority?: Priority | 'all' },
) {
  const query = options.query?.trim().toLowerCase()
  return tasks.filter((task) => {
    if (options.areaId && task.areaId !== options.areaId) return false
    if (options.priority && options.priority !== 'all' && task.priority !== options.priority) return false
    if (!query) return true
    const searchable = [task.title, task.description, ...task.tags].join(' ').toLowerCase()
    return searchable.includes(query)
  })
}
