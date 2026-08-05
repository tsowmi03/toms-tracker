import { localDateKey } from './board'
import type { TrackerData } from './types'

function dateFromToday(offset: number) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return localDateKey(date)
}

const now = new Date().toISOString()

export const seedData: TrackerData = {
  version: 1,
  areas: [
    { id: 'personal', name: 'Personal', color: '#7357d6' },
    { id: 'work', name: 'Work', color: '#e65f31' },
    { id: 'study', name: 'Study', color: '#2f7d61' },
    { id: 'home', name: 'Home', color: '#c8941f' },
  ],
  tasks: [
    {
      id: 'welcome-plan',
      title: 'Plan the week ahead',
      description: 'Choose the few things that would make this week feel successful.',
      status: 'todo',
      priority: 'high',
      areaId: 'personal',
      dueDate: dateFromToday(0),
      tags: ['weekly'],
      isFocus: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'welcome-focus',
      title: 'Finish one meaningful work block',
      description: 'Protect 60–90 minutes and close everything else.',
      status: 'progress',
      priority: 'medium',
      areaId: 'work',
      dueDate: dateFromToday(0),
      tags: ['focus'],
      isFocus: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'welcome-book',
      title: 'Book the appointment',
      description: 'Waiting for the office to confirm a suitable time.',
      status: 'waiting',
      priority: 'medium',
      areaId: 'personal',
      dueDate: dateFromToday(2),
      tags: ['admin'],
      isFocus: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'welcome-reading',
      title: 'Read this week’s material',
      description: '',
      status: 'todo',
      priority: 'low',
      areaId: 'study',
      dueDate: dateFromToday(3),
      tags: [],
      isFocus: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'welcome-capture',
      title: 'Try capturing your next thought here',
      description: 'Inbox items are deliberately unplanned. Triage them when you are ready.',
      status: 'inbox',
      priority: 'none',
      areaId: 'personal',
      tags: [],
      isFocus: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'welcome-done',
      title: 'Set up my personal tracker',
      description: '',
      status: 'done',
      priority: 'high',
      areaId: 'personal',
      tags: ['setup'],
      isFocus: false,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    },
  ],
}
