'use client';

import { FormEvent, ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';

type Tab = 'today' | 'plan' | 'learn' | 'more';
type Modal = 'event' | 'need' | 'shift' | 'check' | 'note' | null;
type Editing = { kind: Exclude<Modal, null>; id: string } | null;

type StaffingNeed = { id: string; role: string; start: string; end: string; count: number };
type Shift = { id: string; person: string; role: string; start: string; end: string; breakMinutes: number };
type CheckItem = { id: string; title: string; due: string; done: boolean };
type Note = { id: string; text: string; createdAt: string };
type EventPlan = {
  id: string;
  name: string;
  date: string;
  venue: string;
  needs: StaffingNeed[];
  shifts: Shift[];
  checks: CheckItem[];
  notes: Note[];
};

type PrototypeState = { events: EventPlan[]; activeEventId: string | null; previewRole: 'manager' | 'staff' };

const STORAGE_KEY = 'showops.prototype.v1';
const EMPTY_STATE: PrototypeState = { events: [], activeEventId: null, previewRole: 'manager' };

const sampleEvent: EventPlan = {
  id: 'sample-event',
  name: 'Harbour Night Market',
  date: '2026-09-12',
  venue: 'Demo Pavilion',
  needs: [{ id: 'sample-need', role: 'Front counter', start: '17:00', end: '20:00', count: 2 }],
  shifts: [{ id: 'sample-shift', person: 'Demo Crew A', role: 'Front counter', start: '17:00', end: '20:00', breakMinutes: 0 }],
  checks: [{ id: 'sample-check', title: 'Confirm opening kit', due: '16:45', done: false }],
  notes: [],
};

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function displayDate(value: string) {
  if (!value) return 'Date not set';
  return new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
}

function todayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function Field({ label, name, children, hint }: { label: string; name: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field" htmlFor={name}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Sheet({ open, title, description, onClose, children }: { open: boolean; title: string; description: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="sheet" onCancel={onClose} onClose={onClose} aria-labelledby={titleId}>
      <div className="sheet-handle" aria-hidden="true" />
      <div className="sheet-heading">
        <div>
          <p className="eyebrow">Add to the day</p>
          <h2 id={titleId}>{title}</h2>
          <p>{description}</p>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close">×</button>
      </div>
      {children}
    </dialog>
  );
}

export default function Home() {
  const [data, setData] = useState<PrototypeState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>('today');
  const [modal, setModal] = useState<Modal>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [formError, setFormError] = useState('');
  const [saveMessage, setSaveMessage] = useState('Saved on this device');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) setData(JSON.parse(stored) as PrototypeState);
      } catch {
        setSaveMessage('Local storage unavailable — new changes may not survive reload');
      } finally {
        setHydrated(true);
      }
    }, 0);
    const updateConnection = () => setOnline(navigator.onLine);
    const updateSaveMessage = (event: Event) => setSaveMessage((event as CustomEvent<string>).detail);
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    window.addEventListener('showops-storage-status', updateSaveMessage);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=3', { updateViaCache: 'none' }).then((registration) => registration.update()).catch(() => undefined);
    return () => {
      window.clearTimeout(loadTimer);
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
      window.removeEventListener('showops-storage-status', updateSaveMessage);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      window.dispatchEvent(new CustomEvent('showops-storage-status', { detail: 'Saved on this device' }));
    } catch {
      window.dispatchEvent(new CustomEvent('showops-storage-status', { detail: 'Couldn’t save — keep this page open and copy important entries' }));
    }
  }, [data, hydrated]);

  const activeEvent = data.events.find((event) => event.id === data.activeEventId) ?? data.events[0] ?? null;

  const coverage = useMemo(() => {
    if (!activeEvent) return [];
    return activeEvent.needs.map((need) => {
      const assigned = activeEvent.shifts.filter((shift) => shift.role.toLowerCase() === need.role.toLowerCase() && shift.start < need.end && shift.end > need.start).length;
      return { ...need, assigned, shortage: Math.max(0, need.count - assigned) };
    });
  }, [activeEvent]);

  const totalShortage = coverage.reduce((total, item) => total + item.shortage, 0);
  const incompleteChecks = activeEvent?.checks.filter((check) => !check.done) ?? [];

  function updateActive(transform: (event: EventPlan) => EventPlan) {
    if (!activeEvent) return;
    setData((current) => ({ ...current, events: current.events.map((event) => event.id === activeEvent.id ? transform(event) : event) }));
  }

  function closeModal() {
    setModal(null);
    setEditing(null);
    setFormError('');
  }

  function openAdd(kind: Exclude<Modal, null>) {
    setEditing(null);
    setFormError('');
    setModal(kind);
  }

  function openEdit(kind: Exclude<Modal, null>, id: string) {
    setEditing({ kind, id });
    setFormError('');
    setModal(kind);
  }

  function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const date = String(form.get('date') ?? '');
    const venue = String(form.get('venue') ?? '').trim();
    if (!name || !date) return setFormError('Add an event name and date.');
    if (editing?.kind === 'event') {
      setData((current) => ({ ...current, events: current.events.map((item) => item.id === editing.id ? { ...item, name, date, venue } : item) }));
      closeModal();
      return;
    }
    const item: EventPlan = { id: createId(), name, date, venue, needs: [], shifts: [], checks: [], notes: [] };
    setData((current) => ({ ...current, events: [...current.events, item], activeEventId: item.id }));
    setTab('plan');
    closeModal();
  }

  function addNeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const role = String(form.get('role') ?? '').trim();
    const start = String(form.get('start') ?? '');
    const end = String(form.get('end') ?? '');
    const count = Number(form.get('count'));
    if (!role || !start || !end || count < 1) return setFormError('Complete each staffing field.');
    if (end <= start) return setFormError('End time must be later than start time.');
    updateActive((item) => ({ ...item, needs: editing?.kind === 'need' ? item.needs.map((entry) => entry.id === editing.id ? { ...entry, role, start, end, count } : entry) : [...item.needs, { id: createId(), role, start, end, count }] }));
    closeModal();
  }

  function addShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const person = String(form.get('person') ?? '').trim();
    const role = String(form.get('role') ?? '').trim();
    const start = String(form.get('start') ?? '');
    const end = String(form.get('end') ?? '');
    const breakMinutes = Number(form.get('breakMinutes') ?? 0);
    if (!person || !role || !start || !end) return setFormError('Add a person, role, start, and end time.');
    if (end <= start) return setFormError('End time must be later than start time.');
    updateActive((item) => ({ ...item, shifts: editing?.kind === 'shift' ? item.shifts.map((entry) => entry.id === editing.id ? { ...entry, person, role, start, end, breakMinutes } : entry) : [...item.shifts, { id: createId(), person, role, start, end, breakMinutes }] }));
    closeModal();
  }

  function addCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? '').trim();
    const due = String(form.get('due') ?? '');
    if (!title || !due) return setFormError('Add a check and due time.');
    updateActive((item) => ({ ...item, checks: editing?.kind === 'check' ? item.checks.map((entry) => entry.id === editing.id ? { ...entry, title, due } : entry) : [...item.checks, { id: createId(), title, due, done: false }] }));
    closeModal();
  }

  function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = String(form.get('text') ?? '').trim();
    if (!text) return setFormError('Write a short operational note.');
    updateActive((item) => ({ ...item, notes: editing?.kind === 'note' ? item.notes.map((entry) => entry.id === editing.id ? { ...entry, text } : entry) : [{ id: createId(), text, createdAt: new Date().toISOString() }, ...item.notes] }));
    setTab('learn');
    closeModal();
  }

  function deleteEvent(id: string) {
    const remaining = data.events.filter((event) => event.id !== id);
    setData((current) => ({ ...current, events: remaining, activeEventId: remaining[0]?.id ?? null }));
  }

  function loadSample() {
    setData((current) => ({ ...current, events: current.events.some((event) => event.id === sampleEvent.id) ? current.events : [...current.events, sampleEvent], activeEventId: sampleEvent.id }));
    setTab('today');
    setConfirmReset(false);
  }

  function removeWithConfirmation(kind: 'needs' | 'shifts' | 'checks', id: string, label: string) {
    if (!confirm(`Delete “${label}” from this local prototype?`)) return;
    updateActive((item) => ({ ...item, [kind]: item[kind].filter((entry: { id: string }) => entry.id !== id) }));
  }

  const editingEvent = editing?.kind === 'event' ? data.events.find((item) => item.id === editing.id) : null;
  const editingNeed = editing?.kind === 'need' ? activeEvent?.needs.find((item) => item.id === editing.id) : null;
  const editingShift = editing?.kind === 'shift' ? activeEvent?.shifts.find((item) => item.id === editing.id) : null;
  const editingCheck = editing?.kind === 'check' ? activeEvent?.checks.find((item) => item.id === editing.id) : null;
  const editingNote = editing?.kind === 'note' ? activeEvent?.notes.find((item) => item.id === editing.id) : null;

  if (!hydrated) return <main className="loading-screen"><span className="brand-mark">S</span><p>Opening today’s plan…</p></main>;

  return (
    <main className="app-shell">
      <aside className="side-nav">
        <a className="brand" href="#main" aria-label="ShowOps home"><span className="brand-mark">S</span><span>ShowOps</span></a>
        <Nav tab={tab} setTab={setTab} />
        <div className="side-note"><strong>Local prototype</strong><span>Use fictional details only.</span></div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <a className="mobile-brand brand" href="#main" aria-label="ShowOps home"><span className="brand-mark">S</span><span>ShowOps</span></a>
          <div className="event-switcher">
            {activeEvent ? (
              <select aria-label="Current event" value={activeEvent.id} onChange={(e) => setData((current) => ({ ...current, activeEventId: e.target.value }))}>
                {data.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
              </select>
            ) : <span>No event yet</span>}
          </div>
          <span className={`connection-badge ${online ? '' : 'offline'}`}><span aria-hidden="true">{online ? '●' : '○'}</span>{online ? saveMessage : 'Offline · saved locally'}</span>
        </header>

        {!online && <div className="offline-banner" role="status">You’re offline. This prototype still saves changes on this device; nothing is sent to a team.</div>}
        <div className="live-region" aria-live="polite" aria-atomic="true">{saveMessage}</div>

        <section className="page" id="main">
          {tab === 'today' && <TodayView activeEvent={activeEvent} previewRole={data.previewRole} coverage={coverage} shortage={totalShortage} incompleteChecks={incompleteChecks} setModal={openAdd} toggleCheck={(id) => updateActive((item) => ({ ...item, checks: item.checks.map((check) => check.id === id ? { ...check, done: !check.done } : check) }))} createEvent={() => openAdd('event')} goPlan={() => setTab('plan')} loadSample={loadSample} />}
          {tab === 'plan' && <PlanView activeEvent={activeEvent} coverage={coverage} setModal={openAdd} edit={openEdit} createEvent={() => openAdd('event')} deleteEvent={deleteEvent} remove={removeWithConfirmation} />}
          {tab === 'learn' && <LearnView activeEvent={activeEvent} setModal={openAdd} edit={openEdit} removeNote={(id, label) => confirm(`Delete this note: “${label}”?`) && updateActive((item) => ({ ...item, notes: item.notes.filter((note) => note.id !== id) }))} createEvent={() => openAdd('event')} />}
          {tab === 'more' && <MoreView data={data} setData={setData} loadSample={loadSample} confirmReset={confirmReset} setConfirmReset={setConfirmReset} />}
        </section>

        <div className="mobile-nav"><Nav tab={tab} setTab={setTab} /></div>
      </div>

      <Sheet open={modal === 'event'} title={editingEvent ? 'Edit event' : 'Create an event'} description="Start small. You can add the operational detail next." onClose={closeModal}>
        <form key={`event-${editingEvent?.id ?? 'new'}`} className="sheet-form" onSubmit={createEvent}>
          <Field label="Event name" name="name"><input id="name" name="name" maxLength={80} autoFocus placeholder="e.g. Riverside Market" defaultValue={editingEvent?.name} required /></Field>
          <div className="field-row">
            <Field label="Date" name="date"><input id="date" name="date" type="date" defaultValue={editingEvent?.date ?? todayDate()} required /></Field>
            <Field label="Location (optional)" name="venue"><input id="venue" name="venue" maxLength={80} placeholder="e.g. Demo Pavilion" defaultValue={editingEvent?.venue} /></Field>
          </div>
          <FormFooter error={formError} onCancel={closeModal} action={editingEvent ? 'Save changes' : 'Create event'} />
        </form>
      </Sheet>

      <Sheet open={modal === 'need'} title={editingNeed ? 'Edit staffing need' : 'Add staffing need'} description="Describe what good coverage looks like for one role and time window." onClose={closeModal}>
        <form key={`need-${editingNeed?.id ?? 'new'}`} className="sheet-form" onSubmit={addNeed}>
          <Field label="Role" name="role"><input id="role" name="role" maxLength={50} autoFocus placeholder="e.g. Front counter" defaultValue={editingNeed?.role} required /></Field>
          <div className="field-row three">
            <Field label="Start" name="start"><input id="start" name="start" type="time" defaultValue={editingNeed?.start ?? '09:00'} required /></Field>
            <Field label="End" name="end"><input id="end" name="end" type="time" defaultValue={editingNeed?.end ?? '12:00'} required /></Field>
            <Field label="People needed" name="count"><input id="count" name="count" type="number" min="1" max="50" defaultValue={editingNeed?.count ?? 1} required /></Field>
          </div>
          <FormFooter error={formError} onCancel={closeModal} action={editingNeed ? 'Save changes' : 'Add need'} />
        </form>
      </Sheet>

      <Sheet open={modal === 'shift'} title={editingShift ? 'Edit shift' : 'Add a shift'} description="Add the person inline—no separate staff setup required for this prototype." onClose={closeModal}>
        <form key={`shift-${editingShift?.id ?? 'new'}`} className="sheet-form" onSubmit={addShift}>
          <div className="field-row">
            <Field label="Person or alias" name="person" hint="Use fictional details in this public prototype."><input id="person" name="person" maxLength={50} autoFocus placeholder="e.g. Demo Crew B" defaultValue={editingShift?.person} required /></Field>
            <Field label="Role" name="shift-role"><input id="shift-role" name="role" maxLength={50} placeholder="e.g. Front counter" defaultValue={editingShift?.role} required /></Field>
          </div>
          <div className="field-row three">
            <Field label="Start" name="shift-start"><input id="shift-start" name="start" type="time" defaultValue={editingShift?.start ?? '09:00'} required /></Field>
            <Field label="End" name="shift-end"><input id="shift-end" name="end" type="time" defaultValue={editingShift?.end ?? '12:00'} required /></Field>
            <Field label="Break minutes" name="breakMinutes"><input id="breakMinutes" name="breakMinutes" type="number" min="0" max="240" defaultValue={editingShift?.breakMinutes ?? 0} /></Field>
          </div>
          <FormFooter error={formError} onCancel={closeModal} action={editingShift ? 'Save changes' : 'Add shift'} />
        </form>
      </Sheet>

      <Sheet open={modal === 'check'} title={editingCheck ? 'Edit run-sheet check' : 'Add a run-sheet check'} description="Make the next action clear enough for someone working under pressure." onClose={closeModal}>
        <form key={`check-${editingCheck?.id ?? 'new'}`} className="sheet-form" onSubmit={addCheck}>
          <Field label="Check" name="title"><input id="title" name="title" maxLength={100} autoFocus placeholder="e.g. Confirm opening kit" defaultValue={editingCheck?.title} required /></Field>
          <Field label="Due time" name="due"><input id="due" name="due" type="time" defaultValue={editingCheck?.due ?? '09:00'} required /></Field>
          <FormFooter error={formError} onCancel={closeModal} action={editingCheck ? 'Save changes' : 'Add check'} />
        </form>
      </Sheet>

      <Sheet open={modal === 'note'} title={editingNote ? 'Edit operational note' : 'Capture what happened'} description="A short note now becomes useful context next time." onClose={closeModal}>
        <form key={`note-${editingNote?.id ?? 'new'}`} className="sheet-form" onSubmit={addNote}>
          <Field label="Operational note" name="text"><textarea id="text" name="text" maxLength={300} rows={5} autoFocus placeholder="What should the next event remember?" defaultValue={editingNote?.text} required /></Field>
          <FormFooter error={formError} onCancel={closeModal} action={editingNote ? 'Save changes' : 'Save note'} />
        </form>
      </Sheet>
    </main>
  );
}

function Nav({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  const items: { key: Tab; label: string; icon: string }[] = [
    { key: 'today', label: 'Today', icon: '●' },
    { key: 'plan', label: 'Plan', icon: '□' },
    { key: 'learn', label: 'Learn', icon: '◇' },
    { key: 'more', label: 'More', icon: '···' },
  ];
  return <nav className="nav-list" aria-label="Primary">{items.map((item) => <button key={item.key} className={tab === item.key ? 'active' : ''} type="button" aria-current={tab === item.key ? 'page' : undefined} onClick={() => setTab(item.key)}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}</nav>;
}

function FormFooter({ error, onCancel, action }: { error: string; onCancel: () => void; action: string }) {
  return <><p className="form-error" role="alert">{error}</p><div className="form-actions"><button className="quiet-button" type="button" onClick={onCancel}>Cancel</button><button className="primary-button" type="submit">{action}</button></div></>;
}

function TodayView({ activeEvent, previewRole, coverage, shortage, incompleteChecks, setModal, toggleCheck, createEvent, goPlan, loadSample }: { activeEvent: EventPlan | null; previewRole: 'manager' | 'staff'; coverage: Array<StaffingNeed & { assigned: number; shortage: number }>; shortage: number; incompleteChecks: CheckItem[]; setModal: (modal: Exclude<Modal, null>) => void; toggleCheck: (id: string) => void; createEvent: () => void; goPlan: () => void; loadSample: () => void }) {
  if (!activeEvent) return <EmptyStart createEvent={createEvent} loadSample={loadSample} />;
  const nextShift = activeEvent.shifts[0];
  return <>
    <PageHeader eyebrow={previewRole === 'manager' ? 'Manager preview' : 'Staff preview'} title={previewRole === 'manager' ? `${activeEvent.name} — today` : 'Your shift today'} meta={`${displayDate(activeEvent.date)}${activeEvent.venue ? ` · ${activeEvent.venue}` : ''}`} action={<button className="primary-button" type="button" onClick={() => setModal('note')}>+ Add note</button>} />
    {previewRole === 'manager' ? <>
      <div className="metric-grid">
        <Metric tone={shortage ? 'warning' : 'success'} value={shortage ? String(shortage) : 'Clear'} label={shortage ? 'staffing gap' : 'coverage status'} />
        <Metric value={String(activeEvent.shifts.length)} label="people on the plan" />
        <Metric value={String(incompleteChecks.length)} label="checks remaining" />
      </div>
      {coverage.length ? <section className="panel"><SectionHeading kicker="Coverage" title="Where the day needs attention" action={<button className="text-button" type="button" onClick={goPlan}>Open plan →</button>} />
        <div className="coverage-list">{coverage.map((item) => <div className="coverage-row" key={item.id}><div><strong>{item.role}</strong><span>{item.start}–{item.end}</span></div><div className="coverage-track" aria-label={`${item.assigned} of ${item.count} assigned`}><span style={{ width: `${Math.min(100, item.assigned / item.count * 100)}%` }} /></div><span className={`status-pill ${item.shortage ? 'warning' : 'success'}`}>{item.shortage ? `${item.shortage} short` : 'Covered'}</span></div>)}</div>
        <p className="fine-print">Prototype planning signal only. Breaks are shown on shifts but are not yet deducted from this estimate.</p>
      </section> : <PromptCard title="Add what good coverage looks like" copy="Create one staffing need, then add a shift and watch the gap update." action="Add staffing need" onClick={() => setModal('need')} />}
    </> : <section className="shift-hero">{nextShift ? <><p className="eyebrow">Next up</p><p className="shift-time">{nextShift.start}</p><h2>{nextShift.role}</h2><p>{nextShift.person} · until {nextShift.end}{nextShift.breakMinutes ? ` · ${nextShift.breakMinutes} min break` : ''}</p></> : <><p className="eyebrow">Nothing assigned yet</p><h2>Your shift will appear here</h2><p>Switch back to manager preview under More to add the first shift.</p></>}</section>}
    <section className="panel"><SectionHeading kicker="Run sheet" title="Next checks" action={previewRole === 'manager' ? <button className="text-button" type="button" onClick={() => setModal('check')}>+ Add check</button> : undefined} />
      {activeEvent.checks.length ? <div className="check-list">{activeEvent.checks.map((check) => <label className={`check-row ${check.done ? 'done' : ''}`} key={check.id}><input type="checkbox" checked={check.done} onChange={() => toggleCheck(check.id)} /><span className="check-control" aria-hidden="true">{check.done ? '✓' : ''}</span><span><strong>{check.title}</strong><small>{check.done ? 'Completed — tap to reopen' : `Due ${check.due}`}</small></span></label>)}</div> : <p className="empty-copy">No checks yet. Add the first task the team must confirm.</p>}
    </section>
  </>;
}

function EmptyStart({ createEvent, loadSample }: { createEvent: () => void; loadSample?: () => void }) {
  return <section className="welcome"><p className="eyebrow">Today, without the scramble</p><h1>Run the event.<br />Keep what you learn.</h1><p className="intro">Build a clear event day, spot staffing gaps, and capture useful context as the work happens.</p><div className="empty-card"><div className="empty-icon" aria-hidden="true">+</div><div><h2>Create your first event</h2><p>Start with your own fictional event. ShowOps will build the operational picture with you.</p></div><button className="primary-button" type="button" onClick={createEvent}>Create event</button></div>{loadSample && <button className="sample-link" type="button" onClick={loadSample}>Or explore one tiny synthetic example</button>}</section>;
}

function PlanView({ activeEvent, coverage, setModal, edit, createEvent, deleteEvent, remove }: { activeEvent: EventPlan | null; coverage: Array<StaffingNeed & { assigned: number; shortage: number }>; setModal: (modal: Exclude<Modal, null>) => void; edit: (kind: Exclude<Modal, null>, id: string) => void; createEvent: () => void; deleteEvent: (id: string) => void; remove: (kind: 'needs' | 'shifts' | 'checks', id: string, label: string) => void }) {
  if (!activeEvent) return <EmptyStart createEvent={createEvent} />;
  return <><PageHeader eyebrow="Plan" title={activeEvent.name} meta={`${displayDate(activeEvent.date)}${activeEvent.venue ? ` · ${activeEvent.venue}` : ''}`} action={<div className="button-row"><button className="quiet-button" type="button" onClick={() => edit('event', activeEvent.id)}>Edit event</button><button className="primary-button" type="button" onClick={createEvent}>+ New event</button></div>} />
    <div className="readiness"><span className={activeEvent.needs.length ? 'complete' : ''}>{activeEvent.needs.length ? '✓' : '1'} Add staffing need</span><span className={activeEvent.shifts.length ? 'complete' : ''}>{activeEvent.shifts.length ? '✓' : '2'} Add shift</span><span className={activeEvent.checks.length ? 'complete' : ''}>{activeEvent.checks.length ? '✓' : '3'} Add run-sheet check</span></div>
    <section className="panel"><SectionHeading kicker="Staffing needs" title="What good coverage looks like" action={<button className="text-button" type="button" onClick={() => setModal('need')}>+ Add need</button>} />{coverage.length ? <div className="record-list">{coverage.map((item) => <Record key={item.id} title={item.role} meta={`${item.start}–${item.end} · ${item.count} needed`} status={item.shortage ? `${item.shortage} short` : 'Covered'} tone={item.shortage ? 'warning' : 'success'} onEdit={() => edit('need', item.id)} onDelete={() => remove('needs', item.id, item.role)} />)}</div> : <p className="empty-copy">No staffing needs yet. Add one time window and role.</p>}</section>
    <section className="panel"><SectionHeading kicker="Shifts" title="Who is working" action={<button className="text-button" type="button" onClick={() => setModal('shift')}>+ Add shift</button>} />{activeEvent.shifts.length ? <div className="record-list">{activeEvent.shifts.map((shift) => <Record key={shift.id} title={shift.person} meta={`${shift.role} · ${shift.start}–${shift.end}${shift.breakMinutes ? ` · ${shift.breakMinutes}m break` : ''}`} onEdit={() => edit('shift', shift.id)} onDelete={() => remove('shifts', shift.id, `${shift.person} shift`)} />)}</div> : <p className="empty-copy">No shifts yet. Add the first person working this day.</p>}</section>
    <section className="panel"><SectionHeading kicker="Run sheet" title="What must be confirmed" action={<button className="text-button" type="button" onClick={() => setModal('check')}>+ Add check</button>} />{activeEvent.checks.length ? <div className="record-list">{activeEvent.checks.map((check) => <Record key={check.id} title={check.title} meta={`Due ${check.due}`} status={check.done ? 'Complete' : 'Open'} tone={check.done ? 'success' : undefined} onEdit={() => edit('check', check.id)} onDelete={() => remove('checks', check.id, check.title)} />)}</div> : <p className="empty-copy">No checks yet. Add the first task the team must confirm.</p>}</section>
    <button className="danger-link" type="button" onClick={() => confirm(`Delete “${activeEvent.name}” and its local prototype data?`) && deleteEvent(activeEvent.id)}>Delete this event</button>
  </>;
}

function LearnView({ activeEvent, setModal, edit, removeNote, createEvent }: { activeEvent: EventPlan | null; setModal: (modal: Exclude<Modal, null>) => void; edit: (kind: Exclude<Modal, null>, id: string) => void; removeNote: (id: string, label: string) => void; createEvent: () => void }) {
  if (!activeEvent) return <EmptyStart createEvent={createEvent} />;
  return <><PageHeader eyebrow="Learn" title="Make next time easier" meta={activeEvent.name} action={<button className="primary-button" type="button" onClick={() => setModal('note')}>+ Capture note</button>} />
    {activeEvent.notes.length ? <div className="note-grid">{activeEvent.notes.map((note) => <article className="note-card" key={note.id}><p>{note.text}</p><footer><time>{new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(note.createdAt))}</time><span><button type="button" onClick={() => edit('note', note.id)} aria-label={`Edit note: ${note.text}`}>Edit</button><button type="button" onClick={() => removeNote(note.id, note.text)} aria-label={`Delete note: ${note.text}`}>Delete</button></span></footer></article>)}</div> : <section className="large-empty"><span aria-hidden="true">◇</span><h2>No lessons yet</h2><p>Notes captured during the event will appear here. Keep them short and useful.</p><button className="primary-button" type="button" onClick={() => setModal('note')}>Capture the first note</button></section>}
  </>;
}

function MoreView({ data, setData, loadSample, confirmReset, setConfirmReset }: { data: PrototypeState; setData: React.Dispatch<React.SetStateAction<PrototypeState>>; loadSample: () => void; confirmReset: boolean; setConfirmReset: (value: boolean) => void }) {
  return <><PageHeader eyebrow="Prototype settings" title="Shape the experience" meta="Nothing here changes a real team or cloud service." />
    <section className="panel"><SectionHeading kicker="Preview" title="See the day from each role" /><div className="segmented" role="group" aria-label="Preview role"><button type="button" className={data.previewRole === 'manager' ? 'active' : ''} onClick={() => setData((current) => ({ ...current, previewRole: 'manager' }))}>Manager</button><button type="button" className={data.previewRole === 'staff' ? 'active' : ''} onClick={() => setData((current) => ({ ...current, previewRole: 'staff' }))}>Staff</button></div><p className="fine-print">This previews different information priorities only. Authentication and permissions are not implemented.</p></section>
    <section className="panel privacy-panel"><SectionHeading kicker="Your data" title="Saved only in this browser" /><p>This public prototype has no account, backend, sync, analytics, or recovery. Anyone using this browser profile may see what you enter. Use fictional details only.</p><div className="button-row"><button className="quiet-button" type="button" onClick={loadSample}>Add tiny sample</button>{confirmReset ? <><button className="danger-button" type="button" onClick={() => { setData(EMPTY_STATE); setConfirmReset(false); }}>Yes, clear local data</button><button className="text-button" type="button" onClick={() => setConfirmReset(false)}>Cancel</button></> : <button className="danger-link" type="button" onClick={() => setConfirmReset(true)}>Clear prototype data</button>}</div></section>
    <section className="panel"><SectionHeading kicker="Install" title="Keep ShowOps close at hand" /><p className="empty-copy">After this page has loaded once, your browser can keep the prototype shell available offline. Use your browser’s “Install app” or “Add to Home Screen” option.</p></section>
  </>;
}

function PageHeader({ eyebrow, title, meta, action }: { eyebrow: string; title: string; meta: string; action?: ReactNode }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-meta">{meta}</p></div>{action}</header>;
}

function SectionHeading({ kicker, title, action }: { kicker: string; title: string; action?: ReactNode }) {
  return <div className="section-heading"><div><p>{kicker}</p><h2>{title}</h2></div>{action}</div>;
}

function Metric({ value, label, tone }: { value: string; label: string; tone?: 'warning' | 'success' }) {
  return <div className={`metric ${tone ?? ''}`}><strong>{value}</strong><span>{label}</span></div>;
}

function PromptCard({ title, copy, action, onClick }: { title: string; copy: string; action: string; onClick: () => void }) {
  return <section className="prompt-card"><span className="empty-icon" aria-hidden="true">+</span><div><h2>{title}</h2><p>{copy}</p></div><button className="primary-button" type="button" onClick={onClick}>{action}</button></section>;
}

function Record({ title, meta, status, tone, onEdit, onDelete }: { title: string; meta: string; status?: string; tone?: 'warning' | 'success'; onEdit: () => void; onDelete: () => void }) {
  return <div className="record"><div><strong>{title}</strong><span>{meta}</span></div>{status && <span className={`status-pill ${tone ?? ''}`}>{status}</span>}<div className="record-actions"><button type="button" onClick={onEdit} aria-label={`Edit ${title}`}>Edit</button><button type="button" onClick={onDelete} aria-label={`Delete ${title}`}>Delete</button></div></div>;
}
