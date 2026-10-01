export type Status = 'inbox' | 'todo' | 'progress' | 'waiting' | 'done'
export type Priority = 'none' | 'low' | 'medium' | 'high' | 'urgent'
export type View = 'today' | 'board' | 'inbox' | 'meetings'
export type TaskSort = 'priority' | 'dueDate' | 'createdAt'
export type BoardType = 'personal' | 'shared'
export type BoardRole = 'owner' | 'member'

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
  assigneeId?: string
  assigneeName?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface MeetingDecision {
  id: string
  text: string
  reason: string
}

export interface MeetingQuestion {
  id: string
  text: string
  owner: string
  resolved: boolean
}

export interface Meeting {
  id: string
  title: string
  date: string
  participants: string
  series: string
  agenda: string
  notes: string
  decisions: MeetingDecision[]
  questions: MeetingQuestion[]
  actionTaskIds: string[]
  nextMeetingDate?: string
  previousMeetingId?: string
  createdAt: string
  updatedAt: string
}

export interface TrackerData {
  tasks: Task[]
  areas: Area[]
  meetings?: Meeting[]
  version: 1
}

export interface TaskBoard {
  id: string
  name: string
  type: BoardType
  ownerId: string
  role: BoardRole
  createdAt: string
  updatedAt: string
}

export interface BoardMember {
  uid: string
  role: BoardRole
  displayName: string
  email: string
  joinedAt: string
}

export interface BoardInvite {
  id: string
  boardId: string
  boardName: string
  createdBy: string
  expiresAt: Date
}
