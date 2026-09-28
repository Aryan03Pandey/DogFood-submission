import { promises as dns } from "node:dns";
import { AuthError } from "./auth-service";

// Tier 4.5. Webhooks are the first feature that calls a URL an organizer
// supplies, not an operator-provisioned compose service (contrast with the
// SeaweedFS calls elsewhere in this repo) — so unlike SeaweedFS, this needs
// real SSRF hardening: scheme restriction, the compose service-name
// blocklist (these resolve fine from inside the compose network, so DNS
// alone can't catch them), and a loopback/private/link-local IP check on
// every resolved address. Callers run this at registration time AND again
// immediately before each delivery attempt (scripts/webhook-worker.ts) —
// the second check is what defends against DNS rebinding: a hostname that
// resolved safely at registration could be repointed at an internal
// address by the time delivery actually happens.
//
// Two escape hatches exist, deliberately different in scope:
// - WEBHOOK_ALLOWED_HOSTS: a comma-separated per-hostname allowlist. Only
//   the listed hostnames skip the blocklist/IP checks; every other host is
//   still fully checked. This is the one to reach for normally — e.g. an
//   operator who knows their webhook receiver resolves to an address this
//   guard would otherwise flag, without opening up every private address.
// - WEBHOOK_ALLOW_PRIVATE_HOSTS=true: a blanket bypass for every host, off
//   by default, same "explicit opt-in" shape as ALLOW_DESTRUCTIVE_DB_TESTS
//   — only for local testing against a listener on the compose network.
const BLOCKED_HOSTNAMES = new Set(["postgres", "seaweedfs", "app", "dev", "localhost"]);

function allowedHostnames(): Set<string> {
  const raw = process.env.WEBHOOK_ALLOWED_HOSTS ?? "";
  return new Set(
    raw
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inCidr(ip: number, base: string, bits: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip & mask) === (baseInt & mask);
}

function isUnsafeIpv4(ip: string): boolean {
  const int = ipv4ToInt(ip);
  if (int === null) return false;
  return (
    inCidr(int, "127.0.0.0", 8) || // loopback
    inCidr(int, "10.0.0.0", 8) || // private
    inCidr(int, "172.16.0.0", 12) || // private
    inCidr(int, "192.168.0.0", 16) || // private
    inCidr(int, "169.254.0.0", 16) // link-local
  );
}

function isUnsafeIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true; // loopback
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true; // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // fc00::/7 unique local
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return isUnsafeIpv4(mapped[1]);
  return false;
}

export async function assertSafeWebhookUrl(url: string): Promise<void> {
  // Explicit opt-in for local testing against a listener on the compose
  // network — same "off by default" shape as ALLOW_DESTRUCTIVE_DB_TESTS.
  if (process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS === "true") return;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AuthError("INVALID_WEBHOOK_URL", 422);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AuthError("INVALID_WEBHOOK_URL", 422);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (allowedHostnames().has(hostname)) return;
  if (BLOCKED_HOSTNAMES.has(hostname)) throw new AuthError("UNSAFE_WEBHOOK_URL", 422);

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new AuthError("INVALID_WEBHOOK_URL", 422);
  }
  for (const { address, family } of addresses) {
    if (family === 4 && isUnsafeIpv4(address)) throw new AuthError("UNSAFE_WEBHOOK_URL", 422);
    if (family === 6 && isUnsafeIpv6(address)) throw new AuthError("UNSAFE_WEBHOOK_URL", 422);
  }
}
