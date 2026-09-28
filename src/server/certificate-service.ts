import PDFDocument from "pdfkit";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  events,
  prizeAwards,
  prizes,
  submissions,
  teamMembers,
  teams,
  users,
  type DbUser,
} from "../db/schema";
import { AuthError, getEffectiveRole } from "./auth-service";
import { getEventRow } from "./event-service";
import { recordAuditLog } from "./audit-service";
import { signEnvelope, type SignedEnvelope } from "./signing-service";

export interface CertificateResult {
  pdf: Buffer;
  envelope: SignedEnvelope;
}

// Tier 4.7. Content is deliberately name/event/role/prize/date only — no
// email or other PII — since the PDF and its signed envelope are designed
// to be shared/verified by anyone via /verify, not just the recipient.
async function renderCertificatePdf(opts: {
  recipientName: string;
  eventTitle: string;
  teamName: string;
  submissionTitle: string;
  role: "PARTICIPANT" | "WINNER";
  prizeTitle?: string;
  issuedAt: string;
  kid: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 72 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const title = opts.role === "WINNER" ? "Certificate of Achievement" : "Certificate of Participation";
    doc.fontSize(24).text(title, { align: "center" });
    doc.moveDown(2);
    doc.fontSize(14).text("This certifies that", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(20).text(opts.recipientName, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(14).text(
      opts.role === "WINNER" && opts.prizeTitle
        ? `won "${opts.prizeTitle}" at ${opts.eventTitle}`
        : `participated in ${opts.eventTitle}`,
      { align: "center" },
    );
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Team ${opts.teamName} — "${opts.submissionTitle}"`, { align: "center" });
    doc.moveDown(3);
    doc.fontSize(10).text(`Issued ${opts.issuedAt}`, { align: "center" });
    doc.moveDown(2);
    doc
      .fontSize(8)
      .fillColor("#666666")
      .text(
        `Signed with Ed25519 key ${opts.kid} — verify this certificate's accompanying JSON envelope at /verify.`,
        { align: "center" },
      );
    doc.end();
  });
}

async function requireSubmissionTeamAccess(actor: DbUser, eventId: string, submissionId: string, recipientUserId: string) {
  const [submission] = await db.select().from(submissions).where(eq(submissions.id, submissionId)).limit(1);
  if (!submission) throw new AuthError("SUBMISSION_NOT_FOUND", 404);
  const [team] = await db.select().from(teams).where(eq(teams.id, submission.teamId)).limit(1);
  if (!team || team.eventId !== eventId) throw new AuthError("SUBMISSION_NOT_FOUND", 404);

  if (actor.id !== recipientUserId) {
    const role = await getEffectiveRole(actor, eventId);
    if (role !== "SUPERADMIN" && role !== "ORGANIZER") throw new AuthError("FORBIDDEN", 403);
  }
  const [membership] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, recipientUserId)))
    .limit(1);
  if (!membership) throw new AuthError("NOT_IN_TEAM", 404);

  const [recipient] = await db
    .select({ id: users.id, name: users.name, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, recipientUserId))
    .limit(1);
  if (!recipient) throw new AuthError("USER_NOT_FOUND", 404);

  return { submission, team, recipient };
}

// Never falls back to email: that would put PII into a document designed to
// be shared/verified by anyone, exactly the thing the "no email" rule is
// there to prevent. firstName+lastName covers a name the profile form
// hasn't yet folded into the combined `name` field; a fully anonymous
// account gets a neutral label instead of anything derived from credentials.
function displayName(recipient: { name: string | null; firstName: string | null; lastName: string | null }): string {
  if (recipient.name) return recipient.name;
  if (recipient.firstName && recipient.lastName) return `${recipient.firstName} ${recipient.lastName}`;
  return "A participant";
}

export async function generateParticipantCertificate(
  actor: DbUser,
  eventId: string,
  submissionId: string,
  recipientUserId: string = actor.id,
): Promise<CertificateResult> {
  const event = await getEventRow(eventId);
  const { submission, team, recipient } = await requireSubmissionTeamAccess(actor, eventId, submissionId, recipientUserId);
  if (!submission.submittedAt) throw new AuthError("SUBMISSION_NOT_FINALIZED", 409);

  const recipientName = displayName(recipient);
  const issuedAt = new Date().toISOString();
  const payload = {
    recipientUserId,
    recipientName,
    eventId,
    submissionId,
    teamId: team.id,
    role: "PARTICIPANT" as const,
    issuedAt,
  };
  const envelope = await signEnvelope("certificate", payload);
  const pdf = await renderCertificatePdf({
    recipientName,
    eventTitle: event.title,
    teamName: team.name,
    submissionTitle: submission.title,
    role: "PARTICIPANT",
    issuedAt,
    kid: envelope.kid,
  });
  return { pdf, envelope };
}

export async function generateWinnerCertificate(
  actor: DbUser,
  eventId: string,
  prizeAwardId: string,
  recipientUserId: string = actor.id,
): Promise<CertificateResult> {
  const event = await getEventRow(eventId);
  const [award] = await db.select().from(prizeAwards).where(eq(prizeAwards.id, prizeAwardId)).limit(1);
  if (!award) throw new AuthError("AWARD_NOT_FOUND", 404);
  const [prize] = await db.select().from(prizes).where(eq(prizes.id, award.prizeId)).limit(1);
  if (!prize || prize.eventId !== eventId) throw new AuthError("AWARD_NOT_FOUND", 404);

  const { submission, team, recipient } = await requireSubmissionTeamAccess(actor, eventId, award.submissionId, recipientUserId);

  const recipientName = displayName(recipient);
  const issuedAt = new Date().toISOString();
  const payload = {
    recipientUserId,
    recipientName,
    eventId,
    submissionId: submission.id,
    teamId: team.id,
    role: "WINNER" as const,
    prizeId: prize.id,
    prizeTitle: prize.title,
    issuedAt,
  };
  const envelope = await signEnvelope("certificate", payload);
  const pdf = await renderCertificatePdf({
    recipientName,
    eventTitle: event.title,
    teamName: team.name,
    submissionTitle: submission.title,
    role: "WINNER",
    prizeTitle: prize.title,
    issuedAt,
    kid: envelope.kid,
  });
  return { pdf, envelope };
}

async function assertOrganizer(actor: DbUser, eventId: string) {
  const role = await getEffectiveRole(actor, eventId);
  if (role !== "SUPERADMIN" && role !== "ORGANIZER") throw new AuthError("FORBIDDEN", 403);
}

export async function awardPrize(
  actor: DbUser,
  eventId: string,
  input: { prizeId: string; submissionId: string },
) {
  await assertOrganizer(actor, eventId);
  const [prize] = await db.select().from(prizes).where(eq(prizes.id, input.prizeId)).limit(1);
  if (!prize || prize.eventId !== eventId) throw new AuthError("PRIZE_NOT_FOUND", 404);
  const [submission] = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).limit(1);
  if (!submission) throw new AuthError("SUBMISSION_NOT_FOUND", 404);
  const [team] = await db.select().from(teams).where(eq(teams.id, submission.teamId)).limit(1);
  if (!team || team.eventId !== eventId) throw new AuthError("SUBMISSION_NOT_FOUND", 404);

  const [existing] = await db.select({ id: prizeAwards.id }).from(prizeAwards).where(eq(prizeAwards.prizeId, input.prizeId)).limit(1);
  if (existing) throw new AuthError("PRIZE_ALREADY_AWARDED", 409);

  const [award] = await db
    .insert(prizeAwards)
    .values({ prizeId: input.prizeId, submissionId: input.submissionId, awardedBy: actor.id })
    .returning();
  await recordAuditLog({
    actorId: actor.id,
    action: "prize.awarded",
    entityType: "prize_award",
    entityId: award.id,
    payloadJson: { prizeId: input.prizeId, submissionId: input.submissionId },
  });
  return award;
}

export async function listPrizeAwards(actor: DbUser, eventId: string) {
  await assertOrganizer(actor, eventId);
  return db
    .select({
      id: prizeAwards.id,
      prizeId: prizeAwards.prizeId,
      prizeTitle: prizes.title,
      submissionId: prizeAwards.submissionId,
      submissionTitle: submissions.title,
      teamName: teams.name,
      awardedAt: prizeAwards.awardedAt,
    })
    .from(prizeAwards)
    .innerJoin(prizes, eq(prizeAwards.prizeId, prizes.id))
    .innerJoin(submissions, eq(prizeAwards.submissionId, submissions.id))
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .where(eq(prizes.eventId, eventId));
}

// Unscoped by design: the caller already knows this submissionId because it
// came back from their own getMySubmission() — this just answers "did that
// submission win anything," never exposes which submission IDs exist.
export async function getPrizeAwardForSubmission(submissionId: string) {
  const [award] = await db
    .select({ id: prizeAwards.id, prizeTitle: prizes.title })
    .from(prizeAwards)
    .innerJoin(prizes, eq(prizeAwards.prizeId, prizes.id))
    .where(eq(prizeAwards.submissionId, submissionId))
    .limit(1);
  return award ?? null;
}

export async function revokePrizeAward(actor: DbUser, eventId: string, awardId: string): Promise<boolean> {
  await assertOrganizer(actor, eventId);
  const [award] = await db
    .select({ id: prizeAwards.id, prizeId: prizeAwards.prizeId })
    .from(prizeAwards)
    .innerJoin(prizes, eq(prizeAwards.prizeId, prizes.id))
    .where(and(eq(prizeAwards.id, awardId), eq(prizes.eventId, eventId)))
    .limit(1);
  if (!award) return false;
  await db.delete(prizeAwards).where(eq(prizeAwards.id, awardId));
  await recordAuditLog({
    actorId: actor.id,
    action: "prize.award_revoked",
    entityType: "prize_award",
    entityId: awardId,
    payloadJson: null,
  });
  return true;
}
