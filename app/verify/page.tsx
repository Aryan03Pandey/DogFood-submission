import { VerifyForm } from '@/components/verify/verify-form'

export const metadata = {
  title: 'Verify a signed file | Dogfood 2026',
  description: 'Check whether an exported file, results manifest, or certificate is genuine and unaltered.',
}

// Fully public — no session, matches the offline-verifiable design of the
// signing core itself (src/server/signing-service.ts): anyone can check a
// file with nothing but this page and the file itself.
export default function VerifyPage() {
  return (
    <main className="mx-auto w-full max-w-[720px] px-5 py-10 md:py-14">
      <p className="text-[11px] font-semibold text-muted-foreground">Verify</p>
      <h1 className="mt-1 text-[26px] font-bold tracking-[-0.02em] text-foreground">Verify a signed file</h1>
      <p className="mt-2 text-[13px] text-muted-foreground">
        Paste or upload a file this platform signed (an event export, results manifest, or
        certificate) to confirm it hasn&apos;t been altered.
      </p>
      <div className="mt-6">
        <VerifyForm />
      </div>
    </main>
  )
}
