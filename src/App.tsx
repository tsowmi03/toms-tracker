import { useEffect, useMemo, useRef, useState } from 'react'
import {
  filterTasks,
  formatDueDate,
  isDueToday,
  isOverdue,
  localDateKey,
  moveTask,
  PRIORITIES,
  STATUSES,
} from './board'
import {
  BoardIcon,
  CalendarIcon,
  CheckIcon,
  CloseIcon,
  CloudIcon,
  DownloadIcon,
  InboxIcon,
  LinkIcon,
  LockIcon,
  LogOutIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SlidersIcon,
  StarIcon,
  SunIcon,
  TodayIcon,
  UsersIcon,
} from './icons'
import { AuthScreen } from './auth/AuthScreen'
import { useAuth } from './auth/AuthContext'
import { useTrackerData, type SyncState } from './data/useTrackerData'
import {
  createBoardInvite,
  getBoardInvite,
  leaveBoard,
  removeBoardMember,
  subscribeToBoardMembers,
} from './data/trackerRepository'
import { seedData } from './seed'
import { exportData } from './storage'
import { getPreferredTheme, saveTheme, type Theme } from './theme'
import type { Area, BoardInvite, BoardMember, BoardType, Priority, Status, Task, TaskBoard, TrackerData, View } from './types'

const emptyTask = (status: Status, areaId: string): Task => {
  const now = new Date().toISOString()
  return {
    id: '',
    title: '',
    description: '',
    status,
    priority: 'none',
    areaId,
    tags: [],
    isFocus: false,
    createdAt: now,
    updatedAt: now,
  }
}

const syncLabels: Record<SyncState, string> = {
  local: 'Local mode',
  loading: 'Connecting',
  syncing: 'Syncing',
  synced: 'Synced',
  offline: 'Offline · changes queued',
  error: 'Sync needs attention',
}

function SyncIndicator({ state }: { state: SyncState }) {
  return <span className={`save-state sync-${state}`}><span />{syncLabels[state]}</span>
}

function AppLoading({ label }: { label: string }) {
  return (
    <main className="app-loading">
      <span className="brand-mark"><span /><span /><span /></span>
      <span className="loading-spinner" />
      <p>{label}</p>
    </main>
  )
}

function WorkspaceError({ message, onSignOut }: { message: string; onSignOut?: () => Promise<void> }) {
  return (
    <main className="auth-shell">
      <section className="auth-card workspace-error">
        <div className="auth-brand"><span className="brand-mark"><span /><span /><span /></span><span>Tom’s Tracker</span></div>
        <span className="error-icon">!</span>
        <h1>Workspace unavailable</h1>
        <p>{message}</p>
        {onSignOut && <button className="auth-submit" onClick={() => void onSignOut()}>Sign out</button>}
      </section>
    </main>
  )
}

function App() {
  const auth = useAuth()
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme())

  useEffect(() => saveTheme(theme), [theme])

  if (auth.loading) return <AppLoading label="Checking your account…" />
  if (auth.configured && !auth.user) return <AuthScreen />

  return (
    <WorkspaceApp
      uid={auth.user?.uid}
      accountLabel={auth.user?.displayName || auth.user?.email || undefined}
      displayName={auth.user?.displayName}
      email={auth.user?.email}
      onSignOut={auth.configured ? auth.signOut : undefined}
      theme={theme}
      onToggleTheme={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
    />
  )
}

function WorkspaceApp({ uid, accountLabel, displayName, email, onSignOut, theme, onToggleTheme }: { uid?: string; accountLabel?: string; displayName?: string | null; email?: string | null; onSignOut?: () => Promise<void>; theme: Theme; onToggleTheme: () => void }) {
  const {
    data,
    updateData: setData,
    boards,
    activeBoard,
    selectBoard,
    addBoard,
    joinBoard,
    ready,
    syncState,
    error: syncError,
  } = useTrackerData(uid, { displayName, email })
  const [view, setView] = useState<View>('board')
  const [query, setQuery] = useState('')
  const [areaFilter, setAreaFilter] = useState<string | undefined>()
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all')
  const [editorTask, setEditorTask] = useState<Task | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addAreaOpen, setAddAreaOpen] = useState(false)
  const [createBoardOpen, setCreateBoardOpen] = useState(false)
  const [shareBoardOpen, setShareBoardOpen] = useState(false)
  const [invite, setInvite] = useState<BoardInvite | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const areaCreatedCallbackRef = useRef<((areaId: string) => void) | null>(null)

  useEffect(() => {
    setEditorTask(null)
    setAreaFilter(undefined)
    setQuery('')
  }, [activeBoard?.id])

  useEffect(() => {
    if (!uid || !ready) return
    const inviteId = new URLSearchParams(window.location.search).get('invite')
    if (!inviteId) return
    const existingBoard = boards.find((board) => board.id === invite?.boardId)
    if (existingBoard) {
      selectBoard(existingBoard.id)
      clearInviteFromUrl()
      setInvite(null)
      return
    }
    if (invite || inviteError) return
    let active = true
    void getBoardInvite(inviteId)
      .then((nextInvite) => { if (active) setInvite(nextInvite) })
      .catch((error: unknown) => {
        if (active) setInviteError(error instanceof Error ? error.message : 'This invitation could not be opened.')
      })
    return () => { active = false }
  }, [uid, ready, boards, invite?.boardId, selectBoard])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditorTask(null)
        setSettingsOpen(false)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
      if (
        event.key.toLowerCase() === 'n' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement) &&
        !(event.target instanceof HTMLSelectElement)
      ) {
        setEditorTask(emptyTask(view === 'inbox' ? 'inbox' : 'todo', data.areas[0]?.id ?? ''))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [data.areas, view])

  const visibleTasks = useMemo(
    () => filterTasks(data.tasks, { query, areaId: areaFilter, priority: priorityFilter }),
    [data.tasks, query, areaFilter, priorityFilter],
  )

  if (!ready) return <AppLoading label="Loading your workspace…" />
  if (syncError && uid) return <WorkspaceError message={syncError} onSignOut={onSignOut} />
  if (!activeBoard) return <WorkspaceError message="No task board is available for this account." onSignOut={onSignOut} />

  const openNewTask = (status: Status = view === 'inbox' ? 'inbox' : 'todo') => {
    setEditorTask(emptyTask(status, areaFilter ?? data.areas[0]?.id ?? ''))
  }

  const saveTask = (task: Task) => {
    const now = new Date().toISOString()
    setData((current) => {
      if (task.id) {
        return {
          ...current,
          tasks: current.tasks.map((item) =>
            item.id === task.id
              ? {
                  ...task,
                  updatedAt: now,
                  completedAt:
                    task.status === 'done' ? task.completedAt ?? now : undefined,
                }
              : item,
          ),
        }
      }
      return {
        ...current,
        tasks: [
          ...current.tasks,
          {
            ...task,
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
            completedAt: task.status === 'done' ? now : undefined,
          },
        ],
      }
    })
    setEditorTask(null)
  }

  const deleteTask = (taskId: string) => {
    if (!window.confirm('Delete this task? This cannot be undone.')) return
    setData((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== taskId),
    }))
    setEditorTask(null)
  }

  const updateStatus = (taskId: string, status: Status) => {
    setData((current) => ({ ...current, tasks: moveTask(current.tasks, taskId, status) }))
  }

  const toggleFocus = (taskId: string) => {
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? { ...task, isFocus: !task.isFocus, updatedAt: new Date().toISOString() }
          : task,
      ),
    }))
  }

  const selectView = (nextView: View) => {
    setView(nextView)
    setAreaFilter(undefined)
  }

  const openAddArea = (onCreated?: (areaId: string) => void) => {
    areaCreatedCallbackRef.current = onCreated ?? null
    setAddAreaOpen(true)
  }

  const addArea = (name: string, color: string) => {
    const id = crypto.randomUUID()
    setData((current) => ({
      ...current,
      areas: [...current.areas, { id, name, color }],
    }))
    areaCreatedCallbackRef.current?.(id)
    areaCreatedCallbackRef.current = null
    setAddAreaOpen(false)
  }

  const areaName = data.areas.find((area) => area.id === areaFilter)?.name
  const pageTitle = areaName ?? (view === 'board' ? activeBoard.name : viewTitles[view])
  const boardContext = `${activeBoard.type === 'shared' ? 'Shared' : 'Personal'} board${activeBoard.role === 'member' ? ' · Member' : ''}`

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        onView={selectView}
        areas={data.areas}
        areaFilter={areaFilter}
        onArea={(areaId) => {
          setAreaFilter(areaId)
          setView('board')
        }}
        tasks={data.tasks}
        boards={boards}
        activeBoard={activeBoard}
        onBoard={selectBoard}
        onAddBoard={() => setCreateBoardOpen(true)}
        onAddArea={() => openAddArea()}
        onSettings={() => setSettingsOpen(true)}
      />

      <div className="workspace">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => selectView('board')} aria-label="Open board">
            <span className="brand-mark"><span /><span /><span /></span>
            <span>Tracker</span>
          </button>
          <label className="board-switcher">
            {activeBoard.type === 'shared' ? <UsersIcon /> : <LockIcon />}
            <select value={activeBoard.id} onChange={(event) => {
              if (event.target.value === '__new__') setCreateBoardOpen(true)
              else selectBoard(event.target.value)
            }} aria-label="Current task board">
              {boards.map((board) => <option value={board.id} key={board.id}>{board.name}</option>)}
              <option value="__new__">New task board…</option>
            </select>
          </label>
          <label className="search-box">
            <SearchIcon />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tasks"
              aria-label="Search tasks"
            />
            <kbd>⌘K</kbd>
          </label>
          <div className="topbar-actions">
            <SyncIndicator state={syncState} />
            <button className="icon-button theme-button" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
              {theme === 'light' ? <MoonIcon /> : <SunIcon />}
            </button>
            <button className="primary-button" onClick={() => openNewTask()} aria-label="Add task">
              <PlusIcon />
              <span>Add task</span>
            </button>
          </div>
        </header>

        <main className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{view === 'today' ? `${getDayLabel()} · ${boardContext}` : boardContext}</p>
              <h1>{pageTitle}</h1>
              <p className="page-description">{areaName ? `Everything in ${areaName}.` : viewDescriptions[view]}</p>
            </div>
            <div className="heading-actions">
              {activeBoard.type === 'shared' && (
                <button className="board-members-button" onClick={() => setShareBoardOpen(true)}><UsersIcon />Members</button>
              )}
              <label className="filter-select">
                <SlidersIcon />
                <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as Priority | 'all')} aria-label="Filter by priority">
                  <option value="all">All priorities</option>
                  {PRIORITIES.filter((priority) => priority.id !== 'none').map((priority) => (
                    <option value={priority.id} key={priority.id}>{priority.label}</option>
                  ))}
                </select>
              </label>
              {(areaFilter || priorityFilter !== 'all' || query) && (
                <button className="text-button" onClick={() => { setAreaFilter(undefined); setPriorityFilter('all'); setQuery('') }}>
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {view === 'board' && (
            <BoardView
              tasks={visibleTasks}
              areas={data.areas}
              onOpen={setEditorTask}
              onNew={openNewTask}
              onMove={updateStatus}
              onToggleFocus={toggleFocus}
            />
          )}
          {view === 'today' && (
            <TodayView
              tasks={visibleTasks}
              areas={data.areas}
              onOpen={setEditorTask}
              onNew={() => openNewTask('todo')}
              onMove={updateStatus}
              onToggleFocus={toggleFocus}
            />
          )}
          {view === 'inbox' && (
            <InboxView
              tasks={visibleTasks.filter((task) => task.status === 'inbox')}
              areas={data.areas}
              onOpen={setEditorTask}
              onNew={() => openNewTask('inbox')}
              onMove={updateStatus}
              onToggleFocus={toggleFocus}
            />
          )}
        </main>
      </div>

      <MobileNav view={view} onView={selectView} inboxCount={data.tasks.filter((task) => task.status === 'inbox').length} onAdd={() => openNewTask()} />

      {editorTask && (
        <TaskEditor
          task={editorTask}
          areas={data.areas}
          onClose={() => setEditorTask(null)}
          onSave={saveTask}
          onDelete={editorTask.id ? deleteTask : undefined}
          onAddArea={(onCreated) => openAddArea(onCreated)}
        />
      )}

      {addAreaOpen && (
        <AddAreaPanel
          areas={data.areas}
          onClose={() => {
            areaCreatedCallbackRef.current = null
            setAddAreaOpen(false)
          }}
          onAdd={addArea}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          data={data}
          accountLabel={accountLabel}
          syncState={syncState}
          onSignOut={onSignOut}
          onClose={() => setSettingsOpen(false)}
          onReset={() => {
            if (!window.confirm('Replace all current tasks with the sample workspace?')) return
            setData(() => seedData)
            setSettingsOpen(false)
          }}
        />
      )}

      {createBoardOpen && (
        <CreateBoardPanel
          onClose={() => setCreateBoardOpen(false)}
          onCreate={async (name, type) => {
            await addBoard(name, type)
            setCreateBoardOpen(false)
          }}
        />
      )}

      {shareBoardOpen && uid && activeBoard.type === 'shared' && (
        <ShareBoardPanel
          uid={uid}
          board={activeBoard}
          onClose={() => setShareBoardOpen(false)}
          onLeft={() => {
            setShareBoardOpen(false)
          }}
        />
      )}

      {(invite || inviteError) && (
        <InvitePanel
          invite={invite}
          error={inviteError}
          onClose={() => {
            clearInviteFromUrl()
            setInvite(null)
            setInviteError(null)
          }}
          onJoin={async () => {
            if (!invite) return
            await joinBoard(invite.id)
            clearInviteFromUrl()
            setInvite(null)
          }}
        />
      )}
    </div>
  )
}

const viewTitles: Record<View, string> = {
  today: 'Today',
  board: 'Life board',
  inbox: 'Inbox',
}

const viewDescriptions: Record<View, string> = {
  today: 'A short list for what deserves your attention now.',
  board: 'See what is planned, active, waiting, and finished.',
  inbox: 'Loose thoughts land here until you decide what they mean.',
}

function getDayLabel() {
  return new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
}

interface SidebarProps {
  view: View
  onView: (view: View) => void
  areas: Area[]
  areaFilter?: string
  onArea: (areaId: string) => void
  tasks: Task[]
  boards: TaskBoard[]
  activeBoard: TaskBoard
  onBoard: (boardId: string) => void
  onAddBoard: () => void
  onAddArea: () => void
  onSettings: () => void
}

function Sidebar({ view, onView, areas, areaFilter, onArea, tasks, boards, activeBoard, onBoard, onAddBoard, onAddArea, onSettings }: SidebarProps) {
  const inboxCount = tasks.filter((task) => task.status === 'inbox').length
  const todayCount = tasks.filter((task) => task.status !== 'done' && (task.isFocus || isDueToday(task) || isOverdue(task))).length

  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => onView('board')}>
        <span className="brand-mark"><span /><span /><span /></span>
        <span>Tom’s Tracker</span>
      </button>

      <div className="sidebar-section board-list-section">
        <div className="sidebar-section-title"><span>Task boards</span><button aria-label="Create task board" onClick={onAddBoard}><PlusIcon /></button></div>
        <div className="area-list board-list">
          {boards.map((board) => (
            <button className={activeBoard.id === board.id ? 'active' : ''} key={board.id} onClick={() => onBoard(board.id)}>
              {board.type === 'shared' ? <UsersIcon /> : <LockIcon />}
              <span>{board.name}</span>
              {board.role === 'member' && <span className="board-role">member</span>}
            </button>
          ))}
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        <NavButton active={view === 'today' && !areaFilter} icon={<TodayIcon />} label="Today" count={todayCount} onClick={() => onView('today')} />
        <NavButton active={view === 'board' && !areaFilter} icon={<BoardIcon />} label="Life board" onClick={() => onView('board')} />
        <NavButton active={view === 'inbox' && !areaFilter} icon={<InboxIcon />} label="Inbox" count={inboxCount} onClick={() => onView('inbox')} />
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-section-title"><span>Areas</span><button aria-label="Add area" onClick={onAddArea}><PlusIcon /></button></div>
        <div className="area-list">
          {areas.map((area) => (
            <button className={areaFilter === area.id ? 'active' : ''} key={area.id} onClick={() => onArea(area.id)}>
              <span className="area-dot" style={{ backgroundColor: area.color }} />
              <span>{area.name}</span>
              <span className="area-count">{tasks.filter((task) => task.areaId === area.id && task.status !== 'done').length}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="local-card">
          <span className="local-icon">{activeBoard.type === 'shared' ? <UsersIcon /> : <CheckIcon />}</span>
          <div><strong>{activeBoard.type === 'shared' ? 'Shared workspace' : 'Private board'}</strong><small>{activeBoard.type === 'shared' ? 'Synced with board members' : 'Only you can access this board'}</small></div>
        </div>
        <button className="settings-button" onClick={onSettings}><SettingsIcon />Settings & data</button>
      </div>
    </aside>
  )
}

function NavButton({ active, icon, label, count, onClick }: { active: boolean; icon: React.ReactNode; label: string; count?: number; onClick: () => void }) {
  return (
    <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}<span>{label}</span>{count !== undefined && count > 0 && <span className="nav-count">{count}</span>}
    </button>
  )
}

interface TaskCollectionProps {
  tasks: Task[]
  areas: Area[]
  onOpen: (task: Task) => void
  onNew: (status?: Status) => void
  onMove: (taskId: string, status: Status) => void
  onToggleFocus: (taskId: string) => void
}

function BoardView({ tasks, areas, onOpen, onNew, onMove, onToggleFocus }: TaskCollectionProps) {
  return (
    <div className="board" aria-label="Kanban board">
      {STATUSES.map((status) => {
        const columnTasks = tasks.filter((task) => task.status === status.id)
        return (
          <section
            className="board-column"
            key={status.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const taskId = event.dataTransfer.getData('text/task-id')
              if (taskId) onMove(taskId, status.id)
            }}
          >
            <div className="column-header">
              <div className={`status-symbol ${status.id}`}><span /></div>
              <div><h2>{status.label} <span>{columnTasks.length}</span></h2><p>{status.description}</p></div>
              <button aria-label={`Add task to ${status.label}`} onClick={() => onNew(status.id)}><PlusIcon /></button>
            </div>
            <div className="task-stack">
              {columnTasks.map((task) => <TaskCard key={task.id} task={task} areas={areas} onOpen={onOpen} onMove={onMove} onToggleFocus={onToggleFocus} />)}
              {columnTasks.length === 0 && <div className="column-empty">Drop a task here</div>}
              <button className="column-add" onClick={() => onNew(status.id)}><PlusIcon />Add task</button>
            </div>
          </section>
        )
      })}
    </div>
  )
}

function TodayView({ tasks, areas, onOpen, onNew, onMove, onToggleFocus }: TaskCollectionProps) {
  const todayTasks = tasks.filter((task) => task.status !== 'done' && (task.isFocus || isDueToday(task) || isOverdue(task)))
  const focusTasks = todayTasks.filter((task) => task.isFocus)
  const otherTasks = todayTasks.filter((task) => !task.isFocus)
  const doneToday = tasks.filter(
    (task) => task.status === 'done' && task.completedAt && localDateKey(new Date(task.completedAt)) === localDateKey(),
  ).length

  return (
    <div className="today-layout">
      <div className="today-summary">
        <div className="progress-ring" style={{ '--progress': `${Math.min(100, doneToday * 25)}%` } as React.CSSProperties}>
          <span>{doneToday}</span>
        </div>
        <div><strong>{doneToday ? `${doneToday} completed today` : 'A clean start'}</strong><span>{todayTasks.length} item{todayTasks.length === 1 ? '' : 's'} asking for attention</span></div>
      </div>

      {todayTasks.length === 0 ? (
        <EmptyState title="Nothing is pulling at you" body="Add a focus item or give a task today’s due date." action="Plan something" onAction={() => onNew('todo')} />
      ) : (
        <div className="today-sections">
          {focusTasks.length > 0 && <TaskList title="Focus" subtitle="Your intentionally short list" tasks={focusTasks} areas={areas} onOpen={onOpen} onMove={onMove} onToggleFocus={onToggleFocus} />}
          {otherTasks.length > 0 && <TaskList title="Due now" subtitle="Due today or already overdue" tasks={otherTasks} areas={areas} onOpen={onOpen} onMove={onMove} onToggleFocus={onToggleFocus} />}
        </div>
      )}
    </div>
  )
}

function InboxView({ tasks, areas, onOpen, onNew, onMove, onToggleFocus }: TaskCollectionProps) {
  if (!tasks.length) return <EmptyState title="Inbox zero" body="Every loose thought has been planned or cleared." action="Capture a thought" onAction={() => onNew('inbox')} />

  return (
    <div className="inbox-layout">
      <div className="inbox-note"><InboxIcon /><div><strong>Triage, don’t organise</strong><span>Decide whether each item belongs on the board, or delete it.</span></div></div>
      <div className="inbox-list">
        {tasks.map((task) => (
          <div className="inbox-row" key={task.id}>
            <TaskCard task={task} areas={areas} onOpen={onOpen} onMove={onMove} onToggleFocus={onToggleFocus} />
            <button className="plan-button" onClick={() => onMove(task.id, 'todo')}>Move to to-do <span>→</span></button>
          </div>
        ))}
      </div>
    </div>
  )
}

function TaskList({ title, subtitle, tasks, areas, onOpen, onMove, onToggleFocus }: Omit<TaskCollectionProps, 'onNew'> & { title: string; subtitle: string }) {
  return (
    <section className="list-section">
      <div className="list-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><span>{tasks.length}</span></div>
      <div className="wide-task-list">
        {tasks.map((task) => <TaskCard key={task.id} task={task} areas={areas} onOpen={onOpen} onMove={onMove} onToggleFocus={onToggleFocus} wide />)}
      </div>
    </section>
  )
}

function TaskCard({ task, areas, onOpen, onMove, onToggleFocus, wide = false }: { task: Task; areas: Area[]; onOpen: (task: Task) => void; onMove: (taskId: string, status: Status) => void; onToggleFocus: (taskId: string) => void; wide?: boolean }) {
  const area = areas.find((item) => item.id === task.areaId)
  const overdue = isOverdue(task)
  const dueText = formatDueDate(task.dueDate)

  return (
    <article
      className={`task-card ${wide ? 'wide' : ''}`}
      draggable
      onDragStart={(event) => event.dataTransfer.setData('text/task-id', task.id)}
      onClick={() => onOpen(task)}
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === 'Enter') onOpen(task) }}
    >
      <div className="task-topline">
        {task.priority !== 'none' ? <span className={`priority-badge ${task.priority}`}>{task.priority}</span> : <span />}
        <button
          className={`focus-button ${task.isFocus ? 'active' : ''}`}
          aria-label={task.isFocus ? 'Remove from focus' : 'Add to focus'}
          onClick={(event) => { event.stopPropagation(); onToggleFocus(task.id) }}
        ><StarIcon /></button>
      </div>
      <h3>{task.title}</h3>
      {task.description && <p className="task-description">{task.description}</p>}
      <div className="task-meta">
        {area && <span className="area-chip"><span style={{ backgroundColor: area.color }} />{area.name}</span>}
        {dueText && <span className={`due-chip ${overdue ? 'overdue' : ''}`}><CalendarIcon />{overdue ? 'Overdue' : dueText}</span>}
      </div>
      {task.tags.length > 0 && <div className="tag-row">{task.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
      {wide && (
        <button className="complete-button" aria-label="Mark done" onClick={(event) => { event.stopPropagation(); onMove(task.id, 'done') }}><CheckIcon /></button>
      )}
    </article>
  )
}

function EmptyState({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return (
    <div className="empty-state">
      <span className="empty-graphic"><CheckIcon /></span>
      <h2>{title}</h2><p>{body}</p>
      <button className="secondary-button" onClick={onAction}><PlusIcon />{action}</button>
    </div>
  )
}

function TaskEditor({ task, areas, onClose, onSave, onDelete, onAddArea }: { task: Task; areas: Area[]; onClose: () => void; onSave: (task: Task) => void; onDelete?: (taskId: string) => void; onAddArea: (onCreated: (areaId: string) => void) => void }) {
  const [draft, setDraft] = useState(task)
  const [tagText, setTagText] = useState(task.tags.join(', '))
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.title.trim()) return
    onSave({ ...draft, title: draft.title.trim(), tags: tagText.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean) })
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="task-editor" onSubmit={submit}>
        <div className="editor-header">
          <div><span className="editor-kicker">{task.id ? 'Edit task' : 'New task'}</span><h2>{task.id ? 'Task details' : 'Capture what matters'}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </div>

        <div className="field full-field">
          <label htmlFor="task-title">Title</label>
          <input ref={titleRef} id="task-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="What needs to happen?" required />
        </div>

        <div className="field full-field">
          <label htmlFor="task-description">Notes</label>
          <textarea id="task-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Context, next step, or useful details" rows={4} />
        </div>

        <div className="field-grid">
          <div className="field">
            <label htmlFor="task-status">Status</label>
            <select id="task-status" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Status })}>
              <option value="inbox">Inbox</option>
              {STATUSES.map((status) => <option value={status.id} key={status.id}>{status.label}</option>)}
            </select>
          </div>
          <div className="field">
            <div className="field-label-row"><label htmlFor="task-area">Area</label><button type="button" onClick={() => onAddArea((areaId) => setDraft((current) => ({ ...current, areaId })))}>Add area</button></div>
            <select id="task-area" value={draft.areaId} onChange={(event) => setDraft({ ...draft, areaId: event.target.value })}>
              {areas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-priority">Priority</label>
            <select id="task-priority" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}>
              {PRIORITIES.map((priority) => <option value={priority.id} key={priority.id}>{priority.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-due">Due date</label>
            <input id="task-due" type="date" value={draft.dueDate ?? ''} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value || undefined })} />
          </div>
        </div>

        <div className="field full-field">
          <label htmlFor="task-tags">Tags <span>separate with commas</span></label>
          <input id="task-tags" value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="admin, errands, deep-work" />
        </div>

        <label className="focus-toggle">
          <input type="checkbox" checked={draft.isFocus} onChange={(event) => setDraft({ ...draft, isFocus: event.target.checked })} />
          <span className="toggle-track"><span /></span>
          <span><strong>Show in Today</strong><small>Pin this to your daily focus list</small></span>
        </label>

        <div className="editor-footer">
          {onDelete ? <button type="button" className="delete-button" onClick={() => onDelete(task.id)}>Delete</button> : <span />}
          <div><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">{task.id ? 'Save changes' : 'Add task'}</button></div>
        </div>
      </form>
    </div>
  )
}

const AREA_COLORS = [
  { name: 'Orange', value: '#ef6334' },
  { name: 'Green', value: '#2f7d61' },
  { name: 'Purple', value: '#7357d6' },
  { name: 'Blue', value: '#2d7dd2' },
  { name: 'Pink', value: '#c94f7c' },
  { name: 'Gold', value: '#b48713' },
  { name: 'Slate', value: '#4f7c8a' },
  { name: 'Grey', value: '#77776e' },
]

function AddAreaPanel({ areas, onClose, onAdd }: { areas: Area[]; onClose: () => void; onAdd: (name: string, color: string) => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(AREA_COLORS[0].value)
  const [error, setError] = useState<string | null>(null)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return
    if (areas.some((area) => area.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase())) {
      setError('An area with this name already exists on the board.')
      return
    }
    onAdd(trimmedName, color)
  }

  return (
    <div className="modal-backdrop area-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="settings-panel area-panel" onSubmit={submit}>
        <div className="editor-header"><div><span className="editor-kicker">Organise work</span><h2>Add an area</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><CloseIcon /></button></div>
        <div className="field full-field">
          <label htmlFor="area-name">Area name</label>
          <input id="area-name" autoFocus value={name} onChange={(event) => { setName(event.target.value); setError(null) }} maxLength={100} placeholder="Health, study, home…" required />
        </div>
        <fieldset className="color-options">
          <legend>Colour</legend>
          {AREA_COLORS.map((option) => (
            <label key={option.value} style={{ '--area-color': option.value } as React.CSSProperties}>
              <input type="radio" name="area-color" value={option.value} checked={color === option.value} onChange={() => setColor(option.value)} />
              <span />
              <span className="visually-hidden">{option.name}</span>
            </label>
          ))}
        </fieldset>
        {error && <p className="panel-error" role="alert">{error}</p>}
        <div className="panel-footer"><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button className="primary-button">Add area</button></div>
      </form>
    </div>
  )
}

function clearInviteFromUrl() {
  const url = new URL(window.location.href)
  url.searchParams.delete('invite')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

function CreateBoardPanel({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, type: BoardType) => Promise<void> }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<BoardType>('personal')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form
        className="settings-panel board-panel"
        onSubmit={(event) => {
          event.preventDefault()
          if (!name.trim()) return
          setSubmitting(true)
          setError(null)
          void onCreate(name.trim(), type)
            .catch(() => setError('The board could not be created. Check your connection and try again.'))
            .finally(() => setSubmitting(false))
        }}
      >
        <div className="editor-header"><div><span className="editor-kicker">New workspace</span><h2>Create a task board</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><CloseIcon /></button></div>
        <div className="field full-field">
          <label htmlFor="board-name">Board name</label>
          <input id="board-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Home projects" required />
        </div>
        <fieldset className="board-type-options">
          <legend>Access</legend>
          <label className={type === 'personal' ? 'selected' : ''}>
            <input type="radio" name="board-type" value="personal" checked={type === 'personal'} onChange={() => setType('personal')} />
            <span><LockIcon /></span>
            <div><strong>Personal</strong><small>Only you can access this board.</small></div>
          </label>
          <label className={type === 'shared' ? 'selected' : ''}>
            <input type="radio" name="board-type" value="shared" checked={type === 'shared'} onChange={() => setType('shared')} />
            <span><UsersIcon /></span>
            <div><strong>Shared</strong><small>Invite other users to work on tasks together.</small></div>
          </label>
        </fieldset>
        {error && <p className="panel-error" role="alert">{error}</p>}
        <div className="panel-footer"><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={submitting}>{submitting ? 'Creating…' : 'Create board'}</button></div>
      </form>
    </div>
  )
}

function ShareBoardPanel({ uid, board, onClose, onLeft }: { uid: string; board: TaskBoard; onClose: () => void; onLeft: () => void }) {
  const [members, setMembers] = useState<BoardMember[]>([])
  const [inviteUrl, setInviteUrl] = useState('')
  const [expiresAt, setExpiresAt] = useState<Date | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => subscribeToBoardMembers(
    board.id,
    setMembers,
    () => setError('The member list could not be loaded.'),
  ), [board.id])

  const makeInvite = async () => {
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      const created = await createBoardInvite(board)
      const url = new URL(window.location.origin)
      url.searchParams.set('invite', created.id)
      setInviteUrl(url.toString())
      setExpiresAt(created.expiresAt)
      try {
        await navigator.clipboard.writeText(url.toString())
        setNotice('Invite link copied. It expires in seven days.')
      } catch {
        setNotice('Invite link created. Copy it from the field below.')
      }
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'An invite link could not be created.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="settings-panel board-panel">
        <div className="editor-header"><div><span className="editor-kicker">Shared board</span><h2>{board.name}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><CloseIcon /></button></div>

        {board.role === 'owner' && (
          <div className="invite-section">
            <div><strong>Invite another user</strong><p>Anyone with the link can join this board until it expires.</p></div>
            <button className="primary-button" onClick={() => void makeInvite()} disabled={working}><LinkIcon />{working ? 'Creating…' : 'Create invite link'}</button>
            {inviteUrl && <input className="invite-link" value={inviteUrl} readOnly onFocus={(event) => event.currentTarget.select()} aria-label="Invite link" />}
            {expiresAt && <small>Expires {expiresAt.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</small>}
          </div>
        )}

        {notice && <p className="panel-notice" role="status">{notice}</p>}
        {error && <p className="panel-error" role="alert">{error}</p>}

        <div className="member-section">
          <div className="member-heading"><strong>Members</strong><span>{members.length}</span></div>
          <div className="member-list">
            {members.map((member) => (
              <div className="member-row" key={member.uid}>
                <span className="member-avatar">{(member.displayName || member.email || '?').slice(0, 1).toUpperCase()}</span>
                <div><strong>{member.uid === uid ? 'You' : member.displayName || member.email || 'Board member'}</strong><small>{member.displayName && member.email ? member.email : member.role}</small></div>
                <span className="member-role">{member.role}</span>
                {board.role === 'owner' && member.role === 'member' && (
                  <button
                    className="remove-member"
                    onClick={() => {
                      if (!window.confirm(`Remove ${member.displayName || member.email || 'this member'} from the board?`)) return
                      void removeBoardMember(board.id, member.uid).catch(() => setError('The member could not be removed.'))
                    }}
                  >Remove</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {board.role === 'member' && (
          <div className="settings-danger"><div><strong>Leave board</strong><p>You will immediately lose access to its tasks.</p></div><button onClick={() => {
            if (!window.confirm(`Leave ${board.name}?`)) return
            void leaveBoard(uid, board.id).then(onLeft).catch(() => setError('The board could not be left.'))
          }}>Leave</button></div>
        )}
      </section>
    </div>
  )
}

function InvitePanel({ invite, error, onClose, onJoin }: { invite: BoardInvite | null; error: string | null; onClose: () => void; onJoin: () => Promise<void> }) {
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  return (
    <div className="modal-backdrop">
      <section className="settings-panel board-panel invite-panel">
        <div className="editor-header"><div><span className="editor-kicker">Board invitation</span><h2>{invite ? `Join ${invite.boardName}?` : 'Invitation unavailable'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><CloseIcon /></button></div>
        {invite ? (
          <>
            <div className="invite-summary"><UsersIcon /><div><strong>Shared task board</strong><p>You will be able to view and edit its tasks and areas. Other members will see your changes.</p></div></div>
            {(joinError || error) && <p className="panel-error" role="alert">{joinError || error}</p>}
            <div className="panel-footer"><button className="cancel-button" onClick={onClose}>Not now</button><button className="primary-button" disabled={joining} onClick={() => {
              setJoining(true)
              setJoinError(null)
              void onJoin().catch((joinFailure) => {
                setJoinError(joinFailure instanceof Error ? joinFailure.message : 'The board could not be joined.')
              }).finally(() => setJoining(false))
            }}>{joining ? 'Joining…' : 'Join board'}</button></div>
          </>
        ) : (
          <><p className="panel-error" role="alert">{error}</p><div className="panel-footer"><button className="primary-button" onClick={onClose}>Close</button></div></>
        )}
      </section>
    </div>
  )
}

function SettingsPanel({ data, accountLabel, syncState, onSignOut, onClose, onReset }: { data: TrackerData; accountLabel?: string; syncState: SyncState; onSignOut?: () => Promise<void>; onClose: () => void; onReset: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="settings-panel">
        <div className="editor-header"><div><span className="editor-kicker">Workspace</span><h2>Settings & data</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><CloseIcon /></button></div>
        <div className="settings-copy">
          <CloudIcon />
          <div>
            <h3>{onSignOut ? 'Cloud sync is active' : 'Local development mode'}</h3>
            <p>{onSignOut ? `Signed in${accountLabel ? ` as ${accountLabel}` : ''}. Changes are cached offline and synced through Firebase.` : 'Firebase is not configured, so this browser is the only copy of your workspace.'}</p>
          </div>
          <span className={`settings-sync-dot sync-${syncState}`} />
        </div>
        <button className="settings-action" onClick={() => exportData(data)}><span><DownloadIcon /></span><div><strong>Export current board</strong><small>Download this board’s tasks and areas as JSON</small></div><b>→</b></button>
        <div className="settings-stats">
          <div><strong>{data.tasks.length}</strong><span>Total tasks</span></div>
          <div><strong>{data.tasks.filter((task) => task.status === 'done').length}</strong><span>Completed</span></div>
          <div><strong>{data.areas.length}</strong><span>Areas</span></div>
        </div>
        {onSignOut && <button className="settings-action sign-out-action" onClick={() => void onSignOut()}><span><LogOutIcon /></span><div><strong>Sign out</strong><small>Keep the offline cache on this device</small></div><b>→</b></button>}
        <div className="settings-danger"><div><strong>Reset sample workspace</strong><p>Replace your current data with the original example tasks.</p></div><button onClick={onReset}>Reset</button></div>
      </section>
    </div>
  )
}

function MobileNav({ view, onView, inboxCount, onAdd }: { view: View; onView: (view: View) => void; inboxCount: number; onAdd: () => void }) {
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      <button className={view === 'today' ? 'active' : ''} onClick={() => onView('today')}><TodayIcon /><span>Today</span></button>
      <button className={view === 'board' ? 'active' : ''} onClick={() => onView('board')}><BoardIcon /><span>Board</span></button>
      <button className="mobile-add" onClick={onAdd} aria-label="Add task"><PlusIcon /></button>
      <button className={view === 'inbox' ? 'active' : ''} onClick={() => onView('inbox')}><span className="mobile-icon-wrap"><InboxIcon />{inboxCount > 0 && <i>{inboxCount}</i>}</span><span>Inbox</span></button>
      <button onClick={() => document.querySelector<HTMLInputElement>('.search-box input')?.focus()}><SearchIcon /><span>Search</span></button>
    </nav>
  )
}

export default App
