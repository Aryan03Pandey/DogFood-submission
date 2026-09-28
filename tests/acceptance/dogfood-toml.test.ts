import { describe, expect, it } from 'vitest'

import { renderDogfoodToml } from '../../scripts/write-dogfood-toml'

const input = {
  baseUrl: 'http://localhost:3000',
  organizerToken: 'org-token',
  judgeAToken: 'judge-a-token',
  judgeBToken: 'judge-b-token',
  participantToken: 'participant-token',
  fixtureEventId: 'event-1',
  judgeAUserId: 'judge-a-id',
}

describe('dogfood:toml render (scripts/run.py input)', () => {
  it('emits portal, tiers, auth, and routes sections', () => {
    const toml = renderDogfoodToml(input)
    expect(toml).toMatch('[portal]')
    expect(toml).toMatch('base_url = "http://localhost:3000"')
    expect(toml).toMatch('claimed = ["T1", "T2"]')
    expect(toml).toMatch('organizer   = "Cookie: dogfood_session=org-token"')
    expect(toml).toMatch('judge_a     = "Cookie: dogfood_session=judge-a-token"')
    expect(toml).toMatch('judge_b     = "Cookie: dogfood_session=judge-b-token"')
    expect(toml).toMatch('participant = "Cookie: dogfood_session=participant-token"')
  })

  it('points the checker at the real fixture event and judge A', () => {
    const toml = renderDogfoodToml(input)
    expect(toml).toMatch('gallery      = "/projects"')
    expect(toml).toMatch('submit       = "/api/events/event-1/submissions"')
    expect(toml).toMatch('judge_scores = "/api/judge/scores"')
    expect(toml).toMatch('peer_scores  = "/api/judge/scores?judge=judge-a-id"')
    expect(toml).toMatch('csv_export   = "/api/export.csv?eventId=event-1"')
  })
})
