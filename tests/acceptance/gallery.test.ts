import { describe, expect, it } from "vitest";
import {
  formatSubmittedDate,
  isGalleryVisible,
  matchesGalleryQuery,
  sortGalleryProjects,
  type GalleryProject,
} from "../../src/lib/gallery";
import type { DbEvent } from "../../src/db/schema";

const NOW = new Date("2026-06-01T00:00:00Z");

function makeEvent(overrides: Partial<DbEvent> = {}): DbEvent {
  return {
    id: "evt-test",
    title: "Sample Hack 2026",
    slug: "sample-hack-2026",
    status: "PUBLISHED",
    registrationEnd: new Date("2026-02-01T00:00:00Z"),
    submissionStart: new Date("2026-02-01T00:00:00Z"),
    submissionDeadline: new Date("2026-03-01T18:00:00Z"),
    judgingStart: new Date("2026-03-01T18:00:00Z"),
    judgingEndTime: new Date("2026-03-11T18:00:00Z"),
    publicVotingStart: new Date("2026-03-11T18:00:00Z"),
    publicVotingEndTime: new Date("2026-03-18T18:00:00Z"),
    announcementDate: null,
    judgesPerSubmission: 3,
    doubleBlindJudging: false,
    assignmentAlgorithm: 'K_COVER',
    normalization: 'RAW_MEAN',
    votingType: 'SINGLE_CHOICE',
    blindVoting: false,
    quadraticCredits: 100,
    logoUrl: null,
    bannerUrl: null,
    cardBannerUrl: null,
    websiteUrl: null,
    descriptionHtml: null,
    format: "ONLINE",
    locationName: null,
    locationAddress: null,
    mapsUrl: null,
    participationType: "TEAM",
    minTeamSize: 1,
    maxTeamSize: 4,
    audience: "OPEN",
    participationCertificate: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeProject(overrides: Partial<GalleryProject> = {}): GalleryProject {
  return {
    id: "sub-1",
    title: "Glass Signal",
    tagline: "One line of what it does.",
    repoUrl: "https://example.org/repo/01",
    submittedAt: "2026-02-27T04:08:00Z",
    submittedLabel: "Feb 27, 2026",
    teamName: "NorthKiln",
    trackName: "Security",
    eventTitle: "Sample Hack 2026",
    eventStatus: "PUBLISHED",
    ...overrides,
  };
}

describe("gallery visibility", () => {
  it("shows published submissions from published events", () => {
    expect(
      isGalleryVisible(
        { isDraft: false, isHidden: false, event: makeEvent() },
        NOW,
      ),
    ).toBe(true);
  });

  it("hides drafts even when the event is published", () => {
    expect(
      isGalleryVisible(
        { isDraft: true, isHidden: false, event: makeEvent() },
        NOW,
      ),
    ).toBe(false);
  });

  it("hides hidden submissions even when the event is published", () => {
    expect(
      isGalleryVisible(
        { isDraft: false, isHidden: true, event: makeEvent() },
        NOW,
      ),
    ).toBe(false);
  });

  it("hides published submissions while the event is still running", () => {
    const event = makeEvent({
      status: "SUBMISSION",
      submissionDeadline: new Date("2026-07-01T00:00:00Z"),
      judgingEndTime: new Date("2026-07-11T00:00:00Z"),
      publicVotingEndTime: new Date("2026-07-18T00:00:00Z"),
    });
    expect(
      isGalleryVisible({ isDraft: false, isHidden: false, event }, NOW),
    ).toBe(false);
  });

  it("derives published from phase dates even when the stored flag is stale", () => {
    const event = makeEvent({ status: "SUBMISSION" });
    expect(
      isGalleryVisible({ isDraft: false, isHidden: false, event }, NOW),
    ).toBe(true);
  });
});

describe("gallery search", () => {
  const project = makeProject();

  it("matches an empty query against everything", () => {
    expect(matchesGalleryQuery(project, "")).toBe(true);
    expect(matchesGalleryQuery(project, "   ")).toBe(true);
  });

  it.each([
    ["glass", "title"],
    ["GLASS SIGNAL", "case-insensitive title"],
    ["northkiln", "team name"],
    ["security", "track name"],
    ["sample hack", "event name"],
    ["one line", "tagline"],
  ])("matches by %s (%s)", (query) => {
    expect(matchesGalleryQuery(project, query)).toBe(true);
  });

  it("requires every term to appear somewhere", () => {
    expect(matchesGalleryQuery(project, "glass security")).toBe(true);
    expect(matchesGalleryQuery(project, "glass nonexistent")).toBe(false);
  });

  it("rejects queries with no match", () => {
    expect(matchesGalleryQuery(project, "zzz-no-such-project")).toBe(false);
  });
});

describe("gallery date labels", () => {
  it("formats the same string regardless of runtime timezone", () => {
    // 23:30 UTC is already the next day in UTC+12 and beyond — the label
    // must not move with the runtime timezone.
    expect(formatSubmittedDate("2026-02-27T23:30:00Z")).toBe("Feb 27, 2026");
  });
});

describe("gallery ordering", () => {
  it("sorts oldest first, missing timestamps last, title as tiebreak", () => {
    const rows = [
      makeProject({ id: "c", title: "Bravo", submittedAt: null }),
      makeProject({
        id: "b",
        title: "Bravo",
        submittedAt: "2026-02-28T00:00:00Z",
      }),
      makeProject({
        id: "a",
        title: "Alpha",
        submittedAt: "2026-02-28T00:00:00Z",
      }),
      makeProject({
        id: "d",
        title: "Delta",
        submittedAt: "2026-02-27T00:00:00Z",
      }),
    ];
    expect(rows.sort(sortGalleryProjects).map((row) => row.id)).toEqual([
      "d",
      "a",
      "b",
      "c",
    ]);
  });
});
