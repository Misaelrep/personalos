import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Label } from '../../../components/ui/Label'
import { sha256Hex } from '../import/sha256'
import { exportProjects, verifyExport, type ExportFile, type Verification } from '../store/export'
import { DATA_KEY } from '../store/store'
import { saveJsonFile, stampedName } from './files'
import { dateTime, shortHash } from './labels'
import { Banner, Card, Field, Mono, Section, Title, TopBar } from './parts'

/**
 * P4a · EXPORTAR: a copy of exactly what is stored, checked right after it is
 * made, and a way to check a copy saved earlier. Recovering from a copy is
 * on its own screen (P2-R1, #/recuperar).
 */

const now = () => new Date().toISOString()
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

function VerificationLines({ v }: { v: Verification }) {
  if (!v.ok)
    return (
      <Banner tone="error">
        La copia no es válida:
        <ul className="mt-1 list-disc pl-4">
          {v.problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </Banner>
    )
  return (
    <Banner tone="ok">
      Copia verificada: la huella coincide{v.summary ? ` y contiene ${n(v.summary.projects, 'proyecto', 'proyectos')} y ${n(v.summary.tasks, 'tarea', 'tareas')} (generación ${v.summary.generation})` : ' (no había datos guardados)'}.
      {!v.readable && ' Los datos dentro no se pudieron leer con esta versión; se han copiado tal cual.'}
    </Banner>
  )
}

export function ExportView() {
  const [made, setMade] = useState<{ text: string; file: ExportFile; check: Verification; name: string }>()
  const [checked, setChecked] = useState<{ name: string; check: Verification; current: boolean }>()
  const [error, setError] = useState<string>()

  async function make() {
    setError(undefined)
    try {
      const at = now()
      const { text, file } = await exportProjects(window.localStorage, at)
      const check = await verifyExport(text)
      setMade({ text, file, check, name: stampedName('elyum-proyectos', at) })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function save() {
    if (made) await saveJsonFile(made.name, made.text)
  }

  async function checkFile(f: File) {
    const text = await f.text()
    const check = await verifyExport(text)
    const stored = window.localStorage.getItem(DATA_KEY)
    let current = false
    try {
      current = stored !== null && (JSON.parse(text) as ExportFile).storedSha256 === (await sha256Hex(stored))
    } catch {
      current = false
    }
    setChecked({ name: f.name, check, current })
  }

  return (
    <>
      <TopBar back="#/" backLabel="Proyectos" />
      <Title kicker={<Label>Exportar</Label>} sub="Una copia exacta de lo guardado, comprobada al crearla. Guárdala fuera de este dispositivo: las versiones locales no son una copia de seguridad.">
        Copia de PROYECTOS
      </Title>

      <Section label="Crear una copia">
        <div className="flex flex-col gap-3">
          <Button onClick={make} data-testid="export" className="w-full">
            Generar y verificar
          </Button>
          {error && <Banner tone="error">{error}</Banner>}
          {made && (
            <div className="flex flex-col gap-3" data-testid="export-result">
              <VerificationLines v={made.check} />
              <Card className="px-4 py-1">
                <Field label="Archivo">
                  <Mono>{made.name}</Mono>
                </Field>
                <Field label="Creada">{dateTime(made.file.exportedAt)}</Field>
                <Field label="Huella de lo guardado">{made.file.storedSha256 ? <Mono>{shortHash(made.file.storedSha256)}</Mono> : undefined}</Field>
                {made.file.summary && (
                  <Field label="Contenido">
                    {[
                      n(made.file.summary.projects, 'proyecto', 'proyectos'),
                      n(made.file.summary.tasks, 'tarea', 'tareas'),
                      n(made.file.summary.references, 'referencia', 'referencias'),
                      n(made.file.summary.imports, 'importación', 'importaciones'),
                      n(made.file.summary.history, 'cambio en el historial', 'cambios en el historial'),
                    ].join(' · ')}
                  </Field>
                )}
                <Field label="Tamaño">{`${new Blob([made.text]).size} bytes`}</Field>
              </Card>
              <Button variant="choice" onClick={save} disabled={!made.check.ok} data-testid="save-export">
                Guardar el archivo
              </Button>
            </div>
          )}
        </div>
      </Section>

      <Section label="Verificar una copia guardada">
        <Card className="flex flex-col gap-3 px-4 py-4">
          <label className="text-[14px] text-ink-2">
            Archivo .json exportado antes
            <input
              type="file"
              accept=".json,application/json"
              data-testid="verify-input"
              className="mt-2 block w-full text-[14px] text-ink-2 file:mr-3 file:h-10 file:rounded-full file:border file:border-[var(--line)] file:bg-[var(--surface-quiet)] file:px-4 file:text-ink"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void checkFile(f)
              }}
            />
          </label>
          {checked && (
            <div className="flex flex-col gap-2" data-testid="verify-result">
              <VerificationLines v={checked.check} />
              {checked.check.ok && <p className="text-[13px] text-ink-3">{checked.current ? 'Coincide con lo que hay guardado ahora.' : 'Es de otro momento: lo guardado ahora es distinto.'}</p>}
            </div>
          )}
          <p className="text-[12.5px] leading-[1.5] text-ink-4">
            Verificar no cambia nada. Para recuperar datos desde una copia, usa{' '}
            <a href="#/recuperar" className="text-electric" data-testid="go-restore-from-export">
              Recuperar
            </a>{' '}
            (por ahora, en un almacén de prueba separado).
          </p>
        </Card>
      </Section>
    </>
  )
}
