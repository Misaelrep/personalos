import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Label } from '../../../components/ui/Label'
import { createProject, similarProjects } from '../domain/operations'
import type { ProjectsData } from '../domain/types'
import { Inline } from './inline'
import { Banner, Card, Section, Title, TopBar } from './parts'
import { useWrite } from './write'

/**
 * P4b · NUEVO PROYECTO: name and objective; the id is generated. A name that
 * looks like an existing project is shown, and creating it anyway needs an
 * explicit «es otro proyecto». Never a silent duplicate.
 */

const input = 'h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-quiet)] px-3 text-[15px] text-ink'

export function NewProjectView({ data }: { data: ProjectsData }) {
  const { write, busy, writable } = useWrite()
  const [name, setName] = useState('')
  const [objective, setObjective] = useState('')
  const [distinct, setDistinct] = useState(false)
  const similar = similarProjects(data, name)
  const blocked = !name.trim() || (similar.length > 0 && !distinct)

  async function create() {
    let id = ''
    const ok = await write(`Proyecto «${name.trim()}»`, (d) => {
      const r = createProject(d, { name, objective }, { now: new Date().toISOString() })
      id = r.project.id
      return r.data
    })
    if (ok) window.location.hash = `#/proyecto/${encodeURIComponent(id)}`
  }

  return (
    <>
      <TopBar back="#/" backLabel="Proyectos" />
      <Title kicker={<Label>Nuevo proyecto</Label>} sub="Nombre y objetivo. El identificador lo pone ELYUM. Podrás importar su dossier más tarde y vincularlo.">
        Crear un proyecto
      </Title>
      {!writable && <Banner tone="warn">Solo lectura: no se puede crear aquí.</Banner>}
      <Section label="Datos">
        <Card className="flex flex-col gap-3 px-4 py-4">
          <label className="text-[13px] text-ink-3">
            Nombre
            <input className={`${input} mt-1`} value={name} onChange={(e) => (setName(e.target.value), setDistinct(false))} data-testid="project-name" />
          </label>
          <label className="text-[13px] text-ink-3">
            Objetivo
            <textarea rows={3} className={`${input} mt-1 h-auto py-2.5`} value={objective} onChange={(e) => setObjective(e.target.value)} data-testid="project-objective" />
          </label>
        </Card>
      </Section>
      {similar.length > 0 && (
        <div className="mt-4 flex flex-col gap-2" data-testid="similar">
          <Banner tone="warn">
            Se parece a {similar.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ', '}
                <a className="underline" href={`#/proyecto/${encodeURIComponent(p.id)}`}>
                  «<Inline text={p.name} />»
                </a>
              </span>
            ))}
            . Si es el mismo, ábrelo en vez de crear otro.
          </Banner>
          <label className="flex items-start gap-2.5 px-1 text-[14px] text-ink-2">
            <input type="checkbox" className="mt-1 accent-[var(--color-electric)]" checked={distinct} onChange={(e) => setDistinct(e.target.checked)} data-testid="distinct" />
            Es un proyecto distinto: crearlo de todos modos.
          </label>
        </div>
      )}
      <div className="mt-6">
        <Button className="w-full" disabled={!writable || busy || blocked} onClick={create} data-testid="create-project">
          Crear proyecto
        </Button>
      </div>
    </>
  )
}
