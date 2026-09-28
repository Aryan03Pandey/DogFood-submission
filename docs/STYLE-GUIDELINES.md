# Dogfood 2026 Style Guidelines

Single source of truth for visual consistency. Coding agents must follow this
file when creating or editing any user-facing UI; human reviewers should hold
PRs to it.

## 1. Color scheme

The site is black-and-white first. Light mode is the default; dark mode
reverses the surfaces. Green is the only brand accent, used sparingly —
primary actions, active states, and the logo mark.

### Light mode (default)

| Role | Token / value | Use |
|---|---|---|
| Background | `--background` (`oklch(1 0 0)`, white) | Page surfaces |
| Foreground | `--foreground` (`oklch(0.145 0 0)`, near-black) | Headings, body text |
| Muted text | `--muted-foreground` (`oklch(0.556 0 0)`, gray) | Secondary text, placeholders |
| Muted fill | `--muted` (`oklch(0.97 0 0)`) | Subtle fills, hover states |
| Border / input | `--border` / `--input` (`oklch(0.922 0 0)`) | Hairlines, input borders |
| Primary button | near-black bg, white text | Default CTA (shadcn `default` variant) |
| Brand green | `#16a34a`, hover `#15803d`, white text | Logo mark, key CTAs, active nav, success |
| Destructive | `--destructive` (red) | Errors, dangerous actions only |

### Dark mode

Dark mode reverses surfaces via the `.dark` class in `app/globals.css`
(near-black background, white foreground, 10–15% white borders). Rules:

- Never hardcode light-mode hexes (`#fff`, `#f7f8fb`, `#20222b`) in new UI —
  use theme tokens (`bg-background`, `text-foreground`, `text-muted-foreground`,
  `border-border`) so both modes work.
- Green stays green in dark mode. Prefer a slightly brighter green
  (`#22c55e`) on dark surfaces for contrast; `#16a34a` on near-black is
  acceptable for large elements only.
- Muted text must stay readable: use `text-muted-foreground`, never a fixed
  light gray.

### Legacy exception

The console, login, and home pages predate this guide and still use violet
(`#635bdb`). Do not copy violet into new work. When touching those files,
migrate their accents to green opportunistically.

## 2. UI design principles

### shadcn first

- The project uses shadcn (`components.json`, `components/ui/`, `cn()` in
  `lib/utils.ts`). Prefer shadcn primitives (`button`, `input`, `dialog`,
  `badge`, …) over hand-rolled controls. Add missing primitives via the
  shadcn CLI so variants stay centralized; do not fork one-off button styles.
- Shared (non-primitive) components live in `components/` (`auth/`, …).
  There is exactly one components directory — do not create another.
- Compose with `cn()` for conditional classes so Tailwind conflicts merge
  instead of stacking.

### Spacing and layout scale

Base unit is 4px. Stay on these steps so rhythm is consistent:

- Page column: `max-w-5xl` (marketing/console), `max-w-[720px]` (narrow
  account pages), `max-w-[380px]` (login card). Center with `mx-auto`, page
  gutters `px-5`.
- Card padding: `p-5` (compact), `p-6` (default), `p-8` (hero/login card).
- Gaps: `gap-2` (chips/buttons), `gap-3`–`gap-4` (form fields, grids),
  `gap-8` (header groups).
- Control heights: `h-9` (small buttons), `h-10` (inputs, default buttons),
  header bar `h-16`.
- Vertical section rhythm: `mt-4` / `mt-6` between blocks, never ad-hoc
  pixel values.

### Border radius

Radius derives from `--radius: 0.625rem` (`app/globals.css`). Use:

- `rounded-lg` — buttons, inputs, small chips.
- `rounded-xl` — cards, panels, dialogs.
- `rounded-full` — avatars, icon buttons, pills.

Do not mix `rounded-2xl`/`rounded-3xl` into the same surface language, and
never put two different radii on elements that sit side by side.

### Typography

- One family (the app default) everywhere; emphasis comes from size and
  weight, not new fonts.
- Page title: ~22–28px bold tight tracking; section heading: 15–17px bold;
  body: 12–14px; micro-labels: 10–11px semibold uppercase only for eyebrows,
  never for body copy.
- Body text is foreground or muted-foreground. Gray body copy lighter than
  muted-foreground is banned in both modes.

## 3. Other rules for agents and humans

- **No gradients, no glow.** No `bg-clip-text` headline gradients,
  purple/blue washes, aurora blobs, or colored drop shadows. Surfaces are
  flat white/near-black with hairline borders.
- **Icons:** Lucide only (`lucide-react`), outline style (`strokeWidth`
  1.8–2), no emojis as icons. Icon-only buttons need `aria-label`.
- **Green discipline:** green means brand/action/success. It must never
  decorate errors, warnings, or neutral info. One green element per viewport
  is the norm; if everything is green, nothing is.
- **Every control does something.** No dead buttons or placeholder links —
  either wire it, link it to its real destination, or don't render it.
- **Forms:** every input has a visible label, errors render inline under the
  field, submit buttons show pending state and disable while working.
- **Dark-mode check:** every new screen must be eyeballed in both modes
  before handoff. If you hardcode a color, you own both modes for it.
- **Charts and data-viz:** grayscale ramp (`chart-1`…`chart-5`) plus green
  for the highlighted series only.
- **Reference implementation:** `components/site-header.tsx` follows this
  guide (green mark, hairline border, single radius language) — copy its
  patterns for new chrome.
