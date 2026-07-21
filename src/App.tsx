import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Clock3,
  LayoutDashboard,
  Plus,
  Rocket,
  Search,
  Sparkles,
  Target,
  X,
} from 'lucide-react'
import NamEngineOpenAIUsage from './NamEngineOpenAIUsage'

type Status = 'Active' | 'Planning' | 'Paused' | 'Launched'
type Priority = 'Critical' | 'High' | 'Medium' | 'Low'

type Project = {
  id: number
  name: string
  description: string
  status: Status
  priority: Priority
  progress: number
  nextAction: string
  owner: string
  url?: string
}

const seedProjects: Project[] = [
  {
    id: 1,
    name: 'Namengine Baby',
    description: 'AI-guided baby-name discovery and recommendation engine.',
    status: 'Active',
    priority: 'Critical',
    progress: 72,
    nextAction: 'Complete engine audit view and lock launch eval fixtures.',
    owner: 'Dan',
    url: 'https://namengine-platform-app.onrender.com',
  },
  {
    id: 2,
    name: 'Mission Control',
    description: 'Operating dashboard for products, projects, decisions, and execution.',
    status: 'Active',
    priority: 'High',
    progress: 28,
    nextAction: 'Ship portfolio dashboard v0.1 and deploy it.',
    owner: 'Dan + CTO',
  },
  {
    id: 3,
    name: 'Coach Dan',
    description: 'Pickleball coaching system, curriculum, content, and client workflow.',
    status: 'Planning',
    priority: 'High',
    progress: 35,
    nextAction: 'Consolidate the eight teaching transcripts into one curriculum map.',
    owner: 'Dan',
  },
  {
    id: 4,
    name: 'Pickleball Book',
    description: 'Book about becoming better people through pickleball.',
    status: 'Active',
    priority: 'Medium',
    progress: 42,
    nextAction: 'Resume chapter architecture using prior stories and Danisms.',
    owner: 'Dan',
  },
  {
    id: 5,
    name: 'Smart Paddle',
    description: 'Connected training concept for player feedback and performance data.',
    status: 'Paused',
    priority: 'Low',
    progress: 12,
    nextAction: 'Define the smallest testable hardware and software concept.',
    owner: 'Dan',
  },
]

const statusOptions: Status[] = ['Active', 'Planning', 'Paused', 'Launched']
const priorityOptions: Priority[] = ['Critical', 'High', 'Medium', 'Low']

function loadProjects(): Project[] {
  const saved = localStorage.getItem('mission-control-projects')
  if (!saved) return seedProjects
  try {
    return JSON.parse(saved) as Project[]
  } catch {
    return seedProjects
  }
}

function PortfolioDashboard() {
  const [projects, setProjects] = useState<Project[]>(loadProjects)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | Status>('All')
  const [showNewProject, setShowNewProject] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)

  const saveProjects = (next: Project[]) => {
    setProjects(next)
    localStorage.setItem('mission-control-projects', JSON.stringify(next))
  }

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesQuery = `${project.name} ${project.description} ${project.nextAction}`
        .toLowerCase()
        .includes(query.toLowerCase())
      const matchesStatus = statusFilter === 'All' || project.status === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [projects, query, statusFilter])

  const activeProjects = projects.filter((project) => project.status === 'Active').length
  const averageProgress = Math.round(
    projects.reduce((sum, project) => sum + project.progress, 0) / projects.length,
  )
  const criticalProjects = projects.filter((project) => project.priority === 'Critical').length
  const nextActions = projects.filter((project) => project.status !== 'Paused').length

  const addProject = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const newProject: Project = {
      id: Date.now(),
      name: String(form.get('name') || 'Untitled project'),
      description: String(form.get('description') || ''),
      status: String(form.get('status')) as Status,
      priority: String(form.get('priority')) as Priority,
      progress: Number(form.get('progress') || 0),
      nextAction: String(form.get('nextAction') || ''),
      owner: String(form.get('owner') || 'Dan'),
      url: String(form.get('url') || '') || undefined,
    }
    saveProjects([newProject, ...projects])
    setShowNewProject(false)
  }

  const updateProject = (updated: Project) => {
    saveProjects(projects.map((project) => (project.id === updated.id ? updated : project)))
    setSelectedProject(updated)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">MC</div>
        <div className="brand-copy">
          <strong>Mission Control</strong>
          <span>Portfolio OS</span>
        </div>
        <nav>
          <button className="nav-item active"><LayoutDashboard size={18} /> Overview</button>
          <button className="nav-item"><Target size={18} /> Projects</button>
          <button className="nav-item"><Rocket size={18} /> Launches</button>
          <a className="nav-item nav-link" href="/operating-pulse"><Activity size={18} /> Operating pulse</a>
        </nav>
        <div className="sidebar-note">
          <Sparkles size={18} />
          <div>
            <strong>Today’s rule</strong>
            <span>Finish the next important thing.</span>
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">Wednesday, July 15</p>
            <h1>Good afternoon, Dan.</h1>
            <p>Here is what deserves your attention across the portfolio.</p>
          </div>
          <button className="primary-button" onClick={() => setShowNewProject(true)}>
            <Plus size={18} /> Add project
          </button>
        </header>

        <section className="metrics-grid">
          <Metric icon={<Rocket size={20} />} label="Active projects" value={activeProjects} note="Currently moving" />
          <Metric icon={<Target size={20} />} label="Average progress" value={`${averageProgress}%`} note="Across the portfolio" />
          <Metric icon={<AlertTriangle size={20} />} label="Critical priorities" value={criticalProjects} note="Needs executive focus" />
          <Metric icon={<Clock3 size={20} />} label="Open next actions" value={nextActions} note="Ready to execute" />
        </section>

        <section className="focus-panel">
          <div>
            <p className="eyebrow">Executive focus</p>
            <h2>Get Namengine Baby launch-ready.</h2>
            <p>The shortest path to revenue is a reliable engine, a clear audit trail, and a repeatable launch test.</p>
          </div>
          <div className="focus-actions">
            <span>72% ready</span>
            <div className="progress-track"><div style={{ width: '72%' }} /></div>
            <a href="https://namengine-platform-app.onrender.com" target="_blank" rel="noreferrer">
              Open Namengine <ArrowUpRight size={16} />
            </a>
          </div>
        </section>

        <section className="workspace">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Portfolio</p>
              <h2>Projects</h2>
            </div>
            <div className="controls">
              <label className="search-box">
                <Search size={17} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" />
              </label>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'All' | Status)}>
                <option>All</option>
                {statusOptions.map((status) => <option key={status}>{status}</option>)}
              </select>
            </div>
          </div>

          <div className="project-grid">
            {filteredProjects.map((project) => (
              <article className="project-card" key={project.id} onClick={() => setSelectedProject(project)}>
                <div className="card-topline">
                  <span className={`status status-${project.status.toLowerCase()}`}>{project.status}</span>
                  <span className={`priority priority-${project.priority.toLowerCase()}`}>{project.priority}</span>
                </div>
                <h3>{project.name}</h3>
                <p>{project.description}</p>
                <div className="card-progress">
                  <span>{project.progress}%</span>
                  <div className="progress-track"><div style={{ width: `${project.progress}%` }} /></div>
                </div>
                <div className="next-action">
                  <CheckCircle2 size={18} />
                  <div><span>Next action</span><strong>{project.nextAction}</strong></div>
                </div>
                <div className="card-footer">
                  <span>{project.owner}</span>
                  <button aria-label={`Open ${project.name}`}><ArrowUpRight size={17} /></button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      {showNewProject && (
        <div className="modal-backdrop" onMouseDown={() => setShowNewProject(false)}>
          <form className="modal" onSubmit={addProject} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div><p className="eyebrow">Portfolio intake</p><h2>Add a project</h2></div>
              <button type="button" className="icon-button" onClick={() => setShowNewProject(false)}><X size={20} /></button>
            </div>
            <label>Name<input name="name" required autoFocus /></label>
            <label>Description<textarea name="description" rows={3} /></label>
            <div className="form-row">
              <label>Status<select name="status" defaultValue="Planning">{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
              <label>Priority<select name="priority" defaultValue="Medium">{priorityOptions.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
            </div>
            <div className="form-row">
              <label>Progress<input name="progress" type="number" min="0" max="100" defaultValue="0" /></label>
              <label>Owner<input name="owner" defaultValue="Dan" /></label>
            </div>
            <label>Next action<input name="nextAction" required /></label>
            <label>URL<input name="url" type="url" placeholder="https://" /></label>
            <button className="primary-button" type="submit"><Plus size={18} /> Add project</button>
          </form>
        </div>
      )}

      {selectedProject && (
        <div className="drawer-backdrop" onMouseDown={() => setSelectedProject(null)}>
          <aside className="drawer" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div><p className="eyebrow">Project control</p><h2>{selectedProject.name}</h2></div>
              <button className="icon-button" onClick={() => setSelectedProject(null)}><X size={20} /></button>
            </div>
            <label>Status<select value={selectedProject.status} onChange={(event) => updateProject({ ...selectedProject, status: event.target.value as Status })}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
            <label>Priority<select value={selectedProject.priority} onChange={(event) => updateProject({ ...selectedProject, priority: event.target.value as Priority })}>{priorityOptions.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
            <label>Progress: {selectedProject.progress}%<input type="range" min="0" max="100" value={selectedProject.progress} onChange={(event) => updateProject({ ...selectedProject, progress: Number(event.target.value) })} /></label>
            <label>Next action<textarea rows={4} value={selectedProject.nextAction} onChange={(event) => setSelectedProject({ ...selectedProject, nextAction: event.target.value })} onBlur={() => updateProject(selectedProject)} /></label>
            <label>Description<textarea rows={5} value={selectedProject.description} onChange={(event) => setSelectedProject({ ...selectedProject, description: event.target.value })} onBlur={() => updateProject(selectedProject)} /></label>
            {selectedProject.url && <a className="drawer-link" href={selectedProject.url} target="_blank" rel="noreferrer">Open project <ArrowUpRight size={17} /></a>}
            <button className="danger-button" onClick={() => { saveProjects(projects.filter((project) => project.id !== selectedProject.id)); setSelectedProject(null) }}>Remove project</button>
          </aside>
        </div>
      )}
    </div>
  )
}

function App() {
  const path = window.location.pathname.replace(/\/$/, '') || '/'
  if (path === '/operating-pulse' || path === '/namengine/openai-usage') return <NamEngineOpenAIUsage />
  return <PortfolioDashboard />
}

function Metric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string | number; note: string }) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{icon}</div>
      <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
    </article>
  )
}

export default App
