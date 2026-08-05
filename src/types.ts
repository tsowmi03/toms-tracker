export type Status = 'inbox' | 'todo' | 'progress' | 'waiting' | 'done'
export type Priority = 'none' | 'low' | 'medium' | 'high' | 'urgent'
export type View = 'today' | 'board' | 'inbox'

export interface Area {
  id: string
  name: string
  color: string
}

export interface Task {
  id: string
  title: string
  description: string
  status: Status
  priority: Priority
  areaId: string
  dueDate?: string
  tags: string[]
  isFocus: boolean
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface TrackerData {
  tasks: Task[]
  areas: Area[]
  version: 1
}
