'use client'

import { useRouter } from 'next/navigation'

import type { EventPayload, PrizeAwardPayload, PrizePayload, RubricPayload } from '@/lib/api-client'
import { AlgorithmsForm } from '../judging/algorithms-form'
import { AssignmentsPanel, type ProgressRow, type RankingRow } from '../judging/assignments-panel'
import { AwardsPanel } from '../judging/awards-panel'
import { JudgesManager, type JudgeRow } from '../judging/judges-manager'
import { RubricBuilder } from '../judging/rubric-builder'

// Judging tab: judges, rubric, engines, assignments, awards. Server data
// arrives as props; each section resyncs its own lists from the server
// after mutating, so no remount (which used to resurrect just-removed rows
// from stale props).
export function JudgingPanel({
  event,
  judges,
  rubric,
  progress,
  rankings,
  prizes,
  finalSubmissions,
  prizeAwards,
}: {
  event: EventPayload
  judges: JudgeRow[]
  rubric: RubricPayload | null
  progress: ProgressRow[]
  rankings: RankingRow[]
  prizes: PrizePayload[]
  finalSubmissions: Array<{ id: string; title: string; teamName: string }>
  prizeAwards: PrizeAwardPayload[]
}) {
  const router = useRouter()

  function refresh() {
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <AlgorithmsForm event={event} />
      <JudgesManager eventId={event.id} initial={judges} onChanged={refresh} />
      <RubricBuilder eventId={event.id} initial={rubric} />
      <AssignmentsPanel
        eventId={event.id}
        initialProgress={progress}
        initialRankings={rankings}
        onChanged={refresh}
      />
      <AwardsPanel
        eventId={event.id}
        prizes={prizes}
        finalSubmissions={finalSubmissions}
        initialAwards={prizeAwards}
        onChanged={refresh}
      />
    </div>
  )
}
