# Threat model — voting & submission abuse, judge collusion, deadline gaming

Scope: a self-hosted, offline-first hackathon portal. The operator runs
the infrastructure; event organizers are **trusted** within their
events (they can already rewrite anything there — no mechanism below
constrains a malicious organizer, by design). Attackers are
participants, voters, judges, and bots.

## Stopped attacks

**Ballot stuffing (Sybils).** `voter_fingerprint` = SHA-256 of
IP + user-agent + language + client hints + user id
(`generateVoterFingerprint`), stored per vote; 15 requests/min per IP
(`checkRateLimit` → 429); quadratic voting makes each extra vote
quadratically expensive against a fixed credit budget. Casual stuffing
— refresh-and-revote, a second browser — is caught or priced out.

**Bot voting/submission.** Honeypot field (any content → 400
`BOT_DETECTED`) plus form-timing rejection (submitted < 700ms after
render → bot). Blocks naive scripts, not humans.

**Deadline gaming.** All phase gates derive from **server clock** via
`deriveEventStatus()`; past `submissionDeadline`, every write path
403s `SUBMISSION_CLOSED`. Client clocks, timezone tricks, and
"the UI still showed the button" change nothing — the check lives in
`createDraft()` and friends, and the stored status column is never
trusted.

**Score snooping / peer unblinding.** Assignment-scoped queries:
judges fetch only their own assignments; `?judge=<other>` 403s without
a containing managed event; flags stay judge-private until publish;
double-blind mode masks identities on judge payloads. Verified by the
checker's peer-scores probe, not by templates.

**Team & staffing abuse.** Participants can never be lifted to
JUDGE/ORGANIZER (409 both layers); one-LEADER-per-team is a partial
unique index; invite codes are HMAC tokens, hashed at rest, with TTLs;
roster locks on submit/phase end; leaving last unregisters the viewer
(no orphan registrations, no lockout states).

**Credential replay from a DB dump.** Sessions, API tokens, invite
codes, webhook secrets are random-at-creation, hashed at rest, shown
once. Exports strip all secrets. Token revocation is an
`(id AND userId)`-scoped write.

**Webhook SSRF.** Registration and delivery each independently
re-check `assertSafeWebhookUrl`; private hosts default-deny
(`WEBHOOK_ALLOW_PRIVATE_HOSTS=false`).

**Result forgery.** Ed25519-signed envelopes over canonical JSON;
public keys published, private key file-only; rotation keeps old
signatures verifiable; offline `verify` script needs no DB.

**Cover-up.** Append-only `audit_logs` (votes, scores, admin
overrides); imports `ON CONFLICT DO NOTHING` here.

## Attacks NOT stopped (honest list)

- **Determined human Sybils.** No email verification, no CAPTCHA, no
  identity proofing. Fingerprints only raise the cost; a person with
  two browsers on two networks votes twice. For a community fun-poll
  this is accepted; for prize-deciding votes, use judges.
- **NAT / shared IPs.** Dorms, campuses, and offices share one egress
  IP: rate limits can throttle legitimate voters, while one attacker
  behind CGNAT blends in. Fingerprint includes UA/lang to soften this,
  not solve it.
- **Header spoofing.** Fingerprint inputs are client-controlled; curl
  rotates them trivially. Fingerprinting is a speed bump with audit
  value, not an identity.
- **In-memory rate limits.** The 15/min log lives in process memory:
  it resets on restart and doesn't span replicas. Fine for one
  container; not a DDoS story.
- **Off-platform judge collusion.** Judges texting each other scores
  is undetectable by construction. Mitigations are structural only:
  k-cover spreads influence, trimmed mean blunts one extreme ballot
  (at n≥5), flags and the audit trail record anomalies for humans.
- **Malicious organizer.** Out of scope (see above): they can assign,
  export, publish, and delete. Separation of duties stops at the
  event boundary; instance safety stops at SUPERADMIN.
- **Key-file hygiene.** The Ed25519 private key's safety is the
  operator's file permissions (`0600`, gitignored `data/` keys dir).
  The app cannot protect a key from its own host.
- **Clock trust.** Deadline fairness assumes sane server time (NTP).
  A wildly wrong host clock shifts every phase at once — loud,
  but not guarded in-app.
