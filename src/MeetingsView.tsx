import { useMemo, useState } from 'react'
import { formatDueDate, isOverdue, localDateKey, PRIORITIES } from './board'
import { CalendarIcon, CheckIcon, CloseIcon, PlusIcon, UsersIcon } from './icons'
import type { BoardMember, Meeting, MeetingDecision, MeetingQuestion, Priority, Task, TrackerData } from './types'

interface MeetingsViewProps {
  data: TrackerData
  members: BoardMember[]
  isSharedBoard: boolean
  onChange: (updater: (current: TrackerData) => TrackerData) => void
  onOpenTask: (task: Task) => void
}

function newMeeting(previous?: Meeting): Meeting {
  const now = new Date().toISOString()
  return {
    id: '',
    title: previous?.title ?? '',
    date: previous?.nextMeetingDate ?? localDateKey(),
    participants: previous?.participants ?? '',
    series: previous?.series ?? '',
    agenda: '',
    notes: '',
    decisions: [],
    questions: [],
    actionTaskIds: [],
    previousMeetingId: previous?.id,
    createdAt: now,
    updatedAt: now,
  }
}

function dateLabel(date: string) {
  const parsed = new Date(`${date}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(parsed)
}

function meetingHistory(meeting: Meeting, meetings: Meeting[]) {
  const history: Meeting[] = []
  const seen = new Set([meeting.id])
  let previousId = meeting.previousMeetingId
  while (previousId && !seen.has(previousId)) {
    const previous = meetings.find((item) => item.id === previousId)
    if (!previous) break
    history.push(previous)
    seen.add(previous.id)
    previousId = previous.previousMeetingId
  }
  return history
}

export function MeetingsView({ data, members, isSharedBoard, onChange, onOpenTask }: MeetingsViewProps) {
  const meetings = data.meetings ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Meeting | null>(null)
  const [actionTitle, setActionTitle] = useState('')
  const [actionDue, setActionDue] = useState('')
  const [actionAssignee, setActionAssignee] = useState('')
  const [actionArea, setActionArea] = useState('')
  const [actionPriority, setActionPriority] = useState<Priority>('medium')
  const [existingTaskId, setExistingTaskId] = useState('')
  const selected = meetings.find((meeting) => meeting.id === selectedId)
  const today = localDateKey()
  const sortedMeetings = useMemo(() => [...meetings].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [meetings])
  const upcoming = sortedMeetings.filter((meeting) => meeting.date >= today).reverse()
  const recent = sortedMeetings.filter((meeting) => meeting.date < today)
  const actionIds = new Set(meetings.flatMap((meeting) => meeting.actionTaskIds))
  const openActions = data.tasks.filter((task) => actionIds.has(task.id) && task.status !== 'done')
  const overdueActions = openActions.filter((task) => isOverdue(task))

  const saveMeeting = (meeting: Meeting) => {
    const now = new Date().toISOString()
    const id = meeting.id || crypto.randomUUID()
    onChange((current) => {
      const currentMeetings = current.meetings ?? []
      const previous = !meeting.id && !meeting.previousMeetingId && meeting.series.trim()
        ? [...currentMeetings]
          .filter((item) => item.id !== id && item.series.trim().toLowerCase() === meeting.series.trim().toLowerCase() && item.date <= meeting.date)
          .sort((a, b) => b.date.localeCompare(a.date))[0]
        : undefined
      const saved: Meeting = {
        ...meeting,
        id,
        title: meeting.title.trim(),
        participants: meeting.participants.trim(),
        series: meeting.series.trim(),
        agenda: meeting.agenda.trim(),
        notes: meeting.notes.trim(),
        decisions: meeting.decisions.filter((item) => item.text.trim()).map((item) => ({ ...item, text: item.text.trim(), reason: item.reason.trim() })),
        questions: meeting.questions.filter((item) => item.text.trim()).map((item) => ({ ...item, text: item.text.trim(), owner: item.owner.trim() })),
        previousMeetingId: meeting.previousMeetingId || previous?.id,
        updatedAt: now,
      }
      return {
        ...current,
        meetings: meeting.id
          ? currentMeetings.map((item) => item.id === id ? saved : item)
          : [...currentMeetings, saved],
      }
    })
    setSelectedId(id)
    setDraft(null)
  }

  const updateMeeting = (meetingId: string, update: (meeting: Meeting) => Meeting) => {
    onChange((current) => ({
      ...current,
      meetings: (current.meetings ?? []).map((meeting) => meeting.id === meetingId
        ? { ...update(meeting), updatedAt: new Date().toISOString() }
        : meeting),
    }))
  }

  const createAction = (meeting: Meeting) => {
    const title = actionTitle.trim()
    if (!title || meeting.actionTaskIds.length >= 100 || !data.areas.length || (isSharedBoard && !actionAssignee)) return
    const assignee = members.find((member) => member.uid === actionAssignee)
    const now = new Date().toISOString()
    const task: Task = {
      id: crypto.randomUUID(),
      title,
      description: '',
      status: 'todo',
      priority: actionPriority,
      areaId: actionArea || data.areas[0]?.id || '',
      dueDate: actionDue || undefined,
      tags: [],
      isFocus: false,
      assigneeId: assignee?.uid,
      assigneeName: assignee ? assignee.displayName || assignee.email || 'Board member' : undefined,
      createdAt: now,
      updatedAt: now,
    }
    onChange((current) => ({
      ...current,
      tasks: [...current.tasks, task],
      meetings: (current.meetings ?? []).map((item) => item.id === meeting.id
        ? { ...item, actionTaskIds: [...item.actionTaskIds, task.id], updatedAt: now }
        : item),
    }))
    setActionTitle('')
    setActionDue('')
  }

  const history = selected ? meetingHistory(selected, meetings) : []
  const carriedQuestions = history.flatMap((meeting) => meeting.questions.filter((question) => !question.resolved).map((question) => ({ meeting, question })))
  const carriedTaskIds = new Set(history.flatMap((meeting) => meeting.actionTaskIds))
  const carriedActions = data.tasks.filter((task) => carriedTaskIds.has(task.id) && task.status !== 'done' && !selected?.actionTaskIds.includes(task.id))
  const selectedActions = selected ? selected.actionTaskIds.map((id) => data.tasks.find((task) => task.id === id)).filter((task): task is Task => Boolean(task)) : []
  const linkableTasks = selected ? data.tasks.filter((task) => !selected.actionTaskIds.includes(task.id)) : []

  return (
    <div className="meetings-layout">
      {!selected ? (
        <>
          <div className="meetings-toolbar">
            <div className="meeting-stat"><strong>{upcoming.length}</strong><span>Upcoming</span></div>
            <div className="meeting-stat"><strong>{openActions.length}</strong><span>Open actions</span></div>
            <button className="primary-button" onClick={() => setDraft(newMeeting())}><PlusIcon />New meeting</button>
          </div>
          {overdueActions.length > 0 && <section className="meeting-section meeting-overdue"><h3>Overdue actions <span>{overdueActions.length}</span></h3>{overdueActions.map((task) => <ActionRow key={task.id} task={task} ownerFallback={isSharedBoard ? 'Unassigned' : 'You'} onOpen={() => onOpenTask(task)} />)}</section>}
          <MeetingGroup title="Upcoming" meetings={upcoming} tasks={data.tasks} onSelect={setSelectedId} />
          <MeetingGroup title="Recent" meetings={recent} tasks={data.tasks} onSelect={setSelectedId} />
          {meetings.length === 0 && <div className="meeting-empty"><CalendarIcon /><h2>Keep the follow-through together</h2><p>Capture decisions and turn next steps into board tasks.</p><button className="primary-button" onClick={() => setDraft(newMeeting())}>Create your first meeting</button></div>}
        </>
      ) : (
        <>
          <button className="meeting-back" onClick={() => setSelectedId(null)}>← All meetings</button>
          <div className="meeting-detail-heading">
            <div><span className="meeting-date"><CalendarIcon />{dateLabel(selected.date)}</span><h2>{selected.title}</h2>{selected.series && <span className="meeting-series">{selected.series}</span>}</div>
            <div className="meeting-heading-buttons"><button className="secondary-button" onClick={() => setDraft({ ...selected })}>Edit meeting</button><button className="primary-button" onClick={() => setDraft(newMeeting(selected))}>Next meeting</button></div>
          </div>
          {selected.participants && <div className="meeting-participants"><UsersIcon /><span>{selected.participants}</span></div>}
          {selected.nextMeetingDate && <p className="meeting-next-date">Next meeting planned for {dateLabel(selected.nextMeetingDate)}</p>}
          {(carriedActions.length > 0 || carriedQuestions.length > 0) && (
            <section className="meeting-section meeting-carryover">
              <h3>From earlier meetings</h3>
              {carriedActions.map((task) => <ActionRow key={task.id} task={task} ownerFallback={isSharedBoard ? 'Unassigned' : 'You'} onOpen={() => onOpenTask(task)} />)}
              {carriedQuestions.map(({ meeting, question }) => (
                <div className="meeting-question" key={`${meeting.id}:${question.id}`}>
                  <div><strong>{question.text}</strong>{question.owner && <small>Owner: {question.owner}</small>}</div>
                  <button onClick={() => updateMeeting(meeting.id, (item) => ({ ...item, questions: item.questions.map((value) => value.id === question.id ? { ...value, resolved: true } : value) }))}>Resolve</button>
                </div>
              ))}
            </section>
          )}
          <div className="meeting-detail-grid">
            <div className="meeting-main-column">
              <section className="meeting-section"><h3>Agenda</h3><p className="meeting-prose">{selected.agenda || 'No agenda yet.'}</p></section>
              <section className="meeting-section"><h3>Notes</h3><p className="meeting-prose">{selected.notes || 'No notes yet.'}</p></section>
              <section className="meeting-section"><h3>Decisions</h3>{selected.decisions.length ? selected.decisions.map((decision) => <div className="meeting-decision" key={decision.id}><strong>{decision.text}</strong>{decision.reason && <p>{decision.reason}</p>}</div>) : <p className="meeting-muted">No decisions recorded.</p>}</section>
              <section className="meeting-section"><h3>Questions <span>{selected.questions.filter((question) => !question.resolved).length} open</span></h3>{selected.questions.length ? selected.questions.map((question) => <div className={`meeting-question ${question.resolved ? 'resolved' : ''}`} key={question.id}><div><strong>{question.text}</strong>{question.owner && <small>Owner: {question.owner}</small>}</div><button onClick={() => updateMeeting(selected.id, (item) => ({ ...item, questions: item.questions.map((value) => value.id === question.id ? { ...value, resolved: !value.resolved } : value) }))}>{question.resolved ? 'Reopen' : 'Resolve'}</button></div>) : <p className="meeting-muted">No open questions.</p>}</section>
            </div>
            <section className="meeting-section meeting-actions">
              <h3>Next steps <span>{selectedActions.filter((task) => task.status !== 'done').length} open</span></h3>
              {selectedActions.map((task) => <div className="meeting-linked-action" key={task.id}><ActionRow task={task} ownerFallback={isSharedBoard ? 'Unassigned' : 'You'} onOpen={() => onOpenTask(task)} /><button className="meeting-unlink" aria-label={`Unlink ${task.title}`} title="Unlink from meeting" onClick={() => updateMeeting(selected.id, (item) => ({ ...item, actionTaskIds: item.actionTaskIds.filter((id) => id !== task.id) }))}><CloseIcon /></button></div>)}
              {selectedActions.length === 0 && <p className="meeting-muted">Add an action or link an existing task.</p>}
              {selected.actionTaskIds.length >= 100 && <p className="meeting-muted">This meeting has reached its action limit.</p>}
              <form className="meeting-action-form" onSubmit={(event) => { event.preventDefault(); createAction(selected) }}>
                <label>Action<input value={actionTitle} onChange={(event) => setActionTitle(event.target.value)} maxLength={500} placeholder="What needs to happen?" required /></label>
                <div className="meeting-action-fields"><label>Due<input type="date" value={actionDue} onChange={(event) => setActionDue(event.target.value)} /></label><label>Area<select value={actionArea || data.areas[0]?.id || ''} onChange={(event) => setActionArea(event.target.value)}>{data.areas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label></div>
                <div className="meeting-action-fields"><label>Priority<select value={actionPriority} onChange={(event) => setActionPriority(event.target.value as Priority)}>{PRIORITIES.map((priority) => <option value={priority.id} key={priority.id}>{priority.label}</option>)}</select></label>{isSharedBoard ? <label>Owner<select value={actionAssignee} onChange={(event) => setActionAssignee(event.target.value)} required><option value="">Select member</option>{members.map((member) => <option value={member.uid} key={member.uid}>{member.displayName || member.email || 'Board member'}</option>)}</select></label> : <label>Owner<input value="You" readOnly /></label>}</div>
                <button className="primary-button" type="submit" disabled={selected.actionTaskIds.length >= 100 || !data.areas.length}><PlusIcon />Create action task</button>
              </form>
              {linkableTasks.length > 0 && <div className="meeting-link-existing"><label htmlFor="meeting-existing-task">Link existing task</label><div><select id="meeting-existing-task" value={existingTaskId} onChange={(event) => setExistingTaskId(event.target.value)}><option value="">Choose a task</option>{linkableTasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select><button className="secondary-button" disabled={!existingTaskId || selected.actionTaskIds.length >= 100} onClick={() => { updateMeeting(selected.id, (item) => ({ ...item, actionTaskIds: [...item.actionTaskIds, existingTaskId] })); setExistingTaskId('') }}>Link</button></div></div>}
            </section>
          </div>
          <button className="meeting-delete" onClick={() => { if (!window.confirm('Delete this meeting? Its linked tasks will remain on the board.')) return; onChange((current) => ({ ...current, meetings: (current.meetings ?? []).filter((item) => item.id !== selected.id).map((item) => item.previousMeetingId === selected.id ? { ...item, previousMeetingId: selected.previousMeetingId, updatedAt: new Date().toISOString() } : item) })); setSelectedId(null) }}>Delete meeting</button>
        </>
      )}
      {draft && <MeetingEditor meeting={draft} onClose={() => setDraft(null)} onSave={saveMeeting} />}
    </div>
  )
}

function MeetingGroup({ title, meetings, tasks, onSelect }: { title: string; meetings: Meeting[]; tasks: Task[]; onSelect: (id: string) => void }) {
  if (meetings.length === 0) return null
  return <section className="meeting-group"><h2>{title}</h2><div className="meeting-card-grid">{meetings.map((meeting) => {
    const openCount = meeting.actionTaskIds.filter((id) => tasks.some((task) => task.id === id && task.status !== 'done')).length
    return <button className="meeting-card" key={meeting.id} onClick={() => onSelect(meeting.id)}><span className="meeting-date"><CalendarIcon />{dateLabel(meeting.date)}</span><strong>{meeting.title}</strong><span>{meeting.series || meeting.participants || 'Meeting notes'}</span><small>{openCount} open action{openCount === 1 ? '' : 's'} · {meeting.questions.filter((question) => !question.resolved).length} open question{meeting.questions.filter((question) => !question.resolved).length === 1 ? '' : 's'}</small></button>
  })}</div></section>
}

function ActionRow({ task, ownerFallback, onOpen }: { task: Task; ownerFallback: string; onOpen: () => void }) {
  return <button className={`meeting-action-row ${task.status === 'done' ? 'done' : ''}`} onClick={onOpen}><span className="meeting-action-status">{task.status === 'done' ? <CheckIcon /> : '○'}</span><span><strong>{task.title}</strong><small>{task.assigneeName || ownerFallback} · {task.status === 'done' ? 'Done' : isOverdue(task) ? 'Overdue' : task.dueDate ? formatDueDate(task.dueDate) : 'No due date'}</small></span><span className="meeting-action-arrow">→</span></button>
}

function MeetingEditor({ meeting, onClose, onSave }: { meeting: Meeting; onClose: () => void; onSave: (meeting: Meeting) => void }) {
  const [draft, setDraft] = useState(meeting)
  const addDecision = () => setDraft((current) => ({ ...current, decisions: [...current.decisions, { id: crypto.randomUUID(), text: '', reason: '' }] }))
  const addQuestion = () => setDraft((current) => ({ ...current, questions: [...current.questions, { id: crypto.randomUUID(), text: '', owner: '', resolved: false }] }))
  const updateDecision = (id: string, patch: Partial<MeetingDecision>) => setDraft((current) => ({ ...current, decisions: current.decisions.map((item) => item.id === id ? { ...item, ...patch } : item) }))
  const updateQuestion = (id: string, patch: Partial<MeetingQuestion>) => setDraft((current) => ({ ...current, questions: current.questions.map((item) => item.id === id ? { ...item, ...patch } : item) }))

  return <div className="modal-backdrop meeting-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><form className="settings-panel meeting-editor" onSubmit={(event) => { event.preventDefault(); if (draft.title.trim()) onSave(draft) }}>
    <div className="editor-header"><div><span className="editor-kicker">Meeting record</span><h2>{meeting.id ? 'Edit meeting' : 'New meeting'}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><CloseIcon /></button></div>
    <div className="field full-field"><label htmlFor="meeting-title">Title</label><input id="meeting-title" autoFocus required maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Weekly Tenacity catch-up" /></div>
    <div className="field-grid"><div className="field"><label htmlFor="meeting-date">Date</label><input id="meeting-date" type="date" required value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></div><div className="field"><label htmlFor="meeting-series">Series (optional)</label><input id="meeting-series" maxLength={120} value={draft.series} onChange={(event) => setDraft({ ...draft, series: event.target.value })} placeholder="Weekly operations" /></div></div>
    <div className="field full-field"><label htmlFor="meeting-participants">Participants</label><input id="meeting-participants" maxLength={2000} value={draft.participants} onChange={(event) => setDraft({ ...draft, participants: event.target.value })} placeholder="Tom, Josh…" /></div>
    <div className="field full-field"><label htmlFor="meeting-agenda">Agenda</label><textarea id="meeting-agenda" rows={3} maxLength={20000} value={draft.agenda} onChange={(event) => setDraft({ ...draft, agenda: event.target.value })} placeholder="What do we need to cover?" /></div>
    <div className="field full-field"><label htmlFor="meeting-notes">Notes</label><textarea id="meeting-notes" rows={5} maxLength={50000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Key discussion and context" /></div>
    <div className="meeting-editor-list"><div className="meeting-editor-list-heading"><strong>Decisions</strong><button type="button" onClick={addDecision} disabled={draft.decisions.length >= 50}><PlusIcon />Add decision</button></div>{draft.decisions.map((item) => <div className="meeting-editor-item" key={item.id}><input aria-label="Decision" maxLength={1000} value={item.text} onChange={(event) => updateDecision(item.id, { text: event.target.value })} placeholder="What was decided?" /><input aria-label="Decision reason" maxLength={2000} value={item.reason} onChange={(event) => updateDecision(item.id, { reason: event.target.value })} placeholder="Why? (optional)" /><button type="button" aria-label="Remove decision" onClick={() => setDraft((current) => ({ ...current, decisions: current.decisions.filter((value) => value.id !== item.id) }))}><CloseIcon /></button></div>)}</div>
    <div className="meeting-editor-list"><div className="meeting-editor-list-heading"><strong>Open questions</strong><button type="button" onClick={addQuestion} disabled={draft.questions.length >= 50}><PlusIcon />Add question</button></div>{draft.questions.map((item) => <div className="meeting-editor-item" key={item.id}><input aria-label="Open question" maxLength={1000} value={item.text} onChange={(event) => updateQuestion(item.id, { text: event.target.value })} placeholder="What still needs an answer?" /><input aria-label="Question owner" maxLength={160} value={item.owner} onChange={(event) => updateQuestion(item.id, { owner: event.target.value })} placeholder="Who will find out?" /><button type="button" aria-label="Remove question" onClick={() => setDraft((current) => ({ ...current, questions: current.questions.filter((value) => value.id !== item.id) }))}><CloseIcon /></button></div>)}</div>
    <div className="field full-field"><label htmlFor="meeting-next">Next meeting date (optional)</label><input id="meeting-next" type="date" value={draft.nextMeetingDate ?? ''} onChange={(event) => setDraft({ ...draft, nextMeetingDate: event.target.value || undefined })} /></div>
    <div className="panel-footer"><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">Save meeting</button></div>
  </form></div>
}
