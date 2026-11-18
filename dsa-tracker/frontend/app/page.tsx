'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, Circle, Clock3, Code2, ExternalLink, Flame, LayoutDashboard, ListChecks, Map, Pause, Play, Plus, RotateCcw, Search, Sparkles, Star, Target, Timer, X } from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify/unstyled';
import seed from '../lib/seed.json';

type Status = 'Todo' | 'In progress' | 'Solved' | 'Revisit';
type Problem = { id: number; title: string; topic_id: number; difficulty: string; url: string; status: Status; notes: string; starred: boolean; revision_date: string | null; solved_at: string | null };
type StudySession = { id: number; minutes: number; created_at: string };
type Data = { problems: Problem[]; sessions: StudySession[] };
type View = 'Overview' | 'My roadmap' | 'Problems' | 'Revision' | 'Bookmarks';
const initial: Data = { problems: seed.flatMap(t => t.problems.map(p => ({ ...p, status: 'Todo' as Status, notes: '', starred: false, revision_date: null, solved_at: null }))), sessions: [] };
const storageKey = 'algotrail-v1';
const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const statuses: Status[] = ['Todo', 'In progress', 'Solved', 'Revisit'];
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, { ...options, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Could not save your changes. Please try again.');
  return response.json();
}

export default function Home() {
  const [data, setData] = useState<Data>(initial);
  const [mode, setMode] = useState<'loading' | 'browser' | 'database'>('loading');
  const [view, setView] = useState<View>('Overview');
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<Problem | null>(null);
  const [notes, setNotes] = useState('');
  const [revision, setRevision] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const deadline = useRef(0);
  const [today, setToday] = useState(dateKey());

  useEffect(() => { let alive = true; request<Data>('state').then(value => { if (alive) { setData(value); setMode('database'); } }).catch(() => {
    if (!alive) return;
    try { const raw = localStorage.getItem(storageKey); if (raw) { const value = JSON.parse(raw); if (Array.isArray(value.problems) && Array.isArray(value.sessions)) setData(value); } } catch { toast.warning('Could not restore browser data. Starting with the practice plan.', { toastId: 'browser-restore' }); }
    setMode('browser');
  }); return () => { alive = false; }; }, []);
  useEffect(() => { if (mode === 'browser') { try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch { toast.warning('Browser storage is full or unavailable. Export your progress to keep it.', { toastId: 'browser-storage' }); } } }, [data, mode]);
  useEffect(() => { const tick = setInterval(() => setToday(dateKey()), 60000); return () => clearInterval(tick); }, []);
  useEffect(() => { if (!running) return; const tick = setInterval(() => { const left = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)); setSeconds(left); if (left === 0) setRunning(false); }, 250); return () => clearInterval(tick); }, [running]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelected(null); setAdding(false); } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, []);

  const solved = data.problems.filter(p => p.status === 'Solved');
  const percent = Math.round(solved.length / data.problems.length * 100);
  const due = data.problems.filter(p => (p.revision_date && p.revision_date <= today) || p.status === 'Revisit');
  const currentTopic = seed.find(t => data.problems.some(p => p.topic_id === t.id && p.status !== 'Solved')) || seed[seed.length - 1];
  const totalMinutes = data.sessions.reduce((sum, s) => sum + s.minutes, 0);
  const activeDates = new Set([...solved.filter(p => p.solved_at).map(p => dateKey(new Date(p.solved_at!))), ...data.sessions.map(s => dateKey(new Date(s.created_at)))]);
  let streak = 0; const cursor = new Date(); if (!activeDates.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (activeDates.has(dateKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  const weekDates = Array.from({length: 7}, (_, i) => { const day = new Date(); day.setDate(day.getDate() - 6 + i); return day; });
  const weekSolved = solved.filter(p => p.solved_at && dateKey(new Date(p.solved_at)) >= dateKey(weekDates[0])).length;
  const filtered = useMemo(() => data.problems.filter(p =>
    p.title.toLowerCase().includes(query.toLowerCase()) && (topic === 'all' || p.topic_id === Number(topic)) && (difficulty === 'all' || p.difficulty === difficulty) && (status === 'all' || p.status === status) && (view !== 'Bookmarks' || p.starred) && (view !== 'Revision' || (p.revision_date && p.revision_date <= today) || p.status === 'Revisit')
  ), [data, query, topic, difficulty, status, view, today]);
  const nextProblems = data.problems.filter(p => p.topic_id === currentTopic.id && p.status !== 'Solved').slice(0, 4);

  async function update(p: Problem, patch: Partial<Pick<Problem, 'status' | 'starred' | 'notes' | 'revision_date'>>) {
    if (busy || mode === 'loading') return false;
    setBusy(true);
    try {
      const updated = mode === 'database' ? await request<Problem>(`problems/${p.id}`, {method: 'PATCH', body: JSON.stringify(patch)}) : { ...p, ...patch, solved_at: patch.status ? patch.status === 'Solved' ? p.solved_at || new Date().toISOString() : null : p.solved_at };
      setData(old => ({ ...old, problems: old.problems.map(item => item.id === p.id ? updated : item) }));
      if (patch.status !== undefined) toast.success(`Problem marked as ${updated.status}.`);
      if (patch.starred !== undefined) {
        toast.success(updated.starred ? 'Problem bookmarked.' : 'Bookmark removed.');
      }
      return true;
    } catch (error) { toast.error((error as Error).message); return false; } finally { setBusy(false); }
  }
  function go(next: View) { setView(next); setTopic('all'); setQuery(''); setStatus('all'); setDifficulty('all'); }
  function openProblem(p: Problem) { setSelected(p); setNotes(p.notes); setRevision(p.revision_date || ''); }
  async function saveNotes() { if (selected && await update(selected, {notes, revision_date: revision || null})) { setSelected(null); toast.success('Notes and revision date saved.'); } }
  async function addProblem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy(true);
    const form = new FormData(event.currentTarget);
    const body = {title: String(form.get('title')).trim(), topic_id: Number(form.get('topic')), difficulty: String(form.get('difficulty')), url: String(form.get('url')).trim() || null};
    if (!body.title) { toast.error('Enter a problem title.'); setBusy(false); return; }
    if (body.url && !/^https?:\/\//i.test(body.url)) { toast.error('Use an http or https problem link.'); setBusy(false); return; }
    try {
      const p = mode === 'database' ? await request<Problem>('problems', {method:'POST', body:JSON.stringify(body)}) : {...body, url: body.url || '', id: Date.now(), status:'Todo' as Status, notes:'', starred:false, revision_date:null, solved_at:null};
      setData(old => ({...old, problems:[...old.problems, p]})); setAdding(false); toast.success('Problem added to your practice list.');
    } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); }
  }
  async function logSession() {
    if (busy) return; setBusy(true);
    try { const s = mode === 'database' ? await request<StudySession>('sessions', {method:'POST', body:JSON.stringify({minutes:25})}) : {id:Date.now(), minutes:25, created_at:new Date().toISOString()}; setData(old => ({...old, sessions:[...old.sessions,s]})); setSeconds(1500); toast.success('25-minute focus session saved. Well done!'); }
    catch(error) { toast.error((error as Error).message); } finally { setBusy(false); }
  }
  function exportProgress() { const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'})); const anchor = document.createElement('a'); anchor.href=url; anchor.download=`algotrail-${today}.json`; anchor.click(); URL.revokeObjectURL(url); toast.success('Progress exported.'); }

  function problemTable(problems: Problem[]) { return <div className="table-wrap"><table><thead><tr><th className="check-column">Done</th><th>Problem</th><th>Difficulty</th><th>Status</th><th className="star-column">Save</th></tr></thead><tbody>{problems.map(p => <tr key={p.id}>
    <td><button className={`check-btn ${p.status === 'Solved' ? 'checked' : ''}`} aria-label={`${p.status === 'Solved' ? 'Unmark' : 'Complete'} ${p.title}`} disabled={busy || mode === 'loading'} onClick={() => update(p,{status:p.status === 'Solved' ? 'Todo' : 'Solved'})}>{p.status === 'Solved' ? <Check size={14}/> : <span/>}</button></td>
    <td><button className="problem-name" onClick={() => openProblem(p)}>{p.title}</button><span className="topic-label">{seed.find(t => t.id === p.topic_id)?.name}{p.revision_date ? ` · Review ${p.revision_date}` : ''}</span></td>
    <td><span className={`difficulty ${p.difficulty.toLowerCase()}`}>{p.difficulty}</span></td>
    <td><select className={`status-select ${p.status === 'Solved' ? 'is-solved' : ''}`} aria-label={`Status for ${p.title}`} value={p.status} disabled={busy || mode === 'loading'} onChange={event => update(p,{status:event.target.value as Status})}>{statuses.map(s => <option key={s}>{s}</option>)}</select></td>
    <td><button className={`icon-btn ${p.starred ? 'starred' : ''}`} aria-label={`${p.starred ? 'Unbookmark' : 'Bookmark'} ${p.title}`} disabled={busy || mode === 'loading'} onClick={() => update(p,{starred:!p.starred})}><Star size={17} fill={p.starred ? 'currentColor' : 'none'}/></button></td>
  </tr>)}</tbody></table>{!problems.length && <div className="empty"><CheckCircle2 size={28}/><h3>{view === 'Revision' ? 'Your revision queue is clear' : 'No problems here yet'}</h3><p>{view === 'Revision' ? 'Set a revision date inside a problem, or mark it Revisit.' : 'Try a different filter or add a problem to your list.'}</p></div>}</div>; }

  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="/" aria-label="AlgoTrail home"><span className="brand-icon"><Code2 size={23}/></span>algo<span>trail</span><span className="brand-dot">.</span></a><div className="workspace"><span className="avatar">Y</span><div>Your workspace<small>One problem at a time</small></div><span className="workspace-dot"/></div>
      <p className="nav-heading">WORKSPACE</p><nav>{([[LayoutDashboard,'Overview'],[Map,'My roadmap'],[ListChecks,'Problems'],[RotateCcw,'Revision'],[Star,'Bookmarks']] as const).map(([Icon,label]) => <button key={label} className={`nav-item ${view === label ? 'active' : ''}`} onClick={() => go(label)}><Icon size={18}/>{label}{label === 'Revision' && due.length > 0 && <span className="nav-count">{due.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="small-inspiration"><span className="tiny-icon"><Sparkles size={17}/></span><h4>Small steps. Real progress.</h4><p>You don’t have to solve it all today. Just keep showing up.</p></div><a className="resource-link" href="https://takeuforward.org/prep-hub/strivers-a2z-dsa-sheet?open=none" target="_blank" rel="noreferrer"><BookOpen size={16}/>Striver’s A–Z sheet<ExternalLink size={14}/></a><div className="profile"><span className="avatar profile-avatar">Y</span><div>Your DSA journey<small>Personal workspace</small></div></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={14}/><span>{view}</span></div><div className="topbar-right"><span className={`connection ${mode}`}><i/>{mode === 'database' ? 'Database connected' : mode === 'browser' ? 'Browser-only mode' : 'Connecting…'}</span><button className="icon-btn" onClick={exportProgress} aria-label="Export progress"><ArrowDownToLine size={18}/></button><span className="avatar small-avatar">Y</span></div></header>
      <main><div className="page-heading"><div><div className="eyebrow">YOUR PERSONAL DSA COMPANION</div><h1>{view === 'Overview' ? 'A little better, every day.' : view === 'My roadmap' ? 'Your path to problem solving.' : view === 'Revision' ? 'Make it stick.' : view === 'Bookmarks' ? 'Keep the good ones close.' : 'One problem. One step forward.'}</h1><p>{view === 'Overview' ? 'Build your skills, find your rhythm, and make progress that lasts.' : view === 'My roadmap' ? '32 weeks of focused learning. Move at your own pace.' : view === 'Revision' ? 'Revisit the tricky ones and turn understanding into confidence.' : view === 'Bookmarks' ? 'Your saved problems, ready when you are.' : 'A curated starter collection inspired by your Striver A–Z roadmap.'}</p></div><button className="primary-btn" disabled={mode === 'loading'} onClick={() => setAdding(true)}><Plus size={17}/>Add problem</button></div>
      {mode === 'browser' && <div className="mode-notice"><span><i/>Progress is saved in this browser. Start the API to use PostgreSQL.</span><span>Separate from database progress</span></div>}
      {view === 'Overview' ? <>
        <section className="stats-grid" aria-label="Progress summary"><Stat icon={<CheckCircle2 size={19}/>} label="Problems solved" value={String(solved.length)} suffix={`/ ${data.problems.length}`} detail={`${percent}% of your practice collection`} color="mint"/><Stat icon={<Flame size={19}/>} label="Current streak" value={String(streak)} suffix={streak === 1 ? 'day' : 'days'} detail={streak ? 'Keep your momentum going' : 'Your first day starts today'} color="orange"/><Stat icon={<Clock3 size={19}/>} label="Focus time" value={String(Math.floor(totalMinutes / 60))} suffix={`h ${totalMinutes % 60}m`} detail={`${data.sessions.length} completed focus sessions`} color="purple"/><Stat icon={<RotateCcw size={19}/>} label="Ready to revisit" value={String(due.length)} suffix="problems" detail={due.length ? 'A little revision goes a long way' : 'All clear. Keep learning!'} color="blue"/></section>
        <div className="dashboard-grid"><div className="main-column"><section className="journey-card"><div className="journey-copy"><span className="pill"><span/>THE 32-WEEK JOURNEY</span><h2>Your future self<br/>will thank you.</h2><p>Start small. Think deeply. Build the problem-solving<br className="desktop-break"/> skills that stay with you.</p><button className="light-btn" onClick={() => {go('Problems'); setTopic(String(currentTopic.id));}}>Continue learning<ArrowRight size={16}/></button></div><div className="journey-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="art-grid"/><div className="code-tile tile-back">{'{ }'}</div><div className="code-tile tile-front"><Code2 size={50}/></div><span className="art-star star-one">✦</span><span className="art-star star-two">✧</span><div className="art-label"><span/>A little progress, every day</div></div></section>
        <section className="panel next-panel"><div className="panel-header"><div><h2>Up next for you <span className="muted-tag">{currentTopic.name}</span></h2><p>A focused practice list to keep you moving.</p></div><button className="text-btn" onClick={() => go('Problems')}>View all<ArrowRight size={15}/></button></div>{problemTable(nextProblems)}</section>
        <section className="panel activity-panel"><div className="panel-header"><div><h2>Consistency over intensity</h2><p>Every session counts. Here’s your last 7 days.</p></div><span className="activity-total">{weekSolved} solved</span></div><div className="activity-chart">{weekDates.map(day => {const key = dateKey(day); const count = solved.filter(p => p.solved_at && dateKey(new Date(p.solved_at)) === key).length; const minutes = data.sessions.filter(s => dateKey(new Date(s.created_at)) === key).reduce((v,s)=>v+s.minutes,0); return <div className="chart-day" key={key}><div className={`chart-track ${key === today ? 'today' : ''}`} title={`${count} solved · ${minutes} focus minutes`}><div className="chart-fill" style={{height:`${Math.min(100, count * 18 + minutes / 5)}%`}}/>{activeDates.has(key) && <span className="chart-number">{count}</span>}</div><span>{day.toLocaleDateString('en',{weekday:'short'})}</span><small>{day.getDate()}</small></div>; })}</div><div className="chart-legend"><span><i/>Solved problems + focus sessions</span><span>Today’s effort is tomorrow’s confidence.</span></div></section>
        </div><div className="right-column"><section className="panel progress-panel"><div className="panel-header"><h2>The big picture</h2><Target size={17}/></div><div className="progress-ring" style={{background:`conic-gradient(var(--accent) ${percent * 3.6}deg, #29312f 0deg)`}}><div><strong>{percent}<span>%</span></strong><small>overall progress</small></div></div><p className="progress-caption">{solved.length ? 'Look how far you’ve come.' : 'Every journey starts with one problem.'}</p><div className="difficulty-progress">{['Easy','Medium','Hard'].map(level => {const all = data.problems.filter(p=>p.difficulty===level); const completed=all.filter(p=>p.status==='Solved').length; return <div key={level}><div><span className={level.toLowerCase()}>{level}</span><span>{completed}<small> / {all.length}</small></span></div><div className="mini-track"><i className={level.toLowerCase()} style={{width:`${completed/all.length*100}%`}}/></div></div>;})}</div></section>
        <section className="panel focus-panel"><div className="panel-header"><h2>Time to focus</h2><Timer size={18}/></div><p>One task. No distractions.</p><div className="timer">{String(Math.floor(seconds/60)).padStart(2,'0')}<span>:</span>{String(seconds%60).padStart(2,'0')}</div><div className="timer-actions">{seconds === 0 ? <button className="primary-btn" disabled={busy} onClick={logSession}><Check size={16}/>Save session</button> : <button className="primary-btn" onClick={() => {if (!running) deadline.current=Date.now()+seconds*1000; setRunning(!running);}}>{running ? <Pause size={15}/> : <Play size={15}/>} {running ? 'Pause' : seconds < 1500 ? 'Resume' : 'Start focus'}</button>}<button className="reset-btn" aria-label="Reset timer" onClick={() => {setRunning(false); setSeconds(1500);}}><RotateCcw size={16}/></button></div><small>{seconds === 0 ? 'Session complete! Save it to your history.' : '25 minutes of progress, just for you.'}</small></section>
        <section className="weekly-card"><div><Target size={18}/><span>THIS WEEK’S TARGET</span></div><h3>{weekSolved}<span> / 10 problems</span></h3><div className="mini-track"><i style={{width:`${Math.min(100,weekSolved*10)}%`}}/></div><p>{weekSolved >= 10 ? 'Target reached. Take a moment to celebrate!' : `${10-weekSolved} more small wins. You’ve got this.`}</p></section></div></div>
      </> : view === 'My roadmap' ? <><div className="roadmap-summary"><Map size={22}/><div><strong>Your plan, your pace</strong><p>Study 2 hours a day, 6 days a week. Take longer whenever you need to.</p></div><span>{seed.filter(t=>data.problems.filter(p=>p.topic_id===t.id).every(p=>p.status==='Solved')).length} / 16 phases</span></div><div className="roadmap-grid">{seed.map(t => {const problems=data.problems.filter(p=>p.topic_id===t.id); const completed=problems.filter(p=>p.status==='Solved').length; return <button className={`roadmap-card ${t.id===currentTopic.id ? 'current' : ''}`} key={t.id} onClick={() => {go('Problems');setTopic(String(t.id));}}><div className="roadmap-top"><span className="phase-number">{completed===problems.length ? <Check size={20}/> : String(t.id).padStart(2,'0')}</span><span>WEEK {t.start}{t.end!==t.start ? `–${t.end}` : ''}</span>{t.id===currentTopic.id && <span className="current-label">UP NEXT</span>}</div><h2>{t.name}</h2><p>{t.description}</p><div className="mini-track"><i style={{width:`${completed/problems.length*100}%`}}/></div><div className="roadmap-footer"><span>{completed} / {problems.length} completed</span><ArrowRight size={16}/></div></button>;})}</div><p className="footnote">A curated practice collection, not a full copy of the official Striver sheet. Add more problems as you learn.</p></> : <section className="panel problems-panel"><div className="filters"><div className="search-box"><Search size={17}/><input aria-label="Search problems" placeholder="Search a problem…" value={query} onChange={e=>setQuery(e.target.value)}/></div><select aria-label="Filter by topic" value={topic} onChange={e=>setTopic(e.target.value)}><option value="all">All topics</option>{seed.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><select aria-label="Filter by difficulty" value={difficulty} onChange={e=>setDifficulty(e.target.value)}><option value="all">All difficulties</option>{['Easy','Medium','Hard'].map(d=><option key={d}>{d}</option>)}</select><select aria-label="Filter by status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option>{statuses.map(s=><option key={s}>{s}</option>)}</select></div><div className="results-count">{filtered.length} problems <span>Click a problem to add notes and schedule revision.</span></div>{problemTable(filtered)}</section>}
      <footer><span><Code2 size={14}/> Built for the long run.</span><span>Learn. Practise. Revisit. Repeat.</span></footer></main>
    </div>
    <ToastContainer position="bottom-center" theme="dark" autoClose={5000} limit={3} />
    {selected && <div className="modal-backdrop" onClick={()=>setSelected(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="problem-title" onClick={e=>e.stopPropagation()}><div className="modal-header"><span className="eyebrow">PROBLEM WORKSPACE</span><button className="icon-btn" aria-label="Close problem" onClick={()=>setSelected(null)}><X size={20}/></button></div><h2 id="problem-title">{selected.title}</h2><div className="modal-subtitle"><span className={`difficulty ${selected.difficulty.toLowerCase()}`}>{selected.difficulty}</span><span>{seed.find(t=>t.id===selected.topic_id)?.name}</span></div>{selected.url && <a className="practice-link" href={selected.url} target="_blank" rel="noreferrer">{selected.id < 10000 ? 'Open Striver’s practice sheet' : 'Open problem'}<ExternalLink size={15}/></a>}<label className="field">Your approach & notes<textarea autoFocus rows={7} maxLength={20000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="What was the key idea? Note the approach, time complexity, and anything to remember."/></label><label className="field">Next revision<input type="date" value={revision} onChange={e=>setRevision(e.target.value)}/></label><div className="revision-shortcuts">{[1,7,30].map(days=><button key={days} onClick={()=>{const d=new Date();d.setDate(d.getDate()+days);setRevision(dateKey(d));}}>In {days} {days===1?'day':'days'}</button>)}<button onClick={()=>setRevision('')}>Clear</button></div><div className="modal-footer"><button className="text-btn" onClick={()=>setSelected(null)}>Cancel</button><button className="primary-btn" disabled={busy || mode==='loading'} onClick={saveNotes}>{busy ? 'Saving…' : 'Save notes'}</button></div></section></div>}
    {adding && <div className="modal-backdrop" onClick={()=>setAdding(false)}><form className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title" onClick={e=>e.stopPropagation()} onSubmit={addProblem}><div className="modal-header"><span className="eyebrow">GROW YOUR COLLECTION</span><button type="button" className="icon-btn" aria-label="Close add problem" onClick={()=>setAdding(false)}><X size={20}/></button></div><h2 id="add-title">Add a new problem</h2><p className="muted">Make your practice plan your own.</p><label className="field">Problem name<input autoFocus name="title" required maxLength={160} placeholder="e.g. Search a 2D matrix"/></label><div className="form-row"><label className="field">Topic<select name="topic">{seed.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label><label className="field">Difficulty<select name="difficulty"><option>Easy</option><option>Medium</option><option>Hard</option></select></label></div><label className="field">Problem link <span>(optional)</span><input name="url" type="url" maxLength={2048} placeholder="https://…"/></label><div className="modal-footer"><button type="button" className="text-btn" onClick={()=>setAdding(false)}>Cancel</button><button className="primary-btn" disabled={busy}>{busy ? 'Adding…' : 'Add problem'}<Plus size={16}/></button></div></form></div>}
  </div>;
}

function Stat({icon,label,value,suffix,detail,color}: {icon:React.ReactNode;label:string;value:string;suffix:string;detail:string;color:string}) { return <div className="stat-card"><div className="stat-label">{label}<span className={`stat-icon ${color}`}>{icon}</span></div><div className="stat-value">{value}<span>{suffix}</span></div><p>{detail}</p></div>; }
