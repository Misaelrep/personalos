import { AnimatePresence, m } from 'framer-motion'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { dateKey } from '../../../domain/time'
import { nowMs } from '../../../state/clock'
import { LearnLight, learnScreenVars, useLearnTheme } from '../atmosphere'
import { FragmentedText } from '../components/FragmentedText'
import { LearnTabs, type LearnView } from '../components/LearnTabs'
import { Reveal } from '../components/Reveal'
import { Wordmark } from '../components/Wordmark'
import { PHRASES } from '../data/phrases'
import { decideLearnEntry, readLearnOverride } from '../domain/entryPolicy'
import { phraseForDate, type Phrase } from '../domain/phrase'
import { BRIEF_TIMELINE, FULL_TIMELINE, SKIP_MS, introVisible, reached } from '../domain/ritual'
import { useLearn } from '../hooks/useLearn'
import { useRitual } from '../hooks/useRitual'
import { learnStore } from '../storage/learnStore'
import { AhoraScreen } from './AhoraScreen'
import { MapaScreen } from './MapaScreen'
import { ModelosScreen } from './ModelosScreen'

interface AprenderProps {
  /** The first entry of the day takes the whole stage (the navigation leaves) until it settles. */
  onImmersive: (immersive: boolean) => void
}

/**
 * APRENDER — the section.
 *
 *   first entry of the local date   the whole ritual: atmosphere → APRENDER (dots)
 *                                   → the phrase of the day → it defragments →
 *                                   ¿QUÉ TIENES EN MENTE? → field → suggestions
 *   any later entry that date       brief: straight to the question, nothing in the way
 *
 * Any click, tap or key brings either one to the functional state in 350 ms.
 */
export function Aprender({ onImmersive }: AprenderProps) {
  const today = useMemo(() => dateKey(new Date(nowMs())), [])
  const [entry] = useState(() => {
    const memory = learnStore.loadEntry()
    const override = readLearnOverride(window.location.search)
    return { memory, kind: decideLearnEntry({ today, lastEntryDate: memory.lastEntryDate, override }), recorded: !override }
  })
  const full = entry.kind === 'full'
  const timeline = full ? FULL_TIMELINE : BRIEF_TIMELINE
  const phrase = useMemo(() => phraseForDate(today, PHRASES, entry.memory.phrase), [today, entry])

  // The atmosphere follows the local hour. It changes by itself, and nothing below depends on which one it is.
  const theme = useLearnTheme()
  const { stage, skipped, locked } = useRitual(timeline)
  const learn = useLearn()
  const [view, setView] = useState<LearnView>('ahora')

  // The day's phrase is recorded when the ritual starts; the date, only once the person has got through it.
  useEffect(() => {
    if (full && entry.recorded) learnStore.saveEntry({ phrase: { date: today, id: phrase.id } })
  }, [full, entry.recorded, today, phrase.id])
  useEffect(() => {
    if (stage === 'ready' && full && entry.recorded) learnStore.saveEntry({ lastEntryDate: today })
  }, [stage, full, entry.recorded, today])

  // The navigation leaves for the full ritual and comes back with the suggestions.
  const immersive = full && !reached(stage, 'suggestions')
  useEffect(() => {
    onImmersive(immersive)
    return () => onImmersive(false)
  }, [immersive, onImmersive])

  // Like HOY and SEMANA, the section names the tab.
  useEffect(() => {
    document.title = 'Aprender'
  }, [])

  const ready = stage === 'ready'
  const reveal = { prompt: reached(stage, 'prompt'), field: reached(stage, 'field'), suggestions: reached(stage, 'suggestions') }

  return (
    <m.div
      data-learn=""
      data-learn-theme={theme.id}
      data-stage={stage}
      data-entry={entry.kind}
      data-skipped={skipped || undefined}
      className="fixed inset-0 z-10 flex flex-col overflow-y-auto overscroll-contain px-6 pt-[calc(env(safe-area-inset-top)+28px)] pb-[calc(env(safe-area-inset-bottom)+104px)] lg:pr-14 lg:pb-16 lg:pl-[140px]"
      style={learnScreenVars(theme) as CSSProperties}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      transition={{ duration: 0.6 }}
    >
      <LearnLight theme={theme} />
      <header className="mx-auto w-full max-w-[560px]">
        <Reveal shown={ready} skipped={skipped} locked={locked}>
          <LearnTabs view={view} onChange={setView} />
        </Reveal>
      </header>

      <main role="tabpanel" aria-labelledby={`learn-tab-${view}`} className="flex flex-1 flex-col">
        <AnimatePresence mode="wait">
          {view === 'ahora' ? (
            <AhoraScreen
              key="ahora"
              state={learn.state}
              reveal={reveal}
              skipped={skipped}
              locked={locked}
              onDraft={learn.changeDraft}
              onCommit={learn.commit}
              onRestart={learn.restart}
            />
          ) : view === 'mapa' ? (
            <MapaScreen key="mapa" />
          ) : (
            <ModelosScreen key="modelos" />
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {introVisible(stage, timeline) && <Intro key="intro" phrase={phrase} showPhrase={reached(stage, 'phrase')} dissolving={stage === 'defrag'} />}
      </AnimatePresence>
    </m.div>
  )
}

const PHRASE_CLASS = 'font-display text-[clamp(22px,5.6vw,32px)] leading-[1.25] font-light tracking-[-0.03em] text-balance text-ink'

/** The wordmark and the phrase, on their own layer above the screen. They leave by dissolving, or in SKIP_MS if skipped. */
function Intro({ phrase, showPhrase, dissolving }: { phrase: Phrase; showPhrase: boolean; dissolving: boolean }) {
  return (
    <m.div
      className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center gap-10 px-6 text-center lg:pl-[140px]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: SKIP_MS / 1000 } }}
    >
      <Wordmark dissolving={dissolving} />
      {/* The phrase's space is held from the start, so the wordmark never moves when it appears. */}
      <div className="relative max-w-[26ch]">
        <p aria-hidden className={`invisible ${PHRASE_CLASS}`}>
          {phrase.quote}
        </p>
        {phrase.author && (
          <p aria-hidden className="label-spaced invisible mt-6">
            {phrase.author}
          </p>
        )}
        {showPhrase && (
          <div className="absolute inset-0">
            <FragmentedText text={phrase.quote} state={dissolving ? 'out' : 'in'} className={PHRASE_CLASS} />
            {phrase.author && <p className="label-spaced mt-6 text-ink-3">{phrase.author}</p>}
          </div>
        )}
      </div>
    </m.div>
  )
}
