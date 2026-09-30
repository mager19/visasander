# Visa Intake App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first visa-intake app where applicants fill DS-160 data and upload documents through a link plus access code, and a single manager reviews completeness and progress in a private panel.

**Architecture:** One Next.js 15 (App Router) app on Vercel. Form structure lives in one declarative schema (`src/lib/form/schema.ts`) that drives progress calculation, screen navigation, validation, patch whitelisting, and the manager's data view. Neon Postgres stores applications (answers as JSONB), sessions, files metadata, and rate-limit counters; Cloudflare R2 stores files behind short-lived signed URLs. Pure logic lives in `src/lib/**` (unit-tested); DB-backed services are integration-tested against a Neon test branch.

**Tech Stack:** Next.js 15, React 19, TypeScript, `@neondatabase/serverless`, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (R2), Vitest, Playwright, plain CSS with design tokens.

**Spec:** `docs/superpowers/specs/2026-09-30-visa-intake-design.md` (read it first). Shared agent rules: `AGENTS.md`. Visual tokens: `DESIGN (1).md`. Question source: `Ds- 160.docx`.

## Global Constraints

- HTTPS only; Neon and R2 are encrypted at rest.
- Access code is 6 digits; 5 failed attempts lock the application; maximum 2 active sessions per application; regenerating the code invalidates all sessions and unlocks.
- Access codes and session tokens are stored hashed (HMAC with `APP_SECRET`); never stored in plaintext; the code is shown to the manager only at creation/regeneration.
- Files: private R2 bucket, signed URLs valid for 300 seconds, allowed types JPG/PNG/PDF (photo: JPG/PNG only), max 8 MB per file.
- Retention: `expires_at` = created + `RETENTION_DAYS` (default 90; 60 allowed). A daily cron deletes expired rows and their R2 objects.
- Single manager, password only (`MANAGER_PASSWORD_HASH`), signed `httpOnly` cookie, login rate-limited. Manager path configurable via `NEXT_PUBLIC_MANAGER_PATH` (default `gestor`). The whole site is `noindex`.
- No Supabase. No notifications, multi-manager accounts, or payments in v1.
- Saves are idempotent; nothing typed may be lost on failed upload or reload.
- Code, identifiers, comments, tests: English. User-facing form/panel copy: Spanish (neutral).
- Design tokens: lime `#beff50`, ink `#14140f`, canvas `#f5f5eb`, white `#ffffff`, ash `#d2d2c8`, graphite `#6e6e64`; 28px radii for cards/buttons; pills 9999px; inputs 8px; no shadows; Inter as OTSono substitute. Touch targets at least 48px; WCAG AA contrast.
- Conventional commits. No AI attribution trailers (per `AGENTS.md`).
- Pin `next@15`. Verify current library APIs with context7/official docs before relying on them (Neon driver `sql.query`, AWS SDK checksum options, R2 CORS format).

## Review Focus

Inputs the spec implies but whose handling is easy to miss. Each has a pinning test in the task named.

1. Access code typed with spaces/dashes or with leading zeros (`004 217`) must still authenticate → Task 4 (`normalizeCode`) and Task 6.
2. Answer patches with unknown keys, wrong types, oversized payloads, or unknown repeat sub-keys must be rejected, not stored → Task 3 (`sanitizePatch`).
3. File "complete" call using another application's object key or a path traversal must be rejected → Task 7 (`ownsKey`).
4. Two devices saving different fields at the same time must not overwrite each other → Task 5 (`saveAnswers` merge).
5. Changing a conditional answer from yes to no leaves stale hidden answers that must not count toward progress or appear in the manager's data view → Task 2 and Task 3 (`chapterRows`).

---

## File Structure

```
package.json, tsconfig.json, next.config.ts, vitest.config.ts, playwright.config.ts, vercel.json
.env.example, .gitignore
db/migrations/001_init.sql
scripts/migrate.mjs, scripts/hash-password.mjs
docs/SETUP.md
src/middleware.ts
src/app/layout.tsx, globals.css, page.tsx, robots.ts
src/app/s/[token]/page.tsx
src/app/manager/{layout.tsx,page.tsx,login/page.tsx,[id]/page.tsx}
src/app/api/s/[token]/{access,state,answers,submit}/route.ts
src/app/api/s/[token]/files/{presign,complete}/route.ts, files/[id]/route.ts
src/app/api/manager/{login,logout}/route.ts, applications/route.ts, applications/[id]/route.ts, files/[id]/route.ts
src/app/api/cron/purge/route.ts
src/components/applicant/{ApplicantApp,CodeGate,Wizard,ScreenView,RepeatView,FieldInput,ProgressBar,FileStep,Review,Notice}.tsx
src/components/manager/{LoginForm,NewApplication,CopyButton,DetailActions}.tsx
src/lib/form/{types,schema,file-kinds,visibility,progress,validate,steps,patch,display}.ts
src/lib/{constants,security,db,http,rate-limit,access,applicant-session,manager-auth,paths,files,r2,purge}.ts
src/lib/repo/{applications,sessions,files}.ts
src/lib/client/{api,upload}.ts
tests/setup.ts, tests/helpers/{db.ts,sample-answers.ts}
tests/form/*.test.ts, tests/lib/*.test.ts, tests/integration/*.test.ts
e2e/journey.spec.ts
```

---

### Task 1: Scaffold, tooling, design tokens

**Files:**
- Create: `package.json` (via npm), `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`, `tests/setup.ts`
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/robots.ts`, `src/lib/paths.ts`, `src/lib/constants.ts`

**Interfaces:**
- Produces: `MANAGER_PATH: string`, `mp(path?: string): string` (`src/lib/paths.ts`); `MAX_ATTEMPTS = 5`, `MAX_SESSIONS = 2`, `retentionDays(): number` (`src/lib/constants.ts`); CSS classes `.shell .card .btn .btn-primary .btn-ghost .field .choice .progress .eyebrow .notice`.

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/mager19/Documents/vibecoding/conceptos/visas
git status   # confirm the repo is initialized
npm init -y
npm install next@15 react@19 react-dom@19 @neondatabase/serverless @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm install -D typescript @types/node @types/react @types/react-dom vitest @playwright/test dotenv
npx playwright install chromium
```

- [ ] **Step 2: Set scripts** — edit `package.json` so `"scripts"` is:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "e2e": "playwright test",
  "migrate": "node --env-file=.env.local scripts/migrate.mjs",
  "migrate:test": "node --env-file=.env.test scripts/migrate.mjs",
  "hash-password": "node scripts/hash-password.mjs"
}
```

Also set `"private": true` and remove `"main"`.

- [ ] **Step 3: Write config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:
```ts
import type { NextConfig } from 'next';

const managerPath = process.env.NEXT_PUBLIC_MANAGER_PATH || 'gestor';

const config: NextConfig = {
  async rewrites() {
    return [
      { source: `/${managerPath}`, destination: '/manager' },
      { source: `/${managerPath}/:path*`, destination: '/manager/:path*' },
    ];
  },
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
  },
};

export default config;
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
  },
});
```

`tests/setup.ts`:
```ts
import { config } from 'dotenv';

config({ path: '.env.test' });
process.env.APP_SECRET ??= 'test-secret-test-secret-test-secret-123';
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
```

`.gitignore`:
```
node_modules
.next
.env*
!.env.example
next-env.d.ts
test-results
playwright-report
*.tsbuildinfo
```

`.env.example`:
```
APP_SECRET=            # 32+ random chars: openssl rand -base64 48
APP_URL=http://localhost:3000
DATABASE_URL=          # Neon connection string
TEST_DATABASE_URL=     # Neon test branch (tests/integration)
MANAGER_PASSWORD_HASH= # npm run hash-password -- "your password"
NEXT_PUBLIC_MANAGER_PATH=gestor
RETENTION_DAYS=90
CRON_SECRET=           # random string; Vercel sends it as Bearer token
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
```

`src/lib/constants.ts`:
```ts
export const MAX_ATTEMPTS = 5;
export const MAX_SESSIONS = 2;

export function retentionDays(): number {
  const n = Number(process.env.RETENTION_DAYS);
  return Number.isInteger(n) && n > 0 ? n : 90;
}
```

`src/lib/paths.ts`:
```ts
export const MANAGER_PATH = process.env.NEXT_PUBLIC_MANAGER_PATH || 'gestor';
export const mp = (path = ''): string => `/${MANAGER_PATH}${path}`;
```

- [ ] **Step 4: Design tokens and base styles** — `src/app/globals.css`:

```css
:root {
  --lime: #beff50; --ink: #14140f; --canvas: #f5f5eb; --white: #ffffff;
  --ash: #d2d2c8; --graphite: #6e6e64; --danger: #b3261e;
  --radius-card: 28px; --radius-input: 8px; --radius-pill: 9999px;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--canvas); color: var(--ink); font-family: var(--font-inter), system-ui, sans-serif; font-size: 16px; line-height: 1.5; }
h1 { font-size: 28px; line-height: 1.14; letter-spacing: -0.02em; font-weight: 500; margin: 8px 0 16px; }
h2 { font-size: 22px; line-height: 1.18; font-weight: 500; margin: 0 0 12px; }
a { color: inherit; }
:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.shell { max-width: 560px; margin: 0 auto; padding: 16px 16px 24px; min-height: 100dvh; display: flex; flex-direction: column; gap: 16px; }
.shell.wide { max-width: 1000px; }
.card { background: var(--white); border-radius: var(--radius-card); padding: 24px; }
.eyebrow { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--graphite); }
.muted { color: var(--graphite); }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 0 24px; border-radius: var(--radius-card); border: 0; font: inherit; font-weight: 500; cursor: pointer; text-decoration: none; }
.btn-primary { background: var(--lime); color: var(--ink); width: 100%; }
.btn-ghost { background: transparent; color: var(--ink); border: 1px solid var(--ash); }
.btn[disabled] { opacity: 0.5; cursor: not-allowed; }
.actions { position: sticky; bottom: 0; margin-top: auto; padding: 12px 0 calc(12px + env(safe-area-inset-bottom)); background: var(--canvas); display: grid; gap: 8px; }
.field { display: grid; gap: 6px; margin: 0 0 16px; padding: 0; border: 0; }
.field label, .field legend { font-weight: 500; }
.field input, .field select, .field textarea { min-height: 48px; padding: 10px 12px; border: 1px solid var(--ash); border-radius: var(--radius-input); background: var(--white); font: inherit; width: 100%; }
.field textarea { min-height: 96px; }
.field .error { color: var(--danger); font-size: 14px; }
.choices { display: flex; gap: 8px; }
.choice { flex: 1; min-height: 52px; border-radius: var(--radius-pill); border: 1px solid var(--ash); background: var(--white); font: inherit; font-weight: 500; cursor: pointer; }
.choice.on { background: var(--ink); color: var(--white); border-color: var(--ink); }
.progress { height: 10px; border-radius: var(--radius-pill); background: var(--ash); overflow: hidden; }
.progress > span { display: block; height: 100%; background: var(--lime); transition: width 0.3s ease; }
.notice { background: var(--white); border-radius: var(--radius-card); padding: 24px; text-align: center; }
.pill { display: inline-block; padding: 2px 12px; border-radius: var(--radius-pill); background: var(--canvas); font-size: 14px; }
.step { display: flex; flex-direction: column; flex: 1; animation: enter 0.25s ease; }
@keyframes enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

- [ ] **Step 5: Layout, home, robots**

`src/app/layout.tsx`:
```tsx
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = { title: 'Solicitud de visa', robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main className="shell">
      <div className="notice">
        <h1>Acceso solo con enlace</h1>
        <p className="muted">Usa el enlace y el código que te entregó tu gestor.</p>
      </div>
    </main>
  );
}
```

`src/app/robots.ts`:
```ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
```

- [ ] **Step 6: Verify build**

Run: `npm run typecheck && npm run build`
Expected: both succeed; `/` and `/robots.txt` listed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with design tokens and test tooling"
```

---

### Task 2: Form schema, visibility, progress

**Files:**
- Create: `src/lib/form/types.ts`, `src/lib/form/file-kinds.ts`, `src/lib/form/schema.ts`, `src/lib/form/visibility.ts`, `src/lib/form/progress.ts`
- Test: `tests/helpers/sample-answers.ts`, `tests/form/progress.test.ts`

**Interfaces:**
- Produces:
  - Types `Answers`, `FieldType`, `Option`, `Condition`, `Field`, `RepeatSpec`, `Screen`, `Chapter` (`types.ts`).
  - `CHAPTERS: Chapter[]` (`schema.ts`).
  - `FILE_KINDS`, `type FileKind`, `REQUIRED_FILE_KINDS`, `FILE_LABELS: Record<FileKind,string>` (`file-kinds.ts`).
  - `isVisible(cond: Condition | undefined, answers: Answers): boolean`, `isFilled(v: unknown): boolean` (`visibility.ts`).
  - `screenStatus(screen, answers): {total:number; answered:number; missing:string[]}`, `isScreenComplete(screen, answers): boolean`, `computeProgress(answers, fileKinds): Progress` with `Progress {percent; total; answered; chapters: ChapterProgress[]}` and `ChapterProgress {id; title; total; answered; missing: string[]}` (`progress.ts`).
- Storage contract: answers are flat; yes/no stored as `'yes'|'no'`; dates as `YYYY-MM-DD`; a repeat screen stores `answers[repeat.key]: Record<string,string>[]` plus `answers[`${repeat.key}__none`]: boolean`.

- [ ] **Step 1: Write types and file kinds**

`src/lib/form/types.ts`:
```ts
export type Answers = Record<string, unknown>;
export type FieldType = 'text' | 'tel' | 'email' | 'date' | 'select' | 'yesno' | 'textarea' | 'number';
export interface Option { value: string; label: string }
export interface Condition { key: string; in?: string[]; notIn?: string[] }
export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: Option[];
  showIf?: Condition;
  /** Date field that must be strictly later than the date stored under this key. */
  after?: string;
  hint?: string;
}
export interface RepeatSpec { key: string; addLabel: string }
export interface Screen { id: string; title: string; fields: Field[]; showIf?: Condition; repeat?: RepeatSpec }
export interface Chapter { id: string; title: string; screens: Screen[] }
```

`src/lib/form/file-kinds.ts`:
```ts
export const FILE_KINDS = ['passport', 'photo', 'national_id', 'previous_visa', 'employment_letter'] as const;
export type FileKind = (typeof FILE_KINDS)[number];
export const REQUIRED_FILE_KINDS: FileKind[] = ['passport', 'photo', 'national_id'];
export const FILE_LABELS: Record<FileKind, string> = {
  passport: 'Foto de la página de datos del pasaporte',
  photo: 'Foto tipo visa',
  national_id: 'Cédula de ciudadanía',
  previous_visa: 'Visa anterior de EE. UU. (si aplica)',
  employment_letter: 'Carta laboral (opcional)',
};
```

- [ ] **Step 2: Write the failing tests** — `tests/helpers/sample-answers.ts`:

```ts
import { CHAPTERS } from '@/lib/form/schema';
import type { Answers, Field } from '@/lib/form/types';

function sampleValue(f: Field): string {
  switch (f.type) {
    case 'yesno': return 'no';
    case 'select': return f.options![0].value;
    case 'date': return f.after ? '2032-01-01' : '2020-01-01';
    case 'email': return 'a@b.co';
    case 'tel': return '3001234567';
    case 'number': return '1000';
    default: return 'x';
  }
}

export function sampleAnswers(overrides: Answers = {}): Answers {
  const a: Answers = {};
  for (const ch of CHAPTERS) {
    for (const s of ch.screens) {
      if (s.repeat) { a[`${s.repeat.key}__none`] = true; continue; }
      for (const f of s.fields) a[f.key] = sampleValue(f);
    }
  }
  return { ...a, ...overrides };
}

export const ALL_REQUIRED_FILES = ['passport', 'photo', 'national_id'];
```

`tests/form/progress.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computeProgress } from '@/lib/form/progress';
import { CHAPTERS } from '@/lib/form/schema';
import { ALL_REQUIRED_FILES, sampleAnswers } from '../helpers/sample-answers';

describe('schema', () => {
  it('has eight-chapter shape minus files and unique field keys', () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual(['personal', 'passport', 'travel', 'history', 'us_contact', 'family', 'work']);
    const keys = CHAPTERS.flatMap((c) => c.screens.flatMap((s) => [...(s.repeat ? [s.repeat.key] : s.fields.map((f) => f.key))]));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('computeProgress', () => {
  it('is 0% for an empty application and lists missing items', () => {
    const p = computeProgress({}, []);
    expect(p.percent).toBe(0);
    expect(p.total).toBeGreaterThan(40);
    expect(p.chapters.find((c) => c.id === 'files')!.missing).toHaveLength(3);
  });

  it('is 100% when everything applicable is answered and required files exist', () => {
    const p = computeProgress(sampleAnswers(), ALL_REQUIRED_FILES);
    expect(p.percent).toBe(100);
    expect(p.chapters.every((c) => c.missing.length === 0)).toBe(true);
  });

  it('counts required files', () => {
    const p = computeProgress(sampleAnswers(), ['passport']);
    expect(p.percent).toBeLessThan(100);
    expect(p.chapters.find((c) => c.id === 'files')!.answered).toBe(1);
  });

  it('counts a conditional field only when its trigger is active', () => {
    const hidden = computeProgress(sampleAnswers({ pasaporte_perdido: 'no', pasaporte_perdido_detalle: '' }), ALL_REQUIRED_FILES);
    expect(hidden.percent).toBe(100);
    const shown = computeProgress(sampleAnswers({ pasaporte_perdido: 'yes', pasaporte_perdido_detalle: '' }), ALL_REQUIRED_FILES);
    expect(shown.percent).toBeLessThan(100);
    expect(shown.chapters.find((c) => c.id === 'passport')!.missing).toContain('Detalles de la pérdida o robo');
  });

  it('ignores stale answers of fields that became hidden (yes -> no)', () => {
    const p = computeProgress(sampleAnswers({ pasaporte_perdido: 'no', pasaporte_perdido_detalle: 'old text' }), ALL_REQUIRED_FILES);
    expect(p.total).toBe(computeProgress(sampleAnswers({ pasaporte_perdido: 'no' }), ALL_REQUIRED_FILES).total);
  });

  it('treats a repeat screen as complete with the none flag or valid entries only', () => {
    const base = { redes_sociales__none: false };
    const empty = computeProgress(sampleAnswers({ ...base, redes_sociales: [] }), ALL_REQUIRED_FILES);
    expect(empty.percent).toBeLessThan(100);
    const partial = computeProgress(sampleAnswers({ ...base, redes_sociales: [{ plataforma: 'Instagram' }] }), ALL_REQUIRED_FILES);
    expect(partial.percent).toBeLessThan(100);
    const full = computeProgress(sampleAnswers({ ...base, redes_sociales: [{ plataforma: 'Instagram', usuario: 'ana' }] }), ALL_REQUIRED_FILES);
    expect(full.percent).toBe(100);
  });

  it('hides whole screens (e.g. employer details for unemployed)', () => {
    const p = computeProgress(sampleAnswers({ ocupacion: 'desempleado' }), ALL_REQUIRED_FILES);
    expect(p.percent).toBe(100);
    expect(p.chapters.find((c) => c.id === 'work')!.missing).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/form/progress.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement the schema** — `src/lib/form/schema.ts`:

```ts
import type { Chapter, Condition, Field, Option } from './types';

const f = (key: string, label: string, o: Partial<Field> = {}): Field => ({ key, label, type: 'text', required: true, ...o });
const yesNo = (key: string, label: string): Field => f(key, label, { type: 'yesno' });
const opts = (...pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));
const when = (key: string, ...values: string[]): Condition => ({ key, in: values });
const YES = (key: string) => when(key, 'yes');

export const CHAPTERS: Chapter[] = [
  {
    id: 'personal',
    title: 'Información personal',
    screens: [
      { id: 'names', title: 'Tu nombre', fields: [f('apellidos', 'Apellidos (como en el pasaporte)'), f('nombres', 'Nombres (como en el pasaporte)')] },
      {
        id: 'sex_marital', title: 'Sexo y estado civil',
        fields: [
          f('sexo', 'Sexo', { type: 'select', options: opts(['F', 'Femenino'], ['M', 'Masculino']) }),
          f('estado_civil', 'Estado civil', { type: 'select', options: opts(['soltero', 'Soltero/a'], ['casado', 'Casado/a'], ['union_libre', 'Unión libre'], ['divorciado', 'Divorciado/a'], ['viudo', 'Viudo/a'], ['separado', 'Separado/a']) }),
        ],
      },
      { id: 'birth_date', title: 'Fecha de nacimiento', fields: [f('fecha_nacimiento', 'Fecha de nacimiento', { type: 'date' })] },
      { id: 'birth_place', title: 'Lugar de nacimiento', fields: [f('ciudad_nacimiento', 'Ciudad'), f('departamento_nacimiento', 'Departamento o estado'), f('pais_nacimiento', 'País')] },
      {
        id: 'nationality', title: 'Nacionalidad',
        fields: [
          f('nacionalidad', 'Nacionalidad'),
          yesNo('otras_nacionalidades', '¿Tienes otras nacionalidades o residencias permanentes en otros países?'),
          f('otras_nacionalidades_detalle', 'Indica cuáles', { type: 'textarea', showIf: YES('otras_nacionalidades') }),
        ],
      },
      { id: 'national_id', title: 'Documento de identidad', fields: [f('cedula', 'Número de cédula o identificación nacional')] },
      { id: 'address', title: 'Domicilio', fields: [f('direccion', 'Dirección de domicilio actual', { type: 'textarea' })] },
      {
        id: 'contact', title: 'Datos de contacto',
        fields: [
          f('telefono_principal', 'Teléfono principal', { type: 'tel' }),
          f('telefono_alterno', 'Teléfono alternativo', { type: 'tel', required: false }),
          f('correo', 'Correo electrónico', { type: 'email' }),
        ],
      },
      {
        id: 'social', title: 'Redes sociales (últimos 5 años)',
        repeat: { key: 'redes_sociales', addLabel: 'Agregar otra red' },
        fields: [f('plataforma', 'Plataforma (Instagram, Facebook, etc.)'), f('usuario', 'Nombre de usuario')],
      },
    ],
  },
  {
    id: 'passport',
    title: 'Pasaporte',
    screens: [
      {
        id: 'passport_type', title: 'Pasaporte',
        fields: [
          f('pasaporte_tipo', 'Tipo de pasaporte', { type: 'select', options: opts(['ordinario', 'Ordinario'], ['oficial', 'Oficial'], ['diplomatico', 'Diplomático']) }),
          f('pasaporte_numero', 'Número de pasaporte'),
        ],
      },
      { id: 'passport_issuer', title: 'Emisión', fields: [f('pasaporte_pais_emision', 'País de emisión'), f('pasaporte_autoridad', 'Autoridad que lo emitió')] },
      {
        id: 'passport_dates', title: 'Fechas del pasaporte',
        fields: [
          f('pasaporte_expedicion', 'Fecha de expedición', { type: 'date' }),
          f('pasaporte_caducidad', 'Fecha de caducidad', { type: 'date', after: 'pasaporte_expedicion' }),
        ],
      },
      {
        id: 'passport_lost', title: 'Pasaporte perdido',
        fields: [
          yesNo('pasaporte_perdido', '¿Has perdido o te han robado algún pasaporte?'),
          f('pasaporte_perdido_detalle', 'Detalles de la pérdida o robo', { type: 'textarea', showIf: YES('pasaporte_perdido') }),
        ],
      },
    ],
  },
  {
    id: 'travel',
    title: 'Viaje',
    screens: [
      { id: 'purpose', title: 'Propósito del viaje', fields: [f('viaje_proposito', 'Propósito principal del viaje a EE. UU.', { type: 'textarea' })] },
      {
        id: 'itinerary', title: 'Itinerario',
        fields: [
          yesNo('viaje_itinerario', '¿Tienes un itinerario de viaje específico?'),
          f('viaje_fechas', 'Fechas estimadas del viaje', { showIf: YES('viaje_itinerario') }),
          f('viaje_vuelo', 'Vuelo (si ya lo tienes)', { required: false, showIf: YES('viaje_itinerario') }),
          f('viaje_alojamiento', 'Hotel o dirección de estancia', { showIf: YES('viaje_itinerario') }),
        ],
      },
      {
        id: 'payer', title: 'Quién paga el viaje',
        fields: [
          f('viaje_paga', '¿Quién paga el viaje?', { type: 'select', options: opts(['yo', 'Yo mismo/a'], ['familiar', 'Un familiar'], ['otra_persona', 'Otra persona'], ['empresa', 'Una empresa']) }),
          f('viaje_paga_detalle', 'Nombre de quien paga', { showIf: { key: 'viaje_paga', notIn: ['yo'] } }),
        ],
      },
    ],
  },
  {
    id: 'history',
    title: 'Acompañantes e historial en EE. UU.',
    screens: [
      { id: 'companions_q', title: 'Acompañantes', fields: [yesNo('acompanantes_si', '¿Viajas con otras personas?')] },
      {
        id: 'companions', title: 'Datos de los acompañantes', showIf: YES('acompanantes_si'),
        repeat: { key: 'acompanantes', addLabel: 'Agregar otro acompañante' },
        fields: [f('nombre', 'Nombre completo'), f('parentesco', 'Parentesco o relación')],
      },
      { id: 'prev_trips_q', title: 'Viajes anteriores', fields: [yesNo('estuvo_eeuu', '¿Has estado antes en EE. UU.?')] },
      {
        id: 'prev_trips', title: 'Viajes anteriores a EE. UU.', showIf: YES('estuvo_eeuu'),
        repeat: { key: 'viajes_previos', addLabel: 'Agregar otro viaje' },
        fields: [f('fecha', 'Fecha aproximada de llegada'), f('duracion', 'Duración de la estadía')],
      },
      {
        id: 'prev_visa', title: 'Visa anterior',
        fields: [
          yesNo('visa_previa', '¿Has tenido alguna vez una visa de EE. UU.?'),
          f('visa_previa_numero', 'Número de la visa anterior', { required: false, showIf: YES('visa_previa') }),
          f('visa_previa_fecha', 'Fecha de expedición de la visa', { type: 'date', showIf: YES('visa_previa') }),
          f('visa_previa_perdida', '¿Se perdió, fue robada o revocada?', { type: 'yesno', showIf: YES('visa_previa') }),
        ],
      },
      {
        id: 'denied', title: 'Negativas',
        fields: [
          yesNo('visa_negada', '¿Te han negado una visa, negado la entrada a EE. UU. o retirado tu solicitud en un puerto de entrada?'),
          f('visa_negada_detalle', 'Cuéntanos qué pasó', { type: 'textarea', showIf: YES('visa_negada') }),
        ],
      },
    ],
  },
  {
    id: 'us_contact',
    title: 'Contacto en EE. UU.',
    screens: [
      { id: 'us_contact_who', title: 'Persona de contacto', fields: [f('contacto_nombre', 'Persona, hotel u organización de contacto'), f('contacto_direccion', 'Dirección completa en EE. UU.', { type: 'textarea' })] },
      { id: 'us_contact_how', title: 'Cómo contactarlo', fields: [f('contacto_telefono', 'Teléfono de contacto', { type: 'tel' }), f('contacto_correo', 'Correo de contacto', { type: 'email', required: false })] },
    ],
  },
  {
    id: 'family',
    title: 'Familia',
    screens: [
      { id: 'father', title: 'Tu padre', fields: [f('padre_nombres', 'Nombres completos'), f('padre_nacimiento', 'Fecha de nacimiento', { type: 'date' }), f('padre_ubicacion', 'Ubicación actual')] },
      { id: 'mother', title: 'Tu madre', fields: [f('madre_nombres', 'Nombres completos'), f('madre_nacimiento', 'Fecha de nacimiento', { type: 'date' }), f('madre_ubicacion', 'Ubicación actual')] },
      {
        id: 'family_us', title: 'Familiares directos en EE. UU.',
        fields: [
          yesNo('familiares_eeuu', '¿Tienes familiares directos (padres, hermanos, hijos o cónyuge) viviendo en EE. UU.?'),
          f('familiares_eeuu_detalle', 'Nombres y parentesco', { type: 'textarea', showIf: YES('familiares_eeuu') }),
        ],
      },
      {
        id: 'other_family_us', title: 'Otros familiares en EE. UU.',
        fields: [
          yesNo('otros_familiares_eeuu', '¿Tienes otros familiares en EE. UU. aparte de los mencionados?'),
          f('otros_familiares_eeuu_detalle', 'Nombres y parentesco', { type: 'textarea', showIf: YES('otros_familiares_eeuu') }),
        ],
      },
    ],
  },
  {
    id: 'work',
    title: 'Trabajo y estudios',
    screens: [
      {
        id: 'occupation', title: 'Ocupación',
        fields: [f('ocupacion', 'Ocupación actual principal', { type: 'select', options: opts(['empleado', 'Empleado/a'], ['independiente', 'Independiente'], ['estudiante', 'Estudiante'], ['desempleado', 'Desempleado/a'], ['jubilado', 'Jubilado/a']) })],
      },
      {
        id: 'employer', title: 'Empresa o institución actual', showIf: when('ocupacion', 'empleado', 'independiente', 'estudiante'),
        fields: [f('empresa_nombre', 'Nombre de la empresa o institución'), f('empresa_direccion', 'Dirección'), f('empresa_telefono', 'Teléfono', { type: 'tel' })],
      },
      {
        id: 'job_details', title: 'Detalles del trabajo', showIf: when('ocupacion', 'empleado', 'independiente', 'estudiante'),
        fields: [
          f('empresa_inicio', 'Fecha de inicio', { type: 'date' }),
          f('salario_mensual', 'Salario mensual (moneda local)', { type: 'number', showIf: when('ocupacion', 'empleado', 'independiente') }),
          f('empresa_funciones', 'Descripción breve de tus funciones', { type: 'textarea' }),
        ],
      },
      {
        id: 'prev_jobs', title: 'Empleos anteriores (últimos 5 años)',
        repeat: { key: 'empleos_previos', addLabel: 'Agregar otro empleo' },
        fields: [
          f('empresa', 'Empresa'), f('direccion', 'Dirección', { required: false }), f('telefono', 'Teléfono', { type: 'tel', required: false }),
          f('inicio', 'Fecha de inicio', { type: 'date' }), f('fin', 'Fecha de fin', { type: 'date', after: 'inicio' }),
          f('funciones', 'Funciones', { type: 'textarea', required: false }),
        ],
      },
      {
        id: 'education', title: 'Estudios',
        repeat: { key: 'educacion', addLabel: 'Agregar otra institución' },
        fields: [
          f('institucion', 'Nombre de la institución'), f('direccion', 'Dirección', { required: false }),
          f('nivel', 'Nivel', { type: 'select', options: opts(['secundaria', 'Secundaria'], ['universidad', 'Universidad'], ['posgrado', 'Posgrado'], ['otro', 'Otro']) }),
          f('desde', 'Desde', { type: 'date' }), f('hasta', 'Hasta', { type: 'date', after: 'desde' }),
        ],
      },
      { id: 'languages', title: 'Idiomas', fields: [f('idiomas', 'Idiomas que hablas')] },
      { id: 'visited', title: 'Países visitados', fields: [f('paises_visitados', 'Países visitados en los últimos 5 años', { type: 'textarea' })] },
      { id: 'orgs', title: 'Organizaciones', fields: [f('organizaciones', 'Organizaciones profesionales o caritativas a las que perteneces', { type: 'textarea', required: false })] },
    ],
  },
];
```

- [ ] **Step 5: Implement visibility and progress**

`src/lib/form/visibility.ts`:
```ts
import type { Answers, Condition } from './types';

export function isFilled(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

export function isVisible(cond: Condition | undefined, answers: Answers): boolean {
  if (!cond) return true;
  const v = typeof answers[cond.key] === 'string' ? (answers[cond.key] as string) : '';
  if (cond.in) return cond.in.includes(v);
  if (cond.notIn) return v !== '' && !cond.notIn.includes(v);
  return true;
}
```

`src/lib/form/progress.ts`:
```ts
import { FILE_LABELS, REQUIRED_FILE_KINDS } from './file-kinds';
import { CHAPTERS } from './schema';
import type { Answers, Screen } from './types';
import { isFilled, isVisible } from './visibility';

export interface Units { total: number; answered: number; missing: string[] }
export interface ChapterProgress { id: string; title: string; total: number; answered: number; missing: string[] }
export interface Progress { percent: number; total: number; answered: number; chapters: ChapterProgress[] }

export function screenStatus(screen: Screen, answers: Answers): Units {
  if (!isVisible(screen.showIf, answers)) return { total: 0, answered: 0, missing: [] };
  if (screen.repeat) {
    const { key } = screen.repeat;
    const entries = Array.isArray(answers[key]) ? (answers[key] as Answers[]) : [];
    const none = answers[`${key}__none`] === true;
    const required = screen.fields.filter((f) => f.required);
    const valid = entries.length > 0 && entries.every((e) => required.every((f) => isFilled(e[f.key])));
    const done = none || valid;
    return { total: 1, answered: done ? 1 : 0, missing: done ? [] : [screen.title] };
  }
  const required = screen.fields.filter((f) => f.required && isVisible(f.showIf, answers));
  const missing = required.filter((f) => !isFilled(answers[f.key])).map((f) => f.label);
  return { total: required.length, answered: required.length - missing.length, missing };
}

export function isScreenComplete(screen: Screen, answers: Answers): boolean {
  const s = screenStatus(screen, answers);
  return s.total === s.answered;
}

export function computeProgress(answers: Answers, fileKinds: string[]): Progress {
  const chapters: ChapterProgress[] = CHAPTERS.map((ch) => {
    const units = ch.screens.map((s) => screenStatus(s, answers));
    return {
      id: ch.id,
      title: ch.title,
      total: units.reduce((n, u) => n + u.total, 0),
      answered: units.reduce((n, u) => n + u.answered, 0),
      missing: units.flatMap((u) => u.missing),
    };
  });
  const missingFiles = REQUIRED_FILE_KINDS.filter((k) => !fileKinds.includes(k));
  chapters.push({
    id: 'files',
    title: 'Archivos',
    total: REQUIRED_FILE_KINDS.length,
    answered: REQUIRED_FILE_KINDS.length - missingFiles.length,
    missing: missingFiles.map((k) => FILE_LABELS[k]),
  });
  const total = chapters.reduce((n, c) => n + c.total, 0);
  const answered = chapters.reduce((n, c) => n + c.answered, 0);
  return { percent: total === 0 ? 0 : Math.round((answered / total) * 100), total, answered, chapters };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/form/progress.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add form schema, visibility rules and progress calculation"
```

---

### Task 3: Validation, steps, patch sanitizer, data display

**Files:**
- Create: `src/lib/form/validate.ts`, `src/lib/form/steps.ts`, `src/lib/form/patch.ts`, `src/lib/form/display.ts`
- Test: `tests/form/validate.test.ts`, `tests/form/steps.test.ts`, `tests/form/patch.test.ts`, `tests/form/display.test.ts`

**Interfaces:**
- Consumes: `CHAPTERS`, `isVisible`, `isScreenComplete`, types from Task 2.
- Produces:
  - `validateValue(field: Field, value: unknown, all: Answers): string | null`; `validateFields(fields: Field[], values: Answers, context: Answers): Record<string,string>` (`validate.ts`).
  - `type Step = {kind:'chapter'; chapter: Chapter} | {kind:'screen'; chapter: Chapter; screen: Screen} | {kind:'files'} | {kind:'review'}`; `buildSteps(answers): Step[]`; `firstIncompleteStep(steps, answers): number` (`steps.ts`).
  - `sanitizePatch(input: unknown): Answers | null` (`patch.ts`).
  - `interface Row {label:string; value:string; missing:boolean}`; `chapterRows(chapter, answers): Row[]`; `chapterAsText(chapter, answers): string` (`display.ts`).

- [ ] **Step 1: Write the failing tests**

`tests/form/validate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { validateFields, validateValue } from '@/lib/form/validate';
import type { Field } from '@/lib/form/types';

const field = (o: Partial<Field>): Field => ({ key: 'k', label: 'K', type: 'text', required: true, ...o });

describe('validateValue', () => {
  it('requires required fields but allows empty optional ones', () => {
    expect(validateValue(field({}), '  ', {})).toBe('Este campo es obligatorio');
    expect(validateValue(field({ required: false }), '', {})).toBeNull();
  });
  it('validates email and phone formats', () => {
    expect(validateValue(field({ type: 'email' }), 'nope', {})).toBe('Correo no válido');
    expect(validateValue(field({ type: 'email' }), 'a@b.co', {})).toBeNull();
    expect(validateValue(field({ type: 'tel' }), '123', {})).toBe('Teléfono no válido');
    expect(validateValue(field({ type: 'tel' }), '+57 300 123 4567', {})).toBeNull();
  });
  it('validates dates and ordering', () => {
    expect(validateValue(field({ type: 'date' }), '2020-13-45', {})).toBe('Fecha no válida');
    const exp = field({ key: 'exp', type: 'date', after: 'iss' });
    expect(validateValue(exp, '2019-01-01', { iss: '2020-01-01' })).toBe('Debe ser posterior a la fecha anterior');
    expect(validateValue(exp, '2030-01-01', { iss: '2020-01-01' })).toBeNull();
  });
  it('validates numbers', () => {
    expect(validateValue(field({ type: 'number' }), 'abc', {})).toBe('Número no válido');
    expect(validateValue(field({ type: 'number' }), '1500000', {})).toBeNull();
  });
});

describe('validateFields', () => {
  it('skips hidden conditional fields and uses context for conditions', () => {
    const fields = [field({ key: 'a', showIf: { key: 'q', in: ['yes'] } })];
    expect(validateFields(fields, { a: '' }, { q: 'no' })).toEqual({});
    expect(validateFields(fields, { a: '' }, { q: 'yes' })).toEqual({ a: 'Este campo es obligatorio' });
  });
});
```

`tests/form/steps.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildSteps, firstIncompleteStep } from '@/lib/form/steps';
import { sampleAnswers } from '../helpers/sample-answers';

describe('buildSteps', () => {
  it('starts with a chapter intro and ends with files then review', () => {
    const steps = buildSteps({});
    expect(steps[0].kind).toBe('chapter');
    expect(steps.at(-2)!.kind).toBe('files');
    expect(steps.at(-1)!.kind).toBe('review');
  });
  it('omits hidden screens and chapters', () => {
    const ids = (a: Record<string, unknown>) => buildSteps(a).flatMap((s) => (s.kind === 'screen' ? [s.screen.id] : []));
    expect(ids({})).not.toContain('companions');
    expect(ids({ acompanantes_si: 'yes' })).toContain('companions');
    expect(ids({ ocupacion: 'desempleado' })).not.toContain('employer');
  });
});

describe('firstIncompleteStep', () => {
  it('returns 0 for a new application', () => {
    expect(firstIncompleteStep(buildSteps({}), {})).toBe(0);
  });
  it('lands on the files step when all questions are answered', () => {
    const a = sampleAnswers();
    const steps = buildSteps(a);
    expect(steps[firstIncompleteStep(steps, a)].kind).toBe('files');
  });
  it('returns the chapter intro when the first incomplete screen opens a chapter', () => {
    const a = sampleAnswers();
    delete a.pasaporte_numero;
    const steps = buildSteps(a);
    const s = steps[firstIncompleteStep(steps, a)];
    expect(s.kind).toBe('chapter');
    expect(s.kind === 'chapter' && s.chapter.id).toBe('passport');
  });
});
```

`tests/form/patch.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { sanitizePatch } from '@/lib/form/patch';

describe('sanitizePatch', () => {
  it('accepts known keys, trims strings, and accepts repeat arrays and none flags', () => {
    expect(sanitizePatch({ apellidos: '  Pérez ', redes_sociales: [{ plataforma: 'IG', usuario: 'ana' }], redes_sociales__none: false })).toEqual({
      apellidos: 'Pérez',
      redes_sociales: [{ plataforma: 'IG', usuario: 'ana' }],
      redes_sociales__none: false,
    });
  });
  it('rejects unknown keys', () => {
    expect(sanitizePatch({ hacked: 'x' })).toBeNull();
    expect(sanitizePatch({ __proto__x: 'x' })).toBeNull();
  });
  it('rejects wrong types', () => {
    expect(sanitizePatch({ apellidos: 5 })).toBeNull();
    expect(sanitizePatch({ redes_sociales__none: 'yes' })).toBeNull();
    expect(sanitizePatch({ redes_sociales: 'x' })).toBeNull();
    expect(sanitizePatch(null)).toBeNull();
    expect(sanitizePatch([])).toBeNull();
  });
  it('rejects unknown repeat sub-keys and oversized input', () => {
    expect(sanitizePatch({ redes_sociales: [{ plataforma: 'IG', evil: 'x' }] })).toBeNull();
    expect(sanitizePatch({ apellidos: 'x'.repeat(2001) })).toBeNull();
    expect(sanitizePatch({ redes_sociales: Array.from({ length: 21 }, () => ({ plataforma: 'a' })) })).toBeNull();
  });
});
```

`tests/form/display.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { chapterAsText, chapterRows } from '@/lib/form/display';
import { CHAPTERS } from '@/lib/form/schema';

const passport = CHAPTERS.find((c) => c.id === 'passport')!;

describe('chapterRows', () => {
  it('marks empty required fields as missing and formats yes/no and selects', () => {
    const rows = chapterRows(passport, { pasaporte_tipo: 'ordinario', pasaporte_perdido: 'no' });
    expect(rows.find((r) => r.label === 'Tipo de pasaporte')).toMatchObject({ value: 'Ordinario', missing: false });
    expect(rows.find((r) => r.label === 'Número de pasaporte')).toMatchObject({ value: '', missing: true });
    expect(rows.find((r) => r.label.startsWith('¿Has perdido'))!.value).toBe('No');
  });
  it('omits hidden conditional fields even when stale answers exist', () => {
    const rows = chapterRows(passport, { pasaporte_perdido: 'no', pasaporte_perdido_detalle: 'stale text' });
    expect(rows.some((r) => r.value === 'stale text')).toBe(false);
  });
  it('renders repeat entries and the none flag', () => {
    const personal = CHAPTERS[0];
    expect(chapterRows(personal, { redes_sociales__none: true }).find((r) => r.label.startsWith('Redes'))!.value).toBe('Ninguno');
    const rows = chapterRows(personal, { redes_sociales: [{ plataforma: 'IG', usuario: 'ana' }] });
    expect(rows.find((r) => r.label === 'Redes sociales (últimos 5 años) #1')!.value).toContain('ana');
  });
  it('builds copyable text', () => {
    expect(chapterAsText(passport, { pasaporte_numero: 'AB123' })).toContain('Número de pasaporte: AB123');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/form`
Expected: the four new files FAIL (modules missing); `progress.test.ts` still PASS.

- [ ] **Step 3: Implement**

`src/lib/form/validate.ts`:
```ts
import type { Answers, Field } from './types';
import { isVisible } from './visibility';

export function validateValue(field: Field, value: unknown, all: Answers): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  if (v === '') return field.required ? 'Este campo es obligatorio' : null;
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Correo no válido';
  if (field.type === 'tel' && v.replace(/\D/g, '').length < 7) return 'Teléfono no válido';
  if (field.type === 'number' && !/^\d+([.,]\d+)?$/.test(v)) return 'Número no válido';
  if (field.type === 'date') {
    const d = new Date(`${v}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return 'Fecha no válida';
    const other = field.after ? all[field.after] : undefined;
    if (typeof other === 'string' && other && v <= other) return 'Debe ser posterior a la fecha anterior';
  }
  return null;
}

export function validateFields(fields: Field[], values: Answers, context: Answers): Record<string, string> {
  const merged = { ...context, ...values };
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (!isVisible(f.showIf, merged)) continue;
    const err = validateValue(f, values[f.key], merged);
    if (err) errors[f.key] = err;
  }
  return errors;
}
```

`src/lib/form/steps.ts`:
```ts
import { isScreenComplete } from './progress';
import { CHAPTERS } from './schema';
import type { Answers, Chapter, Screen } from './types';
import { isVisible } from './visibility';

export type Step =
  | { kind: 'chapter'; chapter: Chapter }
  | { kind: 'screen'; chapter: Chapter; screen: Screen }
  | { kind: 'files' }
  | { kind: 'review' };

export function buildSteps(answers: Answers): Step[] {
  const steps: Step[] = [];
  for (const chapter of CHAPTERS) {
    const screens = chapter.screens.filter((s) => isVisible(s.showIf, answers));
    if (screens.length === 0) continue;
    steps.push({ kind: 'chapter', chapter });
    for (const screen of screens) steps.push({ kind: 'screen', chapter, screen });
  }
  steps.push({ kind: 'files' }, { kind: 'review' });
  return steps;
}

export function firstIncompleteStep(steps: Step[], answers: Answers): number {
  const i = steps.findIndex((s) => s.kind === 'screen' && !isScreenComplete(s.screen, answers));
  if (i === -1) return steps.findIndex((s) => s.kind === 'files');
  return steps[i - 1]?.kind === 'chapter' ? i - 1 : i;
}
```

`src/lib/form/patch.ts`:
```ts
import { CHAPTERS } from './schema';
import type { Answers } from './types';

const MAX_PATCH_BYTES = 50_000;
const MAX_STRING = 2000;
const MAX_ENTRIES = 20;

type Spec = { kind: 'text' } | { kind: 'none' } | { kind: 'repeat'; fields: Set<string> };
const SPECS = new Map<string, Spec>();
for (const ch of CHAPTERS) {
  for (const s of ch.screens) {
    if (s.repeat) {
      SPECS.set(s.repeat.key, { kind: 'repeat', fields: new Set(s.fields.map((f) => f.key)) });
      SPECS.set(`${s.repeat.key}__none`, { kind: 'none' });
    } else {
      for (const f of s.fields) SPECS.set(f.key, { kind: 'text' });
    }
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Returns a cleaned patch, or null if anything is unknown, mistyped, or oversized. */
export function sanitizePatch(input: unknown): Answers | null {
  if (!isPlainObject(input)) return null;
  if (JSON.stringify(input).length > MAX_PATCH_BYTES) return null;
  const out: Answers = {};
  for (const [key, value] of Object.entries(input)) {
    const spec = SPECS.get(key);
    if (!spec) return null;
    if (spec.kind === 'text') {
      if (typeof value !== 'string' || value.length > MAX_STRING) return null;
      out[key] = value.trim();
    } else if (spec.kind === 'none') {
      if (typeof value !== 'boolean') return null;
      out[key] = value;
    } else {
      if (!Array.isArray(value) || value.length > MAX_ENTRIES) return null;
      const entries: Record<string, string>[] = [];
      for (const entry of value) {
        if (!isPlainObject(entry)) return null;
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(entry)) {
          if (!spec.fields.has(k) || typeof v !== 'string' || v.length > MAX_STRING) return null;
          clean[k] = v.trim();
        }
        entries.push(clean);
      }
      out[key] = entries;
    }
  }
  return out;
}
```

`src/lib/form/display.ts`:
```ts
import type { Answers, Chapter, Field } from './types';
import { isFilled, isVisible } from './visibility';

export interface Row { label: string; value: string; missing: boolean }

function format(field: Field, raw: unknown): string {
  if (!isFilled(raw)) return '';
  const v = (raw as string).trim();
  if (field.type === 'yesno') return v === 'yes' ? 'Sí' : 'No';
  if (field.type === 'select') return field.options?.find((o) => o.value === v)?.label ?? v;
  return v;
}

export function chapterRows(chapter: Chapter, answers: Answers): Row[] {
  const rows: Row[] = [];
  for (const screen of chapter.screens) {
    if (!isVisible(screen.showIf, answers)) continue;
    if (screen.repeat) {
      const { key } = screen.repeat;
      const entries = Array.isArray(answers[key]) ? (answers[key] as Answers[]) : [];
      if (answers[`${key}__none`] === true) { rows.push({ label: screen.title, value: 'Ninguno', missing: false }); continue; }
      if (entries.length === 0) { rows.push({ label: screen.title, value: '', missing: true }); continue; }
      entries.forEach((entry, i) => {
        const value = screen.fields.filter((f) => isFilled(entry[f.key])).map((f) => `${f.label}: ${format(f, entry[f.key])}`).join(' · ');
        const missing = screen.fields.some((f) => f.required && !isFilled(entry[f.key]));
        rows.push({ label: `${screen.title} #${i + 1}`, value, missing });
      });
      continue;
    }
    for (const f of screen.fields) {
      if (!isVisible(f.showIf, answers)) continue;
      const value = format(f, answers[f.key]);
      rows.push({ label: f.label, value, missing: f.required && value === '' });
    }
  }
  return rows;
}

export function chapterAsText(chapter: Chapter, answers: Answers): string {
  return chapterRows(chapter, answers).map((r) => `${r.label}: ${r.value || '—'}`).join('\n');
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/form`
Expected: PASS (all form tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add validation, step navigation, patch sanitizer and data display"
```

---

### Task 4: Security primitives

**Files:**
- Create: `src/lib/security.ts`
- Test: `tests/lib/security.test.ts`

**Interfaces:**
- Produces: `hmac(value: string): string`, `generateAccessCode(): string`, `normalizeCode(input: string): string`, `hashAccessCode(applicationId: string, code: string): string`, `generateToken(): string`, `generateShortId(): string`, `safeEqual(a: string, b: string): boolean`, `hashPassword(password: string, salt?: string): string`, `verifyPassword(password: string, stored: string): boolean`, `signValue(payload: string): string`, `verifySigned(signed: string): string | null`.

- [ ] **Step 1: Write the failing tests** — `tests/lib/security.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  generateAccessCode, generateShortId, generateToken, hashAccessCode, hashPassword,
  normalizeCode, safeEqual, signValue, verifyPassword, verifySigned,
} from '@/lib/security';

describe('access codes', () => {
  it('generates 6-digit strings, keeping leading zeros', () => {
    for (let i = 0; i < 200; i++) expect(generateAccessCode()).toMatch(/^\d{6}$/);
  });
  it('normalizes spaces, dashes and other formatting', () => {
    expect(normalizeCode('004 217')).toBe('004217');
    expect(normalizeCode(' 004-217\n')).toBe('004217');
  });
  it('hashes per application and is deterministic', () => {
    expect(hashAccessCode('a', '123456')).toBe(hashAccessCode('a', '123456'));
    expect(hashAccessCode('a', '123456')).not.toBe(hashAccessCode('b', '123456'));
  });
});

describe('identifiers', () => {
  it('creates readable short ids and long tokens', () => {
    expect(generateShortId()).toMatch(/^VZ-[2-9A-HJKMNP-Z]{4}$/);
    expect(generateToken().length).toBeGreaterThanOrEqual(32);
    expect(generateToken()).not.toBe(generateToken());
  });
});

describe('passwords and signed values', () => {
  it('verifies passwords', () => {
    const stored = hashPassword('correct horse');
    expect(verifyPassword('correct horse', stored)).toBe(true);
    expect(verifyPassword('wrong', stored)).toBe(false);
    expect(verifyPassword('x', 'garbage')).toBe(false);
  });
  it('detects tampering of signed values', () => {
    const signed = signValue('mgr:123');
    expect(verifySigned(signed)).toBe('mgr:123');
    expect(verifySigned(signed.replace('mgr:123', 'mgr:999'))).toBeNull();
    expect(verifySigned('nodots')).toBeNull();
  });
  it('safeEqual handles different lengths', () => {
    expect(safeEqual('a', 'ab')).toBe(false);
    expect(safeEqual('ab', 'ab')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/lib/security.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/security.ts`:

```ts
import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';

function secret(): string {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) throw new Error('APP_SECRET must be set (32+ characters)');
  return s;
}

export const hmac = (value: string): string => createHmac('sha256', secret()).update(value).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const generateAccessCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const normalizeCode = (input: string): string => input.replace(/\D/g, '');
export const hashAccessCode = (applicationId: string, code: string): string => hmac(`code:${applicationId}:${code}`);
export const generateToken = (): string => randomBytes(24).toString('base64url');

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const generateShortId = (): string => `VZ-${Array.from({ length: 4 }, () => ALPHABET[randomInt(0, ALPHABET.length)]).join('')}`;

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  return safeEqual(scryptSync(password, salt, 64).toString('hex'), hash);
}

export const signValue = (payload: string): string => `${payload}.${hmac(payload)}`;

export function verifySigned(signed: string): string | null {
  const i = signed.lastIndexOf('.');
  if (i < 0) return null;
  const payload = signed.slice(0, i);
  return safeEqual(hmac(payload), signed.slice(i + 1)) ? payload : null;
}
```

- [ ] **Step 4: Password hash script** — `scripts/hash-password.mjs`:

```js
import { randomBytes, scryptSync } from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash-password -- "your password"');
  process.exit(1);
}
const salt = randomBytes(16).toString('hex');
console.log(`${salt}:${scryptSync(password, salt, 64).toString('hex')}`);
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/lib/security.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add hashing, code generation and signed-cookie primitives"
```

---

### Task 5: Database, migrations, repositories, rate limiting

**Files:**
- Create: `db/migrations/001_init.sql`, `scripts/migrate.mjs`, `src/lib/db.ts`, `src/lib/repo/applications.ts`, `src/lib/repo/sessions.ts`, `src/lib/repo/files.ts`, `src/lib/rate-limit.ts`
- Test: `tests/helpers/db.ts`, `tests/integration/repo.test.ts`

**Interfaces:**
- Consumes: `generateAccessCode`, `generateShortId`, `generateToken`, `hashAccessCode`, `hmac`; `MAX_ATTEMPTS`, `MAX_SESSIONS`, `retentionDays`.
- Produces (all async unless noted):
  - `sql()` → Neon query function (`src/lib/db.ts`).
  - `type Status = 'created'|'in_progress'|'submitted'|'reviewed'`; `interface Application { id; token; shortId; clientName; codeHash; status: Status; answers: Answers; failedAttempts: number; locked: boolean; managerNotes: string; createdAt; updatedAt: string; submittedAt: string|null; reviewedAt: string|null; expiresAt: string }`.
  - `createApplication({clientName, retentionDays?}): {application, code}`; `getByToken(token): Application|null`; `getById(id): Application|null`; `listApplications({q, status}): Application[]`; `saveAnswers(id, patch)`; `setInProgress(id)`; `submitApplication(id)`; `markReviewed(id)`; `recordFailedAttempt(id): {failedAttempts; locked}`; `resetAttempts(id)`; `regenerateCode(id): string`; `unlockApplication(id)`; `setNotes(id, notes)`; `extendExpiry(id, days)`; `deleteApplication(id)`; `listExpired(): Application[]` (`repo/applications.ts`).
  - `createSession(applicationId, userAgent): string`; `touchSession(applicationId, token): boolean`; `deleteSessions(applicationId)`; `sessionStats(applicationId): {count; lastSeenAt: string|null}` (`repo/sessions.ts`).
  - `interface FileRow {id; applicationId; kind; objectKey; mimeType; sizeBytes; uploadedAt}`; `addFile({applicationId, kind, objectKey, mimeType, sizeBytes}): string`; `listFiles(applicationId): FileRow[]`; `getFile(id): FileRow|null`; `deleteFileRow(id)`; `fileKeys(applicationId): string[]`; `allFileKinds(): Record<string,string[]>` (`repo/files.ts`).
  - `hit(key, limit, windowSeconds): boolean` — true while the caller is within the limit (`rate-limit.ts`).
  - Test helpers `describeDb`, `resetDb()` (`tests/helpers/db.ts`).

- [ ] **Step 1: Create the Neon test branch** — In the Neon console create a branch named `test`, copy its connection string into `.env.test` as `TEST_DATABASE_URL=...`. Put the main-branch string in `.env.local` as `DATABASE_URL=...`. (Manual step; both files are git-ignored.)

- [ ] **Step 2: Write migration** — `db/migrations/001_init.sql` (statements separated by `;` at line end):

```sql
create table if not exists applications (
  id uuid primary key,
  token text not null unique,
  short_id text not null unique,
  client_name text not null,
  code_hash text not null,
  status text not null default 'created' check (status in ('created','in_progress','submitted','reviewed')),
  answers jsonb not null default '{}'::jsonb,
  failed_attempts int not null default 0,
  locked boolean not null default false,
  manager_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  expires_at timestamptz not null
);
create table if not exists sessions (
  id uuid primary key,
  application_id uuid not null references applications(id) on delete cascade,
  token_hash text not null unique,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create table if not exists files (
  id uuid primary key,
  application_id uuid not null references applications(id) on delete cascade,
  kind text not null check (kind in ('passport','photo','national_id','previous_visa','employment_letter')),
  object_key text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_at timestamptz not null default now()
);
create table if not exists rate_limits (
  key text primary key,
  count int not null,
  window_start timestamptz not null
);
create index if not exists files_application_idx on files(application_id);
create index if not exists sessions_application_idx on sessions(application_id);
create index if not exists applications_expires_idx on applications(expires_at);
```

`scripts/migrate.mjs`:
```js
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (!url) throw new Error('DATABASE_URL (or TEST_DATABASE_URL) is not set');
const sql = neon(url);
const file = readFileSync(new URL('../db/migrations/001_init.sql', import.meta.url), 'utf8');
const statements = file.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
for (const statement of statements) await sql.query(statement);
console.log(`Applied ${statements.length} statements`);
```

For the test branch, `migrate:test` loads `.env.test`, which defines `TEST_DATABASE_URL` (the script falls back to it).

- [ ] **Step 3: Run the migration on both branches**

Run: `npm run migrate:test && npm run migrate`
Expected: `Applied 8 statements` twice. If `sql.query` is unavailable in the installed driver version, check the Neon serverless docs for the current method to run a raw SQL string and adapt the script.

- [ ] **Step 4: Write test helpers and failing test**

`tests/helpers/db.ts`:
```ts
import { beforeEach, describe } from 'vitest';
import { sql } from '@/lib/db';

export const describeDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

export function resetDb(): void {
  beforeEach(async () => {
    await sql()`truncate table rate_limits, files, sessions, applications`;
  });
}
```

`tests/integration/repo.test.ts`:
```ts
import { expect, it } from 'vitest';
import { hit } from '@/lib/rate-limit';
import { createApplication, getById, getByToken, recordFailedAttempt, saveAnswers, listApplications } from '@/lib/repo/applications';
import { addFile, allFileKinds, fileKeys } from '@/lib/repo/files';
import { createSession, sessionStats, touchSession } from '@/lib/repo/sessions';
import { describeDb, resetDb } from '../helpers/db';

describeDb('repositories', () => {
  resetDb();

  it('creates an application with hashed code, short id, token and expiry', async () => {
    const { application, code } = await createApplication({ clientName: 'Ana' });
    expect(code).toMatch(/^\d{6}$/);
    expect(application.codeHash).not.toContain(code);
    expect(application.shortId).toMatch(/^VZ-/);
    expect((await getByToken(application.token))!.id).toBe(application.id);
    expect(new Date(application.expiresAt).getTime()).toBeGreaterThan(Date.now() + 80 * 86_400_000);
  });

  it('merges answer patches without clobbering other keys, even concurrently', async () => {
    const { application } = await createApplication({ clientName: 'Ana' });
    await Promise.all([
      saveAnswers(application.id, { apellidos: 'Pérez' }),
      saveAnswers(application.id, { nombres: 'Ana' }),
    ]);
    const saved = (await getById(application.id))!;
    expect(saved.answers).toMatchObject({ apellidos: 'Pérez', nombres: 'Ana' });
  });

  it('counts failed attempts and locks at the limit', async () => {
    const { application } = await createApplication({ clientName: 'Ana' });
    let last = { failedAttempts: 0, locked: false };
    for (let i = 0; i < 5; i++) last = await recordFailedAttempt(application.id);
    expect(last).toEqual({ failedAttempts: 5, locked: true });
  });

  it('keeps only the 2 most recent sessions and touches by token', async () => {
    const { application } = await createApplication({ clientName: 'Ana' });
    const t1 = await createSession(application.id, 'a');
    const t2 = await createSession(application.id, 'b');
    const t3 = await createSession(application.id, 'c');
    expect(await touchSession(application.id, t1)).toBe(false);
    expect(await touchSession(application.id, t2)).toBe(true);
    expect(await touchSession(application.id, t3)).toBe(true);
    expect((await sessionStats(application.id)).count).toBe(2);
  });

  it('stores files and groups kinds by application', async () => {
    const { application } = await createApplication({ clientName: 'Ana' });
    await addFile({ applicationId: application.id, kind: 'passport', objectKey: `apps/${application.id}/passport/1.jpg`, mimeType: 'image/jpeg', sizeBytes: 10 });
    expect(await fileKeys(application.id)).toHaveLength(1);
    expect((await allFileKinds())[application.id]).toEqual(['passport']);
  });

  it('filters the list by name, short id and status', async () => {
    const a = await createApplication({ clientName: 'Ana Gómez' });
    await createApplication({ clientName: 'Luis Pérez' });
    expect((await listApplications({ q: 'gómez', status: '' })).map((x) => x.id)).toEqual([a.application.id]);
    expect((await listApplications({ q: a.application.shortId.toLowerCase(), status: '' })).length).toBe(1);
    expect(await listApplications({ q: '', status: 'submitted' })).toHaveLength(0);
  });

  it('rate limits within a window', async () => {
    expect(await hit('k', 2, 60)).toBe(true);
    expect(await hit('k', 2, 60)).toBe(true);
    expect(await hit('k', 2, 60)).toBe(false);
    expect(await hit('other', 2, 60)).toBe(true);
  });
});
```

- [ ] **Step 5: Run to verify failure**

Run: `npx vitest run tests/integration/repo.test.ts`
Expected: FAIL (modules missing). If `TEST_DATABASE_URL` is unset the suite is skipped — set it before continuing.

- [ ] **Step 6: Implement**

`src/lib/db.ts`:
```ts
import { neon } from '@neondatabase/serverless';

let client: ReturnType<typeof neon> | undefined;

export function sql() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    client = neon(url);
  }
  return client;
}
```

`src/lib/repo/applications.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { MAX_ATTEMPTS, retentionDays as defaultRetention } from '../constants';
import type { Answers } from '../form/types';
import { sql } from '../db';
import { generateAccessCode, generateShortId, generateToken, hashAccessCode } from '../security';

export type Status = 'created' | 'in_progress' | 'submitted' | 'reviewed';

export interface Application {
  id: string; token: string; shortId: string; clientName: string; codeHash: string; status: Status;
  answers: Answers; failedAttempts: number; locked: boolean; managerNotes: string;
  createdAt: string; updatedAt: string; submittedAt: string | null; reviewedAt: string | null; expiresAt: string;
}

const iso = (v: unknown): string => new Date(v as string).toISOString();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toApp(r: Record<string, any>): Application {
  return {
    id: r.id, token: r.token, shortId: r.short_id, clientName: r.client_name, codeHash: r.code_hash, status: r.status,
    answers: r.answers ?? {}, failedAttempts: r.failed_attempts, locked: r.locked, managerNotes: r.manager_notes,
    createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
    submittedAt: r.submitted_at ? iso(r.submitted_at) : null, reviewedAt: r.reviewed_at ? iso(r.reviewed_at) : null,
    expiresAt: iso(r.expires_at),
  };
}

export async function createApplication(input: { clientName: string; retentionDays?: number }): Promise<{ application: Application; code: string }> {
  const id = randomUUID();
  const code = generateAccessCode();
  const days = input.retentionDays ?? defaultRetention();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const rows = await sql()`
        insert into applications (id, token, short_id, client_name, code_hash, expires_at)
        values (${id}, ${generateToken()}, ${generateShortId()}, ${input.clientName}, ${hashAccessCode(id, code)}, now() + make_interval(days => ${days}::int))
        returning *`;
      return { application: toApp(rows[0]), code };
    } catch (e) {
      if ((e as { code?: string }).code !== '23505') throw e;
    }
  }
  throw new Error('Could not allocate a unique short id');
}

export async function getByToken(token: string): Promise<Application | null> {
  const rows = await sql()`select * from applications where token = ${token}`;
  return rows[0] ? toApp(rows[0]) : null;
}

export async function getById(id: string): Promise<Application | null> {
  const rows = await sql()`select * from applications where id = ${id}`;
  return rows[0] ? toApp(rows[0]) : null;
}

export async function listApplications(filter: { q: string; status: string }): Promise<Application[]> {
  const rows = await sql()`
    select * from applications
    where (${filter.q}::text = '' or client_name ilike '%' || ${filter.q}::text || '%' or short_id ilike '%' || ${filter.q}::text || '%')
      and (${filter.status}::text = '' or status = ${filter.status}::text)
    order by created_at desc`;
  return rows.map(toApp);
}

export async function saveAnswers(id: string, patch: Answers): Promise<void> {
  await sql()`update applications set answers = answers || ${JSON.stringify(patch)}::jsonb, updated_at = now() where id = ${id}`;
}

export async function setInProgress(id: string): Promise<void> {
  await sql()`update applications set status = 'in_progress', updated_at = now() where id = ${id} and status = 'created'`;
}

export async function submitApplication(id: string): Promise<void> {
  await sql()`update applications set status = 'submitted', submitted_at = now(), updated_at = now() where id = ${id}`;
}

export async function markReviewed(id: string): Promise<void> {
  await sql()`update applications set status = 'reviewed', reviewed_at = now(), updated_at = now() where id = ${id}`;
}

export async function recordFailedAttempt(id: string): Promise<{ failedAttempts: number; locked: boolean }> {
  const rows = await sql()`
    update applications set failed_attempts = failed_attempts + 1, locked = (failed_attempts + 1 >= ${MAX_ATTEMPTS}::int)
    where id = ${id} returning failed_attempts, locked`;
  return { failedAttempts: rows[0].failed_attempts as number, locked: rows[0].locked as boolean };
}

export async function resetAttempts(id: string): Promise<void> {
  await sql()`update applications set failed_attempts = 0 where id = ${id}`;
}

export async function regenerateCode(id: string): Promise<string> {
  const code = generateAccessCode();
  await sql()`update applications set code_hash = ${hashAccessCode(id, code)}, failed_attempts = 0, locked = false where id = ${id}`;
  await sql()`delete from sessions where application_id = ${id}`;
  return code;
}

export async function unlockApplication(id: string): Promise<void> {
  await sql()`update applications set failed_attempts = 0, locked = false where id = ${id}`;
}

export async function setNotes(id: string, notes: string): Promise<void> {
  await sql()`update applications set manager_notes = ${notes.slice(0, 5000)} where id = ${id}`;
}

export async function extendExpiry(id: string, days: number): Promise<void> {
  await sql()`update applications set expires_at = greatest(expires_at, now()) + make_interval(days => ${days}::int) where id = ${id}`;
}

export async function deleteApplication(id: string): Promise<void> {
  await sql()`delete from applications where id = ${id}`;
}

export async function listExpired(): Promise<Application[]> {
  const rows = await sql()`select * from applications where expires_at < now()`;
  return rows.map(toApp);
}
```

`src/lib/repo/sessions.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { MAX_SESSIONS } from '../constants';
import { sql } from '../db';
import { generateToken, hmac } from '../security';

export async function createSession(applicationId: string, userAgent: string): Promise<string> {
  const token = generateToken();
  await sql()`insert into sessions (id, application_id, token_hash, user_agent) values (${randomUUID()}, ${applicationId}, ${hmac(token)}, ${userAgent})`;
  await sql()`
    delete from sessions where application_id = ${applicationId} and id not in (
      select id from sessions where application_id = ${applicationId} order by last_seen_at desc, created_at desc limit ${MAX_SESSIONS}::int
    )`;
  return token;
}

export async function touchSession(applicationId: string, token: string): Promise<boolean> {
  const rows = await sql()`update sessions set last_seen_at = now() where application_id = ${applicationId} and token_hash = ${hmac(token)} returning id`;
  return rows.length > 0;
}

export async function deleteSessions(applicationId: string): Promise<void> {
  await sql()`delete from sessions where application_id = ${applicationId}`;
}

export async function sessionStats(applicationId: string): Promise<{ count: number; lastSeenAt: string | null }> {
  const rows = await sql()`select count(*)::int as n, max(last_seen_at) as last from sessions where application_id = ${applicationId}`;
  return { count: rows[0].n as number, lastSeenAt: rows[0].last ? new Date(rows[0].last as string).toISOString() : null };
}
```

`src/lib/repo/files.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { sql } from '../db';

export interface FileRow { id: string; applicationId: string; kind: string; objectKey: string; mimeType: string; sizeBytes: number; uploadedAt: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toFile = (r: Record<string, any>): FileRow => ({
  id: r.id, applicationId: r.application_id, kind: r.kind, objectKey: r.object_key, mimeType: r.mime_type,
  sizeBytes: Number(r.size_bytes), uploadedAt: new Date(r.uploaded_at).toISOString(),
});

export async function addFile(input: { applicationId: string; kind: string; objectKey: string; mimeType: string; sizeBytes: number }): Promise<string> {
  const id = randomUUID();
  await sql()`insert into files (id, application_id, kind, object_key, mime_type, size_bytes) values (${id}, ${input.applicationId}, ${input.kind}, ${input.objectKey}, ${input.mimeType}, ${input.sizeBytes})`;
  return id;
}

export async function listFiles(applicationId: string): Promise<FileRow[]> {
  return (await sql()`select * from files where application_id = ${applicationId} order by uploaded_at`).map(toFile);
}

export async function getFile(id: string): Promise<FileRow | null> {
  const rows = await sql()`select * from files where id = ${id}`;
  return rows[0] ? toFile(rows[0]) : null;
}

export async function deleteFileRow(id: string): Promise<void> {
  await sql()`delete from files where id = ${id}`;
}

export async function fileKeys(applicationId: string): Promise<string[]> {
  return (await sql()`select object_key from files where application_id = ${applicationId}`).map((r) => r.object_key as string);
}

/** Small-scale helper for the manager list: all (application, kind) pairs grouped by application. */
export async function allFileKinds(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const r of await sql()`select application_id, kind from files`) (out[r.application_id as string] ??= []).push(r.kind as string);
  return out;
}
```

`src/lib/rate-limit.ts`:
```ts
import { sql } from './db';

/** Returns true while the caller is still within `limit` hits per `windowSeconds`. */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const rows = await sql()`
    insert into rate_limits (key, count, window_start) values (${key}, 1, now())
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}::int) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}::int) then now() else rate_limits.window_start end
    returning count`;
  return (rows[0].count as number) <= limit;
}
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run tests/integration/repo.test.ts`
Expected: PASS (7 tests). If an array or `sql` call shape differs in the installed Neon driver version, fix it per the driver docs and re-run.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: add Neon schema, repositories and rate limiter"
```

---

### Task 6: Access service (codes, lockout, sessions)

**Files:**
- Create: `src/lib/access.ts`
- Test: `tests/integration/access.test.ts`

**Interfaces:**
- Consumes: repositories from Task 5, `normalizeCode`, `hashAccessCode`, `safeEqual`, `MAX_ATTEMPTS`.
- Produces:
  - `type AccessResult = {ok:true; sessionToken:string; application: Application} | {ok:false; reason:'not_found'|'expired'|'locked'|'invalid_code'; attemptsLeft?: number}`
  - `verifyAccess(token: string, rawCode: string, userAgent: string): Promise<AccessResult>`
  - `authenticate(app: Application, sessionToken: string | undefined): Promise<boolean>`

- [ ] **Step 1: Write the failing tests** — `tests/integration/access.test.ts`:

```ts
import { expect, it } from 'vitest';
import { authenticate, verifyAccess } from '@/lib/access';
import { createApplication, getById, regenerateCode } from '@/lib/repo/applications';
import { describeDb, resetDb } from '../helpers/db';

const wrongFor = (code: string) => (code === '000000' ? '111111' : '000000');

describeDb('access service', () => {
  resetDb();

  it('accepts the right code, opens a session and marks the application in progress', async () => {
    const { application, code } = await createApplication({ clientName: 'Ana' });
    const r = await verifyAccess(application.token, code, 'ua');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await authenticate(r.application, r.sessionToken)).toBe(true);
    expect((await getById(application.id))!.status).toBe('in_progress');
  });

  it('accepts codes typed with spaces or dashes, including leading zeros', async () => {
    const { application, code } = await createApplication({ clientName: 'Ana' });
    const formatted = `${code.slice(0, 3)} - ${code.slice(3)}`;
    expect((await verifyAccess(application.token, formatted, 'ua')).ok).toBe(true);
  });

  it('reports attempts left and locks after 5 failures, even for the right code', async () => {
    const { application, code } = await createApplication({ clientName: 'Ana' });
    const first = await verifyAccess(application.token, wrongFor(code), 'ua');
    expect(first).toEqual({ ok: false, reason: 'invalid_code', attemptsLeft: 4 });
    for (let i = 0; i < 4; i++) await verifyAccess(application.token, wrongFor(code), 'ua');
    expect(await verifyAccess(application.token, code, 'ua')).toEqual({ ok: false, reason: 'locked' });
  });

  it('a successful login resets the failed-attempt counter', async () => {
    const { application, code } = await createApplication({ clientName: 'Ana' });
    for (let i = 0; i < 3; i++) await verifyAccess(application.token, wrongFor(code), 'ua');
    await verifyAccess(application.token, code, 'ua');
    expect((await getById(application.id))!.failedAttempts).toBe(0);
  });

  it('allows at most 2 active sessions; the oldest is invalidated', async () => {
    const { application, code } = await createApplication({ clientName: 'Ana' });
    const tokens: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await verifyAccess(application.token, code, `ua${i}`);
      if (r.ok) tokens.push(r.sessionToken);
    }
    expect(await authenticate(application, tokens[0])).toBe(false);
    expect(await authenticate(application, tokens[1])).toBe(true);
    expect(await authenticate(application, tokens[2])).toBe(true);
  });

  it('regenerating the code invalidates sessions, unlocks, and rejects the old code', async () => {
    const { application, code } = await createApplication({ clientName: 'Ana' });
    const r = await verifyAccess(application.token, code, 'ua');
    for (let i = 0; i < 5; i++) await verifyAccess(application.token, wrongFor(code), 'ua');
    const newCode = await regenerateCode(application.id);
    const fresh = (await getById(application.id))!;
    if (r.ok) expect(await authenticate(fresh, r.sessionToken)).toBe(false);
    expect((await verifyAccess(application.token, code, 'ua')).ok).toBe(code === newCode);
    expect((await verifyAccess(application.token, newCode, 'ua')).ok).toBe(true);
  });

  it('rejects unknown tokens, expired applications and missing session tokens', async () => {
    expect(await verifyAccess('nope', '123456', 'ua')).toEqual({ ok: false, reason: 'not_found' });
    const { application, code } = await createApplication({ clientName: 'Old', retentionDays: -1 });
    expect(await verifyAccess(application.token, code, 'ua')).toEqual({ ok: false, reason: 'expired' });
    expect(await authenticate(application, undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/integration/access.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/access.ts`:

```ts
import { MAX_ATTEMPTS } from './constants';
import { getByToken, recordFailedAttempt, resetAttempts, setInProgress, type Application } from './repo/applications';
import { createSession, touchSession } from './repo/sessions';
import { hashAccessCode, normalizeCode, safeEqual } from './security';

export type AccessResult =
  | { ok: true; sessionToken: string; application: Application }
  | { ok: false; reason: 'not_found' | 'expired' | 'locked' | 'invalid_code'; attemptsLeft?: number };

const isExpired = (app: Application): boolean => new Date(app.expiresAt).getTime() < Date.now();

export async function verifyAccess(token: string, rawCode: string, userAgent: string): Promise<AccessResult> {
  const app = await getByToken(token);
  if (!app) return { ok: false, reason: 'not_found' };
  if (isExpired(app)) return { ok: false, reason: 'expired' };
  if (app.locked) return { ok: false, reason: 'locked' };

  const code = normalizeCode(rawCode);
  if (!safeEqual(hashAccessCode(app.id, code), app.codeHash)) {
    const r = await recordFailedAttempt(app.id);
    if (r.locked) return { ok: false, reason: 'locked' };
    return { ok: false, reason: 'invalid_code', attemptsLeft: MAX_ATTEMPTS - r.failedAttempts };
  }

  await resetAttempts(app.id);
  await setInProgress(app.id);
  const sessionToken = await createSession(app.id, userAgent.slice(0, 200));
  return { ok: true, sessionToken, application: app };
}

export async function authenticate(app: Application, sessionToken: string | undefined): Promise<boolean> {
  if (!sessionToken || app.locked || isExpired(app)) return false;
  return touchSession(app.id, sessionToken);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/integration/access.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add access-code verification with lockout and session cap"
```

---

### Task 7: File rules, R2 client, purge

**Files:**
- Create: `src/lib/files.ts`, `src/lib/r2.ts`, `src/lib/purge.ts`
- Test: `tests/lib/files.test.ts`, `tests/integration/purge.test.ts`

**Interfaces:**
- Consumes: `FILE_KINDS`, `FileKind`; `listExpired`, `deleteApplication`; `fileKeys`.
- Produces:
  - `MAX_FILE_BYTES = 8 * 1024 * 1024`; `validateUpload(kind: string, mime: string, size: number): null | 'invalid_kind' | 'invalid_type' | 'too_large' | 'empty'`; `buildObjectKey(applicationId: string, kind: FileKind, mime: string): string`; `ownsKey(applicationId: string, key: string): boolean` (`files.ts`).
  - `SIGNED_URL_TTL_SECONDS = 300`; `presignPut(key, contentType): Promise<string>`; `presignGet(key, filename?): Promise<string>`; `headObject(key): Promise<{size:number; contentType:string} | null>`; `deleteObjects(keys: string[]): Promise<void>` (`r2.ts`).
  - `purgeExpired(remove?: (keys: string[]) => Promise<void>): Promise<{purged:number; failed:number}>`; `deleteApplicationWithFiles(id: string, remove?): Promise<void>` (`purge.ts`).

- [ ] **Step 1: Write the failing tests**

`tests/lib/files.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MAX_FILE_BYTES, buildObjectKey, ownsKey, validateUpload } from '@/lib/files';

describe('validateUpload', () => {
  it('accepts allowed type/size combinations', () => {
    expect(validateUpload('passport', 'image/jpeg', 1000)).toBeNull();
    expect(validateUpload('national_id', 'application/pdf', 1000)).toBeNull();
  });
  it('rejects PDFs for the visa photo', () => {
    expect(validateUpload('photo', 'application/pdf', 1000)).toBe('invalid_type');
  });
  it('rejects unknown kinds, types, empty and oversized files', () => {
    expect(validateUpload('selfie', 'image/png', 10)).toBe('invalid_kind');
    expect(validateUpload('passport', 'image/gif', 10)).toBe('invalid_type');
    expect(validateUpload('passport', 'image/png', 0)).toBe('empty');
    expect(validateUpload('passport', 'image/png', MAX_FILE_BYTES + 1)).toBe('too_large');
  });
});

describe('object keys', () => {
  it('builds keys scoped to the application with the right extension', () => {
    const key = buildObjectKey('app-1', 'passport', 'image/jpeg');
    expect(key).toMatch(/^apps\/app-1\/passport\/[0-9a-f-]+\.jpg$/);
  });
  it('only owns keys under its own prefix and rejects traversal', () => {
    expect(ownsKey('app-1', 'apps/app-1/passport/x.jpg')).toBe(true);
    expect(ownsKey('app-1', 'apps/app-2/passport/x.jpg')).toBe(false);
    expect(ownsKey('app-1', 'apps/app-1/../app-2/x.jpg')).toBe(false);
    expect(ownsKey('app-1', 'apps/app-10/x.jpg')).toBe(false);
  });
});
```

`tests/integration/purge.test.ts`:
```ts
import { expect, it, vi } from 'vitest';
import { purgeExpired } from '@/lib/purge';
import { createApplication, getById } from '@/lib/repo/applications';
import { addFile } from '@/lib/repo/files';
import { describeDb, resetDb } from '../helpers/db';

describeDb('purgeExpired', () => {
  resetDb();

  it('deletes expired applications after removing their storage objects; keeps active ones', async () => {
    const old = await createApplication({ clientName: 'Old', retentionDays: -1 });
    const live = await createApplication({ clientName: 'Live' });
    await addFile({ applicationId: old.application.id, kind: 'passport', objectKey: `apps/${old.application.id}/passport/a.jpg`, mimeType: 'image/jpeg', sizeBytes: 5 });
    const remove = vi.fn().mockResolvedValue(undefined);
    expect(await purgeExpired(remove)).toEqual({ purged: 1, failed: 0 });
    expect(remove).toHaveBeenCalledWith([`apps/${old.application.id}/passport/a.jpg`]);
    expect(await getById(old.application.id)).toBeNull();
    expect(await getById(live.application.id)).not.toBeNull();
  });

  it('keeps the row when storage deletion fails, so it is retried next run', async () => {
    const old = await createApplication({ clientName: 'Old', retentionDays: -1 });
    await addFile({ applicationId: old.application.id, kind: 'photo', objectKey: `apps/${old.application.id}/photo/a.jpg`, mimeType: 'image/jpeg', sizeBytes: 5 });
    const remove = vi.fn().mockRejectedValue(new Error('r2 down'));
    expect(await purgeExpired(remove)).toEqual({ purged: 0, failed: 1 });
    expect(await getById(old.application.id)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/lib/files.test.ts tests/integration/purge.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`src/lib/files.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { FILE_KINDS, type FileKind } from './form/file-kinds';

export const MAX_FILE_BYTES = 8 * 1024 * 1024;

const IMAGES = ['image/jpeg', 'image/png'];
const ALLOWED: Record<FileKind, string[]> = {
  passport: [...IMAGES, 'application/pdf'],
  photo: IMAGES,
  national_id: [...IMAGES, 'application/pdf'],
  previous_visa: [...IMAGES, 'application/pdf'],
  employment_letter: [...IMAGES, 'application/pdf'],
};
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };

export function validateUpload(kind: string, mime: string, size: number): null | 'invalid_kind' | 'invalid_type' | 'too_large' | 'empty' {
  if (!(FILE_KINDS as readonly string[]).includes(kind)) return 'invalid_kind';
  if (!ALLOWED[kind as FileKind].includes(mime)) return 'invalid_type';
  if (!Number.isFinite(size) || size <= 0) return 'empty';
  if (size > MAX_FILE_BYTES) return 'too_large';
  return null;
}

export const buildObjectKey = (applicationId: string, kind: FileKind, mime: string): string =>
  `apps/${applicationId}/${kind}/${randomUUID()}.${EXT[mime]}`;

export const ownsKey = (applicationId: string, key: string): boolean =>
  key.startsWith(`apps/${applicationId}/`) && !key.includes('..');
```

`src/lib/r2.ts`:
```ts
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const SIGNED_URL_TTL_SECONDS = 300;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

let s3: S3Client | undefined;
function client(): S3Client {
  s3 ??= new S3Client({
    region: 'auto',
    endpoint: `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') },
    // Recent SDK versions add checksum headers by default, which break browser PUTs against R2 presigned URLs.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return s3;
}

export const presignPut = (key: string, contentType: string): Promise<string> =>
  getSignedUrl(client(), new PutObjectCommand({ Bucket: env('R2_BUCKET'), Key: key, ContentType: contentType }), { expiresIn: SIGNED_URL_TTL_SECONDS });

export const presignGet = (key: string, filename?: string): Promise<string> =>
  getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: env('R2_BUCKET'), Key: key, ResponseContentDisposition: filename ? `attachment; filename="${filename}"` : undefined }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );

export async function headObject(key: string): Promise<{ size: number; contentType: string } | null> {
  try {
    const r = await client().send(new HeadObjectCommand({ Bucket: env('R2_BUCKET'), Key: key }));
    return { size: r.ContentLength ?? 0, contentType: r.ContentType ?? '' };
  } catch {
    return null;
  }
}

export async function deleteObjects(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    const r = await client().send(new DeleteObjectsCommand({ Bucket: env('R2_BUCKET'), Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }));
    if (r.Errors?.length) throw new Error(`R2 failed to delete ${r.Errors.length} object(s)`);
  }
}
```

`src/lib/purge.ts`:
```ts
import { deleteObjects } from './r2';
import { deleteApplication, listExpired } from './repo/applications';
import { fileKeys } from './repo/files';

type Remove = (keys: string[]) => Promise<void>;

/** Removes storage objects first; the DB row is only deleted once storage is clean. */
export async function deleteApplicationWithFiles(id: string, remove: Remove = deleteObjects): Promise<void> {
  const keys = await fileKeys(id);
  if (keys.length > 0) await remove(keys);
  await deleteApplication(id);
}

export async function purgeExpired(remove: Remove = deleteObjects): Promise<{ purged: number; failed: number }> {
  let purged = 0;
  let failed = 0;
  for (const app of await listExpired()) {
    try {
      await deleteApplicationWithFiles(app.id, remove);
      purged++;
    } catch {
      failed++;
    }
  }
  return { purged, failed };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/lib/files.test.ts tests/integration/purge.test.ts && npm run typecheck`
Expected: PASS and no type errors (if `requestChecksumCalculation` is not a known option in the installed SDK, remove those two lines only if the installed version predates the checksum change; confirm in the AWS SDK changelog).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add file rules, R2 client and expiry purge"
```

---

### Task 8: Applicant API routes

**Files:**
- Create: `src/lib/http.ts`, `src/lib/applicant-session.ts`
- Create: `src/app/api/s/[token]/access/route.ts`, `.../state/route.ts`, `.../answers/route.ts`, `.../submit/route.ts`, `.../files/presign/route.ts`, `.../files/complete/route.ts`, `.../files/[id]/route.ts`

**Interfaces:**
- Consumes: `verifyAccess`, `authenticate`, repos, `sanitizePatch`, `computeProgress`, `validateUpload`, `buildObjectKey`, `ownsKey`, `presignPut`, `headObject`, `deleteObjects`, `hit`.
- Produces:
  - `json(data, status?)`, `clientIp(req)` (`http.ts`).
  - `cookieName(shortId)`, `requireApplicant(token): Promise<{application} | {response}>` (`applicant-session.ts`).
  - HTTP contract (JSON), all under `/api/s/[token]`:
    - `POST /access {code}` → 200 `{ok:true}` + session cookie; 401 `{reason:'invalid_code',attemptsLeft}`; 404 `not_found`; 410 `expired`; 423 `locked`; 429 `rate_limited`.
    - `GET /state` → 200 `{clientName, shortId, status, answers, files:[{id,kind}]}`; 401 when no valid session.
    - `PATCH /answers {patch}` → 200 `{ok:true}`; 400 on invalid patch.
    - `POST /submit` → 200 `{ok:true}`.
    - `POST /files/presign {kind,mimeType,size}` → 200 `{uploadUrl, objectKey}`; 400 `{error: code}`.
    - `POST /files/complete {kind,objectKey,mimeType}` → 200 `{id}`; 400/404 otherwise.
    - `DELETE /files/[id]` → 200 `{ok:true}`.

(Route handlers are covered by the service-layer tests in Tasks 3–7 and the end-to-end journey in Task 13; they contain no logic beyond wiring.)

- [ ] **Step 1: Shared helpers**

`src/lib/http.ts`:
```ts
import { NextResponse } from 'next/server';

export const json = (data: unknown, status = 200): NextResponse => NextResponse.json(data, { status });

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
```

`src/lib/applicant-session.ts`:
```ts
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { authenticate } from './access';
import { json } from './http';
import { getByToken, type Application } from './repo/applications';

export const cookieName = (shortId: string): string => `vs_${shortId}`;

export async function requireApplicant(token: string): Promise<{ application: Application } | { response: NextResponse }> {
  const application = await getByToken(token);
  if (!application) return { response: json({ error: 'not_found' }, 404) };
  const session = (await cookies()).get(cookieName(application.shortId))?.value;
  if (!(await authenticate(application, session))) return { response: json({ error: 'unauthorized' }, 401) };
  return { application };
}
```

- [ ] **Step 2: Access route** — `src/app/api/s/[token]/access/route.ts`:

```ts
import { verifyAccess } from '@/lib/access';
import { cookieName } from '@/lib/applicant-session';
import { clientIp, json } from '@/lib/http';
import { hit } from '@/lib/rate-limit';

type Ctx = { params: Promise<{ token: string }> };
const STATUS = { not_found: 404, expired: 410, locked: 423, invalid_code: 401 } as const;

export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  if (!(await hit(`access:${clientIp(req)}`, 30, 600))) return json({ reason: 'rate_limited' }, 429);
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === 'string' ? body.code : '';
  const result = await verifyAccess(token, code, req.headers.get('user-agent') ?? '');
  if (!result.ok) return json({ reason: result.reason, attemptsLeft: result.attemptsLeft }, STATUS[result.reason]);

  const res = json({ ok: true });
  res.cookies.set(cookieName(result.application.shortId), result.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(60, Math.floor((new Date(result.application.expiresAt).getTime() - Date.now()) / 1000)),
  });
  return res;
}
```

- [ ] **Step 3: State, answers, submit**

`src/app/api/s/[token]/state/route.ts`:
```ts
import { requireApplicant } from '@/lib/applicant-session';
import { json } from '@/lib/http';
import { getById } from '@/lib/repo/applications';
import { listFiles } from '@/lib/repo/files';

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const r = await requireApplicant((await params).token);
  if ('response' in r) return r.response;
  const app = (await getById(r.application.id))!;
  const files = await listFiles(app.id);
  return json({
    clientName: app.clientName,
    shortId: app.shortId,
    status: app.status,
    answers: app.answers,
    files: files.map((f) => ({ id: f.id, kind: f.kind })),
  });
}
```

`src/app/api/s/[token]/answers/route.ts`:
```ts
import { requireApplicant } from '@/lib/applicant-session';
import { sanitizePatch } from '@/lib/form/patch';
import { json } from '@/lib/http';
import { saveAnswers } from '@/lib/repo/applications';

type Ctx = { params: Promise<{ token: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const r = await requireApplicant((await params).token);
  if ('response' in r) return r.response;
  const body = (await req.json().catch(() => null)) as { patch?: unknown } | null;
  const patch = sanitizePatch(body?.patch);
  if (!patch) return json({ error: 'invalid_patch' }, 400);
  await saveAnswers(r.application.id, patch);
  return json({ ok: true });
}
```

`src/app/api/s/[token]/submit/route.ts`:
```ts
import { requireApplicant } from '@/lib/applicant-session';
import { json } from '@/lib/http';
import { submitApplication } from '@/lib/repo/applications';

type Ctx = { params: Promise<{ token: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const r = await requireApplicant((await params).token);
  if ('response' in r) return r.response;
  await submitApplication(r.application.id);
  return json({ ok: true });
}
```

- [ ] **Step 4: File routes**

`src/app/api/s/[token]/files/presign/route.ts`:
```ts
import { requireApplicant } from '@/lib/applicant-session';
import type { FileKind } from '@/lib/form/file-kinds';
import { buildObjectKey, validateUpload } from '@/lib/files';
import { json } from '@/lib/http';
import { presignPut } from '@/lib/r2';

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const r = await requireApplicant((await params).token);
  if ('response' in r) return r.response;
  const b = (await req.json().catch(() => null)) as { kind?: unknown; mimeType?: unknown; size?: unknown } | null;
  const kind = typeof b?.kind === 'string' ? b.kind : '';
  const mime = typeof b?.mimeType === 'string' ? b.mimeType : '';
  const size = typeof b?.size === 'number' ? b.size : 0;
  const error = validateUpload(kind, mime, size);
  if (error) return json({ error }, 400);
  const objectKey = buildObjectKey(r.application.id, kind as FileKind, mime);
  return json({ uploadUrl: await presignPut(objectKey, mime), objectKey });
}
```

`src/app/api/s/[token]/files/complete/route.ts`:
```ts
import { requireApplicant } from '@/lib/applicant-session';
import { MAX_FILE_BYTES, ownsKey, validateUpload } from '@/lib/files';
import { json } from '@/lib/http';
import { headObject } from '@/lib/r2';
import { addFile } from '@/lib/repo/files';

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const r = await requireApplicant((await params).token);
  if ('response' in r) return r.response;
  const b = (await req.json().catch(() => null)) as { kind?: unknown; objectKey?: unknown; mimeType?: unknown } | null;
  const kind = typeof b?.kind === 'string' ? b.kind : '';
  const objectKey = typeof b?.objectKey === 'string' ? b.objectKey : '';
  const mime = typeof b?.mimeType === 'string' ? b.mimeType : '';
  if (!ownsKey(r.application.id, objectKey) || !objectKey.startsWith(`apps/${r.application.id}/${kind}/`)) return json({ error: 'invalid_key' }, 400);
  const head = await headObject(objectKey);
  if (!head) return json({ error: 'not_uploaded' }, 404);
  const error = validateUpload(kind, mime, head.size);
  if (error || head.size > MAX_FILE_BYTES) return json({ error: error ?? 'too_large' }, 400);
  const id = await addFile({ applicationId: r.application.id, kind, objectKey, mimeType: mime, sizeBytes: head.size });
  return json({ id });
}
```

`src/app/api/s/[token]/files/[id]/route.ts`:
```ts
import { requireApplicant } from '@/lib/applicant-session';
import { json } from '@/lib/http';
import { deleteObjects } from '@/lib/r2';
import { deleteFileRow, getFile } from '@/lib/repo/files';

type Ctx = { params: Promise<{ token: string; id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const { token, id } = await params;
  const r = await requireApplicant(token);
  if ('response' in r) return r.response;
  const file = await getFile(id);
  if (!file || file.applicationId !== r.application.id) return json({ error: 'not_found' }, 404);
  await deleteObjects([file.objectKey]);
  await deleteFileRow(file.id);
  return json({ ok: true });
}
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run build`
Expected: success; the seven `/api/s/[token]/...` routes appear in the build output.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add applicant API routes for access, answers and files"
```

---

### Task 9: Manager auth, API, routing

**Files:**
- Create: `src/lib/manager-auth.ts`, `src/middleware.ts`
- Create: `src/app/api/manager/login/route.ts`, `logout/route.ts`, `applications/route.ts`, `applications/[id]/route.ts`, `files/[id]/route.ts`
- Test: `tests/lib/manager-auth.test.ts`

**Interfaces:**
- Consumes: `verifyPassword`, `signValue`, `verifySigned`, `hit`, repos, `deleteApplicationWithFiles`, `presignGet`.
- Produces:
  - `MANAGER_COOKIE`, `createManagerCookieValue(now?: number): string`, `verifyManagerCookieValue(value: string | undefined, now?: number): boolean`, `isManager(): Promise<boolean>`, `requireManagerApi(): Promise<NextResponse | null>` (`manager-auth.ts`).
  - HTTP contract under `/api/manager`:
    - `POST /login {password}` → 200 + cookie; 401; 429.
    - `POST /logout` → 200, clears cookie.
    - `POST /applications {clientName}` → 200 `{id, shortId, link, code}`.
    - `PATCH /applications/[id] {action, days?, notes?}` with `action ∈ regenerate_code | unlock | extend | notes | reviewed` → 200 (`regenerate_code` returns `{code}`).
    - `DELETE /applications/[id]` → 200.
    - `GET /files/[id]` → 302 redirect to a signed URL.
  - Middleware: the internal `/manager/**` path returns 404; the public path is `/${NEXT_PUBLIC_MANAGER_PATH}` (rewritten in `next.config.ts`).

- [ ] **Step 1: Write the failing test** — `tests/lib/manager-auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createManagerCookieValue, verifyManagerCookieValue } from '@/lib/manager-auth';

describe('manager cookie', () => {
  it('verifies a fresh value and rejects expired, tampered, and empty values', () => {
    const now = 1_000_000;
    const v = createManagerCookieValue(now);
    expect(verifyManagerCookieValue(v, now + 1000)).toBe(true);
    expect(verifyManagerCookieValue(v, now + 13 * 3600_000)).toBe(false);
    expect(verifyManagerCookieValue(v.replace('mgr:', 'mgr:9'), now)).toBe(false);
    expect(verifyManagerCookieValue(undefined, now)).toBe(false);
    expect(verifyManagerCookieValue('mgr:99999999999999.bad', now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/lib/manager-auth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement manager auth** — `src/lib/manager-auth.ts`:

```ts
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { json } from './http';
import { signValue, verifySigned } from './security';

export const MANAGER_COOKIE = 'mgr_session';
const TTL_MS = 12 * 3600_000;

export const createManagerCookieValue = (now = Date.now()): string => signValue(`mgr:${now + TTL_MS}`);

export function verifyManagerCookieValue(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const payload = verifySigned(value);
  if (!payload?.startsWith('mgr:')) return false;
  return Number(payload.slice(4)) > now;
}

export async function isManager(): Promise<boolean> {
  return verifyManagerCookieValue((await cookies()).get(MANAGER_COOKIE)?.value);
}

export async function requireManagerApi(): Promise<NextResponse | null> {
  return (await isManager()) ? null : json({ error: 'unauthorized' }, 401);
}
```

- [ ] **Step 4: Middleware** — `src/middleware.ts`:

```ts
import { NextResponse } from 'next/server';

// The manager UI lives internally under /manager and is only reachable through the
// rewritten public path (NEXT_PUBLIC_MANAGER_PATH). Direct hits to /manager are 404.
export function middleware() {
  return new NextResponse(null, { status: 404 });
}

export const config = { matcher: ['/manager', '/manager/:path*'] };
```

- [ ] **Step 5: Manager API routes**

`src/app/api/manager/login/route.ts`:
```ts
import { clientIp, json } from '@/lib/http';
import { MANAGER_COOKIE, createManagerCookieValue } from '@/lib/manager-auth';
import { hit } from '@/lib/rate-limit';
import { verifyPassword } from '@/lib/security';

export async function POST(req: Request) {
  if (!(await hit(`login:${clientIp(req)}`, 5, 900))) return json({ error: 'rate_limited' }, 429);
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const stored = process.env.MANAGER_PASSWORD_HASH ?? '';
  if (typeof body?.password !== 'string' || !verifyPassword(body.password, stored)) return json({ error: 'invalid_credentials' }, 401);
  const res = json({ ok: true });
  res.cookies.set(MANAGER_COOKIE, createManagerCookieValue(), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 12 * 3600,
  });
  return res;
}
```

`src/app/api/manager/logout/route.ts`:
```ts
import { json } from '@/lib/http';
import { MANAGER_COOKIE } from '@/lib/manager-auth';

export async function POST() {
  const res = json({ ok: true });
  res.cookies.set(MANAGER_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
```

`src/app/api/manager/applications/route.ts`:
```ts
import { json } from '@/lib/http';
import { requireManagerApi } from '@/lib/manager-auth';
import { createApplication } from '@/lib/repo/applications';

export async function POST(req: Request) {
  const denied = await requireManagerApi();
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { clientName?: unknown } | null;
  const clientName = typeof body?.clientName === 'string' ? body.clientName.trim().slice(0, 120) : '';
  if (!clientName) return json({ error: 'name_required' }, 400);
  const { application, code } = await createApplication({ clientName });
  const origin = process.env.APP_URL ?? new URL(req.url).origin;
  return json({ id: application.id, shortId: application.shortId, link: `${origin}/s/${application.token}`, code });
}
```

`src/app/api/manager/applications/[id]/route.ts`:
```ts
import { json } from '@/lib/http';
import { requireManagerApi } from '@/lib/manager-auth';
import { deleteApplicationWithFiles } from '@/lib/purge';
import { extendExpiry, markReviewed, regenerateCode, setNotes, unlockApplication } from '@/lib/repo/applications';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await requireManagerApi();
  if (denied) return denied;
  const { id } = await params;
  const b = (await req.json().catch(() => null)) as { action?: unknown; days?: unknown; notes?: unknown } | null;
  switch (b?.action) {
    case 'regenerate_code': return json({ code: await regenerateCode(id) });
    case 'unlock': await unlockApplication(id); return json({ ok: true });
    case 'reviewed': await markReviewed(id); return json({ ok: true });
    case 'extend': {
      const days = typeof b.days === 'number' && b.days > 0 && b.days <= 365 ? Math.floor(b.days) : 30;
      await extendExpiry(id, days);
      return json({ ok: true });
    }
    case 'notes': await setNotes(id, typeof b.notes === 'string' ? b.notes : ''); return json({ ok: true });
    default: return json({ error: 'invalid_action' }, 400);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireManagerApi();
  if (denied) return denied;
  await deleteApplicationWithFiles((await params).id);
  return json({ ok: true });
}
```

`src/app/api/manager/files/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { json } from '@/lib/http';
import { requireManagerApi } from '@/lib/manager-auth';
import { presignGet } from '@/lib/r2';
import { getFile } from '@/lib/repo/files';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const denied = await requireManagerApi();
  if (denied) return denied;
  const file = await getFile((await params).id);
  if (!file) return json({ error: 'not_found' }, 404);
  return NextResponse.redirect(await presignGet(file.objectKey), 302);
}
```

- [ ] **Step 6: Run tests and verify routing**

Run: `npx vitest run tests/lib/manager-auth.test.ts && npm run typecheck`
Expected: PASS, no type errors. (The middleware/rewrite behavior is verified end-to-end in Task 13: `/manager` → 404 and `/gestor` → login page.)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add manager auth, API routes and obscured routing"
```

---

### Task 10: Applicant UI — access gate and question wizard

**Files:**
- Create: `src/lib/client/api.ts`, `src/app/s/[token]/page.tsx`
- Create: `src/components/applicant/{Notice,ApplicantApp,CodeGate,ProgressBar,FieldInput,ScreenView,RepeatView,Wizard}.tsx`

**Interfaces:**
- Consumes: schema/steps/progress/validate libs, API contract from Task 8.
- Produces:
  - `interface ApplicantState {clientName; shortId; status; answers: Answers; files: {id; kind}[]}`; `fetchState(token): Promise<ApplicantState | null>` (null = unauthorized); `saveAnswers(token, patch): Promise<boolean>`; `submit(token): Promise<boolean>` (`client/api.ts`).
  - `<Wizard token initial />` renders steps via `data-step` attribute on `<main>` with values `chapter|screen|files|review` (used by e2e). Files and review steps are wired in Task 11 (placeholders render until then).
  - Button labels (used by e2e): chapter intro `Empezar`; screen `Siguiente`, skip `Saltar por ahora`, back `Atrás`; repeat none toggle `Ninguno / No aplica`.

- [ ] **Step 1: Client API** — `src/lib/client/api.ts`:

```ts
import type { Answers } from '../form/types';

export interface ApplicantState {
  clientName: string;
  shortId: string;
  status: 'created' | 'in_progress' | 'submitted' | 'reviewed';
  answers: Answers;
  files: { id: string; kind: string }[];
}

const base = (token: string) => `/api/s/${token}`;
const headers = { 'content-type': 'application/json' };

export async function fetchState(token: string): Promise<ApplicantState | null> {
  const r = await fetch(`${base(token)}/state`, { cache: 'no-store' });
  if (r.status === 401) return null;
  if (!r.ok) throw new Error('state');
  return r.json();
}

export async function saveAnswers(token: string, patch: Answers): Promise<boolean> {
  try {
    const r = await fetch(`${base(token)}/answers`, { method: 'PATCH', headers, body: JSON.stringify({ patch }) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function submit(token: string): Promise<boolean> {
  try {
    return (await fetch(`${base(token)}/submit`, { method: 'POST' })).ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Server page and notices**

`src/components/applicant/Notice.tsx`:
```tsx
export function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="shell">
      <div className="notice" role="status">
        <h1>{title}</h1>
        {children && <p className="muted">{children}</p>}
      </div>
    </main>
  );
}
```

`src/app/s/[token]/page.tsx`:
```tsx
import { ApplicantApp } from '@/components/applicant/ApplicantApp';
import { Notice } from '@/components/applicant/Notice';
import { getByToken } from '@/lib/repo/applications';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const app = await getByToken((await params).token);
  if (!app) return <Notice title="Enlace no válido">Revisa el enlace que te envió tu gestor.</Notice>;
  if (new Date(app.expiresAt) < new Date()) return <Notice title="Este enlace venció">Comunícate con tu gestor para pedir uno nuevo.</Notice>;
  if (app.locked) return <Notice title="Acceso bloqueado">Por seguridad bloqueamos el acceso tras varios intentos. Escríbele a tu gestor para que lo desbloquee.</Notice>;
  return <ApplicantApp token={(await params).token} clientName={app.clientName} />;
}
```

- [ ] **Step 3: App shell and code gate**

`src/components/applicant/ApplicantApp.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { fetchState, type ApplicantState } from '@/lib/client/api';
import { CodeGate } from './CodeGate';
import { Wizard } from './Wizard';

type Phase = { kind: 'loading' } | { kind: 'gate' } | { kind: 'ready'; state: ApplicantState } | { kind: 'error' };

export function ApplicantApp({ token, clientName }: { token: string; clientName: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  async function load() {
    try {
      const state = await fetchState(token);
      setPhase(state ? { kind: 'ready', state } : { kind: 'gate' });
    } catch {
      setPhase({ kind: 'error' });
    }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase.kind === 'loading') return <main className="shell"><p className="muted">Cargando…</p></main>;
  if (phase.kind === 'error') return <main className="shell"><div className="notice"><h1>No pudimos cargar</h1><button className="btn btn-primary" onClick={load}>Reintentar</button></div></main>;
  if (phase.kind === 'gate') return <CodeGate token={token} clientName={clientName} onSuccess={load} />;
  return <Wizard token={token} initial={phase.state} />;
}
```

`src/components/applicant/CodeGate.tsx`:
```tsx
'use client';
import { useState, type FormEvent } from 'react';

const MESSAGES: Record<string, string> = {
  invalid_code: 'Código incorrecto.',
  locked: 'Acceso bloqueado. Escríbele a tu gestor para que lo desbloquee.',
  expired: 'Este enlace venció. Pide uno nuevo a tu gestor.',
  rate_limited: 'Demasiados intentos. Espera unos minutos.',
  not_found: 'Enlace no válido.',
};

export function CodeGate({ token, clientName, onSuccess }: { token: string; clientName: string; onSuccess: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/s/${token}/access`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
      if (r.ok) return onSuccess();
      const body = (await r.json().catch(() => ({}))) as { reason?: string; attemptsLeft?: number };
      const base = MESSAGES[body.reason ?? ''] ?? 'No pudimos validar el código.';
      setError(body.reason === 'invalid_code' && body.attemptsLeft !== undefined ? `${base} Te quedan ${body.attemptsLeft} intentos.` : base);
    } catch {
      setError('Sin conexión. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <form className="card" onSubmit={submit}>
        <p className="eyebrow">Solicitud de visa</p>
        <h1>Hola, {clientName.split(' ')[0]}</h1>
        <p className="muted">Escribe el código de 6 dígitos que te entregó tu gestor.</p>
        <div className="field">
          <label htmlFor="code">Código de acceso</label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={9} value={code} onChange={(e) => setCode(e.target.value)} aria-invalid={!!error} />
          {error && <span className="error" role="alert">{error}</span>}
        </div>
        <button className="btn btn-primary" disabled={busy || code.replace(/\D/g, '').length !== 6}>Entrar</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Field, progress, screens**

`src/components/applicant/ProgressBar.tsx`:
```tsx
export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div>
      <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Avance del formulario">
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="eyebrow" style={{ margin: '6px 0 0' }}>{percent}% completado</p>
    </div>
  );
}
```

`src/components/applicant/FieldInput.tsx`:
```tsx
import type { Field } from '@/lib/form/types';

interface Props { field: Field; value: string; error?: string; onChange: (v: string) => void }

export function FieldInput({ field, value, error, onChange }: Props) {
  const id = `f-${field.key}`;
  const common = { id, value, 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-err` : undefined };
  const err = error && <span id={`${id}-err`} className="error" role="alert">{error}</span>;
  const label = <>{field.label}{!field.required && <span className="muted"> (opcional)</span>}</>;
  const meta = { 'data-field': field.key, 'data-type': field.type };

  if (field.type === 'yesno') {
    return (
      <fieldset className="field" {...meta}>
        <legend>{label}</legend>
        <div className="choices" role="radiogroup">
          {([['yes', 'Sí'], ['no', 'No']] as const).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={value === v} className={`choice${value === v ? ' on' : ''}`} onClick={() => onChange(v)}>{l}</button>
          ))}
        </div>
        {err}
      </fieldset>
    );
  }
  if (field.type === 'select') {
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <select {...common} {...meta} onChange={(e) => onChange(e.target.value)}>
          <option value="">Selecciona…</option>
          {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {err}
      </div>
    );
  }
  if (field.type === 'textarea') {
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <textarea {...common} {...meta} onChange={(e) => onChange(e.target.value)} />
        {err}
      </div>
    );
  }
  const input = {
    text: { type: 'text' }, tel: { type: 'tel', inputMode: 'tel' as const }, email: { type: 'email', inputMode: 'email' as const, autoComplete: 'email' },
    date: { type: 'date' }, number: { type: 'text', inputMode: 'decimal' as const },
  }[field.type];
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input {...common} {...meta} {...input} onChange={(e) => onChange(e.target.value)} />
      {err}
    </div>
  );
}
```

`src/components/applicant/ScreenView.tsx`:
```tsx
'use client';
import { useState, type FormEvent } from 'react';
import type { Answers, Screen } from '@/lib/form/types';
import { validateFields } from '@/lib/form/validate';
import { isVisible } from '@/lib/form/visibility';
import { FieldInput } from './FieldInput';

interface Props {
  screen: Screen;
  answers: Answers;
  persist: (patch: Answers) => Promise<boolean>;
  next: () => void;
  back: () => void;
  saving: boolean;
}

export function ScreenView({ screen, answers, persist, next, back, saving }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(screen.fields.map((f) => [f.key, typeof answers[f.key] === 'string' ? (answers[f.key] as string) : ''])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fields = screen.fields.filter((f) => isVisible(f.showIf, { ...answers, ...values }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validateFields(fields, values, answers);
    setErrors(errs);
    if (Object.keys(errs).length === 0 && (await persist(values))) next();
  }
  async function skip() {
    if (await persist(values)) next();
  }

  return (
    <form onSubmit={onSubmit} className="step" noValidate>
      <h1>{screen.title}</h1>
      {fields.map((f) => (
        <FieldInput key={f.key} field={f} value={values[f.key] ?? ''} error={errors[f.key]} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
      ))}
      <div className="actions">
        <button className="btn btn-primary" disabled={saving}>Siguiente</button>
        <button type="button" className="btn btn-ghost" onClick={skip} disabled={saving}>Saltar por ahora</button>
        <button type="button" className="btn btn-ghost" onClick={back}>Atrás</button>
      </div>
    </form>
  );
}
```

`src/components/applicant/RepeatView.tsx`:
```tsx
'use client';
import { useState, type FormEvent } from 'react';
import type { Answers, Screen } from '@/lib/form/types';
import { validateFields } from '@/lib/form/validate';
import { FieldInput } from './FieldInput';

type Entry = Record<string, string>;
interface Props { screen: Screen; answers: Answers; persist: (patch: Answers) => Promise<boolean>; next: () => void; back: () => void; saving: boolean }

export function RepeatView({ screen, answers, persist, next, back, saving }: Props) {
  const { key, addLabel } = screen.repeat!;
  const [none, setNone] = useState(answers[`${key}__none`] === true);
  const [entries, setEntries] = useState<Entry[]>(() => (Array.isArray(answers[key]) && (answers[key] as Entry[]).length ? (answers[key] as Entry[]) : [{}]));
  const [errors, setErrors] = useState<Record<string, string>[]>([]);

  const setValue = (i: number, k: string, v: string) => setEntries((list) => list.map((e, j) => (j === i ? { ...e, [k]: v } : e)));
  const save = () => persist({ [key]: none ? [] : entries.filter((e) => Object.values(e).some((v) => v?.trim())), [`${key}__none`]: none });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!none) {
      const errs = entries.map((entry) => validateFields(screen.fields, entry, {}));
      setErrors(errs);
      if (errs.some((x) => Object.keys(x).length > 0)) return;
    }
    if (await save()) next();
  }

  return (
    <form onSubmit={onSubmit} className="step" noValidate>
      <h1>{screen.title}</h1>
      <div className="field">
        <button type="button" role="checkbox" aria-checked={none} className={`choice${none ? ' on' : ''}`} onClick={() => setNone((n) => !n)}>Ninguno / No aplica</button>
      </div>
      {!none && entries.map((entry, i) => (
        <div className="card" key={i} style={{ marginBottom: 16 }}>
          <p className="eyebrow">Registro {i + 1}</p>
          {screen.fields.map((f) => (
            <FieldInput key={f.key} field={f} value={entry[f.key] ?? ''} error={errors[i]?.[f.key]} onChange={(v) => setValue(i, f.key, v)} />
          ))}
          {entries.length > 1 && <button type="button" className="btn btn-ghost" onClick={() => setEntries((l) => l.filter((_, j) => j !== i))}>Quitar</button>}
        </div>
      ))}
      {!none && entries.length < 20 && <button type="button" className="btn btn-ghost" onClick={() => setEntries((l) => [...l, {}])}>{addLabel}</button>}
      <div className="actions">
        <button className="btn btn-primary" disabled={saving}>Siguiente</button>
        <button type="button" className="btn btn-ghost" onClick={async () => { if (await save()) next(); }} disabled={saving}>Saltar por ahora</button>
        <button type="button" className="btn btn-ghost" onClick={back}>Atrás</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Wizard** — `src/components/applicant/Wizard.tsx` (files/review steps are filled in by Task 11; until then they render a short placeholder):

```tsx
'use client';
import { useMemo, useState } from 'react';
import { saveAnswers, type ApplicantState } from '@/lib/client/api';
import { computeProgress } from '@/lib/form/progress';
import { buildSteps, firstIncompleteStep } from '@/lib/form/steps';
import type { Answers } from '@/lib/form/types';
import { ProgressBar } from './ProgressBar';
import { RepeatView } from './RepeatView';
import { ScreenView } from './ScreenView';

export function Wizard({ token, initial }: { token: string; initial: ApplicantState }) {
  const [answers, setAnswers] = useState<Answers>(initial.answers);
  const [files, setFiles] = useState(initial.files);
  const steps = useMemo(() => buildSteps(answers), [answers]);
  const done = initial.status === 'submitted' || initial.status === 'reviewed';
  const [index, setIndex] = useState(() => {
    const s = buildSteps(initial.answers);
    return done ? s.length - 1 : firstIncompleteStep(s, initial.answers);
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const step = steps[Math.min(index, steps.length - 1)];
  const progress = useMemo(() => computeProgress(answers, files.map((f) => f.kind)), [answers, files]);
  const next = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setIndex((i) => Math.max(i - 1, 0));

  async function persist(patch: Answers): Promise<boolean> {
    setSaving(true);
    setSaveError(false);
    const ok = await saveAnswers(token, patch);
    setSaving(false);
    if (ok) setAnswers((a) => ({ ...a, ...patch }));
    else setSaveError(true);
    return ok;
  }

  return (
    <div className="shell">
      <ProgressBar percent={progress.percent} />
      {saveError && <div className="notice" role="alert">No pudimos guardar. Revisa tu conexión e inténtalo de nuevo.</div>}
      <main className="step" data-step={step.kind} key={`${step.kind}-${index}`}>
        {step.kind === 'chapter' && (
          <>
            <p className="eyebrow">Sección</p>
            <h1>{step.chapter.title}</h1>
            <p className="muted">Tus respuestas se guardan automáticamente.</p>
            <div className="actions">
              <button className="btn btn-primary" onClick={next}>Empezar</button>
              {index > 0 && <button className="btn btn-ghost" onClick={back}>Atrás</button>}
            </div>
          </>
        )}
        {step.kind === 'screen' && (step.screen.repeat
          ? <RepeatView screen={step.screen} answers={answers} persist={persist} next={next} back={back} saving={saving} />
          : <ScreenView screen={step.screen} answers={answers} persist={persist} next={next} back={back} saving={saving} />)}
        {step.kind === 'files' && <p>Archivos (Task 11)</p>}
        {step.kind === 'review' && <p>Revisión (Task 11)</p>}
      </main>
    </div>
  );
}
```
(`setFiles` and `token` are used in Task 11; leave them declared so the next task only adds components.)

- [ ] **Step 6: Verify manually**

Run: `npm run dev`; create an application directly in Neon (`insert` via the console is cumbersome) — instead defer the full manual check to Task 13, and here run only:
`npm run typecheck && npm run build`
Expected: success; `/s/[token]` listed as dynamic.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add applicant access gate and one-screen-at-a-time wizard"
```

---

### Task 11: Applicant UI — files and review/submit

**Files:**
- Create: `src/lib/client/upload.ts`, `src/components/applicant/FileStep.tsx`, `src/components/applicant/Review.tsx`
- Modify: `src/components/applicant/Wizard.tsx` (replace the two placeholders)
- Test: `tests/lib/upload.test.ts`

**Interfaces:**
- Consumes: `FILE_KINDS`, `FILE_LABELS`, `REQUIRED_FILE_KINDS`, `computeProgress`, `submit`, API from Task 8.
- Produces:
  - `withRetry<T>(fn, attempts?, delayMs?): Promise<T>`; `compressImage(file: File, maxSide?, quality?): Promise<Blob>`; `uploadFile(token, kind, file): Promise<{id: string}>` (`client/upload.ts`).
  - `<FileStep token files onFilesChange next back />` with file inputs carrying `data-testid="file-input-<kind>"` (`FileStep.tsx`).
  - `<Review token answers files goToChapter back onSubmitted />` (`Review.tsx`).
  - Labels used by e2e: `Continuar a revisión`, `Enviar solicitud`.

- [ ] **Step 1: Write the failing test** — `tests/lib/upload.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { withRetry } from '@/lib/client/upload';

describe('withRetry', () => {
  it('returns on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    expect(await withRetry(fn, 3, 0)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('retries failures and then succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('x')).mockResolvedValue('ok');
    expect(await withRetry(fn, 3, 0)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });
  it('throws the last error after exhausting attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(withRetry(fn, 2, 0)).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/lib/upload.test.ts`
Expected: FAIL.

- [ ] **Step 3: Upload helpers** — `src/lib/client/upload.ts`:

```ts
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 800): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw last;
}

/** Downscales large photos before upload; falls back to the original if the browser can't decode it. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', quality));
  } catch {
    return file;
  }
}

export async function uploadFile(token: string, kind: string, file: File): Promise<{ id: string }> {
  const blob = await compressImage(file);
  const mimeType = blob.type || file.type;
  const json = { 'content-type': 'application/json' };

  const presign = await withRetry(async () => {
    const r = await fetch(`/api/s/${token}/files/presign`, { method: 'POST', headers: json, body: JSON.stringify({ kind, mimeType, size: blob.size }) });
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'presign');
    return (await r.json()) as { uploadUrl: string; objectKey: string };
  });
  await withRetry(async () => {
    const r = await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'content-type': mimeType }, body: blob });
    if (!r.ok) throw new Error('upload');
  });
  return withRetry(async () => {
    const r = await fetch(`/api/s/${token}/files/complete`, { method: 'POST', headers: json, body: JSON.stringify({ kind, objectKey: presign.objectKey, mimeType }) });
    if (!r.ok) throw new Error('complete');
    return (await r.json()) as { id: string };
  });
}
```

- [ ] **Step 4: FileStep** — `src/components/applicant/FileStep.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { uploadFile } from '@/lib/client/upload';
import { FILE_KINDS, FILE_LABELS, REQUIRED_FILE_KINDS, type FileKind } from '@/lib/form/file-kinds';

interface Props {
  token: string;
  files: { id: string; kind: string }[];
  onFilesChange: (files: { id: string; kind: string }[]) => void;
  next: () => void;
  back: () => void;
}

export function FileStep({ token, files, onFilesChange, next, back }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function add(kind: FileKind, file: File | undefined) {
    if (!file) return;
    setBusy(kind);
    setErrors((e) => ({ ...e, [kind]: '' }));
    try {
      const { id } = await uploadFile(token, kind, file);
      onFilesChange([...files, { id, kind }]);
    } catch (e) {
      const code = (e as Error).message;
      setErrors((x) => ({ ...x, [kind]: code === 'invalid_type' ? 'Formato no admitido. Usa JPG, PNG o PDF.' : code === 'too_large' ? 'El archivo pesa demasiado (máximo 8 MB).' : 'No se pudo subir. Revisa tu conexión e inténtalo de nuevo.' }));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    const r = await fetch(`/api/s/${token}/files/${id}`, { method: 'DELETE' });
    if (r.ok) onFilesChange(files.filter((f) => f.id !== id));
  }

  return (
    <div className="step">
      <h1>Sube tus documentos</h1>
      <p className="muted">Puedes tomar la foto con la cámara o elegir un archivo.</p>
      {FILE_KINDS.map((kind) => {
        const mine = files.filter((f) => f.kind === kind);
        const imagesOnly = kind === 'photo';
        return (
          <div className="card" key={kind} style={{ marginBottom: 16 }} data-file-kind={kind}>
            <h2>{FILE_LABELS[kind]}</h2>
            <p className="eyebrow">{REQUIRED_FILE_KINDS.includes(kind) ? 'Obligatorio' : 'Opcional'}</p>
            {mine.map((f, i) => (
              <p key={f.id}>✓ Archivo {i + 1} subido <button type="button" className="btn btn-ghost" style={{ minHeight: 40 }} onClick={() => remove(f.id)}>Quitar</button></p>
            ))}
            {busy === kind && <p role="status">Subiendo…</p>}
            {errors[kind] && <p className="error" role="alert" style={{ color: 'var(--danger)' }}>{errors[kind]}</p>}
            <div style={{ display: 'grid', gap: 8 }}>
              <label className="btn btn-ghost">
                Tomar foto
                <input className="sr-only" type="file" accept="image/*" capture="environment" disabled={busy !== null} onChange={(e) => { void add(kind, e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              <label className="btn btn-ghost">
                Elegir archivo
                <input className="sr-only" data-testid={`file-input-${kind}`} type="file" accept={imagesOnly ? 'image/*' : 'image/*,application/pdf'} disabled={busy !== null} onChange={(e) => { void add(kind, e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            </div>
          </div>
        );
      })}
      <div className="actions">
        <button className="btn btn-primary" onClick={next} disabled={busy !== null}>Continuar a revisión</button>
        <button className="btn btn-ghost" onClick={back}>Atrás</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Review** — `src/components/applicant/Review.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { submit } from '@/lib/client/api';
import { computeProgress } from '@/lib/form/progress';
import type { Answers } from '@/lib/form/types';

interface Props {
  token: string;
  shortId: string;
  answers: Answers;
  files: { kind: string }[];
  goToChapter: (chapterId: string) => void;
  back: () => void;
}

export function Review({ token, shortId, answers, files, goToChapter, back }: Props) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const progress = computeProgress(answers, files.map((f) => f.kind));

  async function send() {
    setState('sending');
    setState((await submit(token)) ? 'done' : 'error');
  }

  if (state === 'done') {
    return (
      <div className="notice" data-testid="submitted">
        <h1>¡Listo! Recibimos tu información</h1>
        <p className="muted">Tu gestor la revisará. Si falta algo, te lo hará saber. Tu ID es <strong>{shortId}</strong>.</p>
      </div>
    );
  }

  return (
    <div className="step">
      <h1>Revisión final</h1>
      <p className="muted">Avance total: {progress.percent}%. Puedes enviar aunque falten datos; tu gestor te los pedirá.</p>
      {progress.chapters.map((c) => (
        <div className="card" key={c.id} style={{ marginBottom: 12 }}>
          <h2>{c.title}</h2>
          <p className="eyebrow">{c.missing.length === 0 ? '✓ Completa' : `⚠ Faltan ${c.missing.length}`}</p>
          {c.missing.length > 0 && <ul className="muted">{c.missing.slice(0, 6).map((m) => <li key={m}>{m}</li>)}{c.missing.length > 6 && <li>…y {c.missing.length - 6} más</li>}</ul>}
          {c.id !== 'files' && <button className="btn btn-ghost" onClick={() => goToChapter(c.id)}>Editar</button>}
        </div>
      ))}
      {state === 'error' && <p role="alert" style={{ color: 'var(--danger)' }}>No pudimos enviar. Inténtalo de nuevo.</p>}
      <div className="actions">
        <button className="btn btn-primary" onClick={send} disabled={state === 'sending'}>Enviar solicitud</button>
        <button className="btn btn-ghost" onClick={back}>Atrás</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire into the Wizard** — in `src/components/applicant/Wizard.tsx` add imports `import { FileStep } from './FileStep';` and `import { Review } from './Review';`, add

```tsx
  const goToChapter = (chapterId: string) => {
    const i = steps.findIndex((s) => s.kind === 'chapter' && s.chapter.id === chapterId);
    if (i >= 0) setIndex(i);
  };
```
and replace the two placeholder lines with:

```tsx
        {step.kind === 'files' && <FileStep token={token} files={files} onFilesChange={setFiles} next={next} back={back} />}
        {step.kind === 'review' && <Review token={token} shortId={initial.shortId} answers={answers} files={files} goToChapter={goToChapter} back={back} />}
```

- [ ] **Step 7: Run tests and build**

Run: `npx vitest run tests/lib/upload.test.ts && npm run typecheck && npm run build`
Expected: PASS and successful build.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: add file upload step and final review with submit"
```

---

### Task 12: Manager UI

**Files:**
- Create: `src/app/manager/layout.tsx`, `src/app/manager/login/page.tsx`, `src/app/manager/page.tsx`, `src/app/manager/[id]/page.tsx`
- Create: `src/components/manager/{LoginForm,NewApplication,CopyButton,DetailActions}.tsx`

**Interfaces:**
- Consumes: `isManager`, `mp`, repos, `computeProgress`, `chapterRows`, `chapterAsText`, `CHAPTERS`, `FILE_LABELS`, manager API from Task 9.
- Produces UI (e2e selectors): login inputs labeled `Contraseña` and button `Entrar`; create form input labeled `Nombre del cliente` and button `Crear solicitud`; result elements `data-testid="new-link"` and `data-testid="new-code"`; detail page element `data-testid="progress-percent"`; list items link to `mp('/<id>')` with the client name as text.

- [ ] **Step 1: Layout and login**

`src/app/manager/layout.tsx`:
```tsx
export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return <div className="shell wide">{children}</div>;
}
```

`src/components/manager/LoginForm.tsx`:
```tsx
'use client';
import { useState, type FormEvent } from 'react';
import { mp } from '@/lib/paths';

export function LoginForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await fetch('/api/manager/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    if (r.ok) { window.location.href = mp(); return; }
    setError(r.status === 429 ? 'Demasiados intentos. Espera unos minutos.' : 'Contraseña incorrecta.');
    setBusy(false);
  }

  return (
    <form className="card" onSubmit={submit} style={{ maxWidth: 420, margin: '10vh auto 0' }}>
      <h1>Panel del gestor</h1>
      <div className="field">
        <label htmlFor="pw">Contraseña</label>
        <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <span className="error" role="alert">{error}</span>}
      </div>
      <button className="btn btn-primary" disabled={busy || !password}>Entrar</button>
    </form>
  );
}
```

`src/app/manager/login/page.tsx`:
```tsx
import { LoginForm } from '@/components/manager/LoginForm';

export default function Page() {
  return <LoginForm />;
}
```

- [ ] **Step 2: List page, create form, copy button**

`src/components/manager/CopyButton.tsx`:
```tsx
'use client';
import { useState } from 'react';

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="btn btn-ghost" style={{ minHeight: 40 }} onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
      {copied ? '¡Copiado!' : label}
    </button>
  );
}
```

`src/components/manager/NewApplication.tsx`:
```tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CopyButton } from './CopyButton';

interface Created { shortId: string; link: string; code: string }

export function NewApplication() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await fetch('/api/manager/applications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientName: name }) });
    setBusy(false);
    if (!r.ok) return setError('No se pudo crear la solicitud.');
    setCreated(await r.json());
    setName('');
    router.refresh();
  }

  const whatsapp = created ? `https://wa.me/?text=${encodeURIComponent(`Hola, este es tu enlace para completar tu información de visa: ${created.link}\nTe envío el código de acceso por separado.`)}` : '';

  return (
    <section className="card">
      <h2>Nueva solicitud</h2>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="client-name">Nombre del cliente</label>
          <input id="client-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {error && <span className="error" role="alert">{error}</span>}
        <button className="btn btn-primary" disabled={busy || !name.trim()}>Crear solicitud</button>
      </form>
      {created && (
        <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
          <p className="eyebrow">ID {created.shortId}</p>
          <p>Enlace: <code data-testid="new-link" style={{ wordBreak: 'break-all' }}>{created.link}</code></p>
          <p>Código de acceso: <strong data-testid="new-code" style={{ fontSize: 24, letterSpacing: 4 }}>{created.code}</strong></p>
          <p className="muted">El código se muestra una sola vez. Entrégalo por un canal distinto al del enlace.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <CopyButton text={created.link} label="Copiar enlace" />
            <CopyButton text={created.code} label="Copiar código" />
            <a className="btn btn-ghost" style={{ minHeight: 40 }} href={whatsapp} target="_blank" rel="noreferrer">Compartir por WhatsApp</a>
          </div>
        </div>
      )}
    </section>
  );
}
```

`src/app/manager/page.tsx`:
```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NewApplication } from '@/components/manager/NewApplication';
import { computeProgress } from '@/lib/form/progress';
import { isManager } from '@/lib/manager-auth';
import { mp } from '@/lib/paths';
import { listApplications } from '@/lib/repo/applications';
import { allFileKinds } from '@/lib/repo/files';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = { created: 'Creada', in_progress: 'En progreso', submitted: 'Enviada', reviewed: 'Revisada' } as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  if (!(await isManager())) redirect(mp('/login'));
  const { q = '', status = '' } = await searchParams;
  const [apps, kinds] = await Promise.all([listApplications({ q, status }), allFileKinds()]);

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Solicitudes</h1>
      </header>
      <NewApplication />
      <form method="get" className="card" style={{ display: 'grid', gap: 8 }}>
        <div className="field" style={{ margin: 0 }}><label htmlFor="q">Buscar por nombre o ID</label><input id="q" name="q" defaultValue={q} /></div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="status">Estado</label>
          <select id="status" name="status" defaultValue={status}>
            <option value="">Todos</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <button className="btn btn-ghost">Filtrar</button>
      </form>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
        {apps.map((a) => {
          const p = computeProgress(a.answers, kinds[a.id] ?? []);
          const days = Math.ceil((new Date(a.expiresAt).getTime() - Date.now()) / 86_400_000);
          return (
            <li key={a.id} className="card">
              <Link href={mp(`/${a.id}`)} style={{ textDecoration: 'none' }}><h2 style={{ margin: 0 }}>{a.clientName}</h2></Link>
              <p className="eyebrow">{a.shortId} · <span className="pill">{STATUS_LABEL[a.status]}</span>{a.locked && <> · <span className="pill">Bloqueada</span></>}</p>
              <div className="progress" role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`Avance de ${a.clientName}`}><span style={{ width: `${p.percent}%` }} /></div>
              <p className="muted" style={{ margin: '6px 0 0' }}>{p.percent}% · vence en {days} días</p>
            </li>
          );
        })}
        {apps.length === 0 && <li className="muted">No hay solicitudes.</li>}
      </ul>
    </>
  );
}
```

- [ ] **Step 3: Detail page and actions**

`src/components/manager/DetailActions.tsx`:
```tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { mp } from '@/lib/paths';
import { CopyButton } from './CopyButton';

interface Props { id: string; locked: boolean; status: string; initialNotes: string }

export function DetailActions({ id, locked, status, initialNotes }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [newCode, setNewCode] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function act(body: Record<string, unknown>) {
    const r = await fetch(`/api/manager/applications/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) { const data = await r.json(); if (data.code) setNewCode(data.code); router.refresh(); }
  }
  async function remove() {
    const r = await fetch(`/api/manager/applications/${id}`, { method: 'DELETE' });
    if (r.ok) window.location.href = mp();
  }

  return (
    <section className="card" style={{ display: 'grid', gap: 12 }}>
      <h2>Acciones</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {locked && <button className="btn btn-ghost" onClick={() => act({ action: 'unlock' })}>Desbloquear</button>}
        <button className="btn btn-ghost" onClick={() => act({ action: 'regenerate_code' })}>Regenerar código</button>
        <button className="btn btn-ghost" onClick={() => act({ action: 'extend', days: 30 })}>Extender 30 días</button>
        {status !== 'reviewed' && <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => act({ action: 'reviewed' })}>Marcar como revisada</button>}
      </div>
      {newCode && <p>Nuevo código: <strong data-testid="regenerated-code" style={{ fontSize: 24, letterSpacing: 4 }}>{newCode}</strong> <CopyButton text={newCode} label="Copiar" /></p>}
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="notes">Notas internas (el cliente no las ve)</label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button className="btn btn-ghost" onClick={() => act({ action: 'notes', notes })}>Guardar notas</button>
      {confirmDelete
        ? <button className="btn btn-ghost" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={remove}>Confirmar: borrar datos y archivos</button>
        : <button className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>Borrar solicitud</button>}
    </section>
  );
}
```

`src/app/manager/[id]/page.tsx`:
```tsx
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CopyButton } from '@/components/manager/CopyButton';
import { DetailActions } from '@/components/manager/DetailActions';
import { chapterAsText, chapterRows } from '@/lib/form/display';
import { FILE_LABELS, type FileKind } from '@/lib/form/file-kinds';
import { computeProgress } from '@/lib/form/progress';
import { CHAPTERS } from '@/lib/form/schema';
import { isManager } from '@/lib/manager-auth';
import { mp } from '@/lib/paths';
import { getById } from '@/lib/repo/applications';
import { listFiles } from '@/lib/repo/files';
import { sessionStats } from '@/lib/repo/sessions';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isManager())) redirect(mp('/login'));
  const { id } = await params;
  const app = await getById(id);
  if (!app) notFound();
  const [files, stats] = await Promise.all([listFiles(id), sessionStats(id)]);
  const progress = computeProgress(app.answers, files.map((f) => f.kind));
  const chapterStatus = new Map(progress.chapters.map((c) => [c.id, c]));

  return (
    <>
      <Link href={mp()}>← Solicitudes</Link>
      <header>
        <p className="eyebrow">{app.shortId} · {app.status}</p>
        <h1>{app.clientName}</h1>
        <div className="progress" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress.percent}%` }} /></div>
        <p className="muted"><span data-testid="progress-percent">{progress.percent}%</span> completado · {stats.count} sesión(es) activa(s){stats.lastSeenAt && ` · último acceso ${new Date(stats.lastSeenAt).toLocaleString('es-CO')}`}</p>
      </header>

      {CHAPTERS.map((ch) => {
        const cp = chapterStatus.get(ch.id)!;
        return (
          <section className="card" key={ch.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>{ch.title} <span className="pill">{cp.missing.length === 0 ? '✓ Completa' : `⚠ Faltan ${cp.missing.length}`}</span></h2>
              <CopyButton text={chapterAsText(ch, app.answers)} label="Copiar datos" />
            </div>
            <dl style={{ margin: '12px 0 0' }}>
              {chapterRows(ch, app.answers).map((r, i) => (
                <div key={i} style={{ padding: '6px 0', borderTop: '1px solid var(--ash)' }}>
                  <dt className="muted" style={{ fontSize: 14 }}>{r.label}</dt>
                  <dd style={{ margin: 0, background: r.missing ? 'var(--lime)' : undefined, borderRadius: 8, padding: r.missing ? '0 8px' : 0 }}>{r.value || (r.missing ? 'Falta' : '—')}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}

      <section className="card">
        <h2>Archivos <span className="pill">{chapterStatus.get('files')!.missing.length === 0 ? '✓ Completos' : `⚠ Faltan ${chapterStatus.get('files')!.missing.length}`}</span></h2>
        <ul>
          {files.map((f) => <li key={f.id}><a href={`/api/manager/files/${f.id}`} target="_blank" rel="noreferrer">{FILE_LABELS[f.kind as FileKind]} ({f.mimeType.split('/')[1]}, {Math.round(f.sizeBytes / 1024)} KB)</a></li>)}
          {files.length === 0 && <li className="muted">Sin archivos.</li>}
        </ul>
      </section>

      <DetailActions id={app.id} locked={app.locked} status={app.status} initialNotes={app.managerNotes} />
    </>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run build`
Expected: success. Then a manual smoke test: set `MANAGER_PASSWORD_HASH` (from `npm run hash-password -- "test1234"`) and `APP_SECRET` in `.env.local`, run `npm run dev`, open `http://localhost:3000/gestor`, expect the login page; open `http://localhost:3000/manager`, expect 404.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add manager panel with list, creation, detail and actions"
```

---

### Task 13: Cron, deployment docs, end-to-end journey

**Files:**
- Create: `src/app/api/cron/purge/route.ts`, `vercel.json`, `docs/SETUP.md`, `playwright.config.ts`, `e2e/journey.spec.ts`

**Interfaces:**
- Consumes: `purgeExpired`; all UI selectors from Tasks 10–12.
- Produces: `GET /api/cron/purge` (Bearer `CRON_SECRET`) → `{purged, failed}`.

- [ ] **Step 1: Cron route and schedule**

`src/app/api/cron/purge/route.ts`:
```ts
import { json } from '@/lib/http';
import { purgeExpired } from '@/lib/purge';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);
  return json(await purgeExpired());
}
```

`vercel.json`:
```json
{ "crons": [{ "path": "/api/cron/purge", "schedule": "0 7 * * *" }] }
```

- [ ] **Step 2: Setup document** — `docs/SETUP.md`:

````markdown
# Setup

## 1. Neon (database)
1. Create a free project at neon.com. Create a branch `test` for automated tests.
2. Put the main connection string in `.env.local` (`DATABASE_URL`) and the test branch in `.env.test` (`TEST_DATABASE_URL`).
3. `npm run migrate && npm run migrate:test`

## 2. Cloudflare R2 (files)
1. Create a Cloudflare account, then Dashboard → Storage & databases → R2 → enable the R2 subscription (follow the checkout; check whether a payment method is requested).
2. Create a **private** bucket (do not enable public access). Put its name in `R2_BUCKET`.
3. Copy the Account ID into `R2_ACCOUNT_ID`.
4. R2 → Manage API tokens → create a token with Object Read & Write scoped to that bucket → `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
5. Bucket → Settings → CORS policy (browsers upload directly with PUT):
```json
[{ "AllowedOrigins": ["http://localhost:3000", "https://YOUR-DOMAIN"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
```
Confirm the current CORS format in the Cloudflare R2 docs if the dashboard rejects it.

## 3. Secrets
- `APP_SECRET`: `openssl rand -base64 48`
- `MANAGER_PASSWORD_HASH`: `npm run hash-password -- "your password"`
- `CRON_SECRET`: any long random string
- `APP_URL`: public URL (used to build applicant links)
- `NEXT_PUBLIC_MANAGER_PATH`: defaults to `gestor`; changing it requires a rebuild.
- `RETENTION_DAYS`: 90 (or 60)

## 4. Vercel
Import the repo, add every variable from `.env.example` in Project Settings → Environment Variables, deploy. `vercel.json` schedules the daily purge; Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set.

## 5. Checks
- `npm test` (set `TEST_DATABASE_URL` to include integration tests)
- `npm run e2e` (needs `.env.local` with working Neon + R2 dev credentials and `E2E_MANAGER_PASSWORD` equal to the password hashed above)
````

- [ ] **Step 3: Playwright config** — `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', ...devices['Pixel 7'] },
  webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
});
```

- [ ] **Step 4: Write the end-to-end journey** — `e2e/journey.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';

const MP = process.env.NEXT_PUBLIC_MANAGER_PATH ?? 'gestor';
const PASSWORD = process.env.E2E_MANAGER_PASSWORD ?? '';

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function managerLogin(page: Page) {
  await page.goto(`/${MP}/login`);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Solicitudes' })).toBeVisible();
}

async function createApplication(page: Page, name: string) {
  await page.getByLabel('Nombre del cliente').fill(name);
  await page.getByRole('button', { name: 'Crear solicitud' }).click();
  const link = (await page.getByTestId('new-link').textContent())!;
  const code = (await page.getByTestId('new-code').textContent())!;
  return { link, code };
}

async function fillVisibleFields(page: Page) {
  for (let pass = 0; pass < 3; pass++) {
    for (const el of await page.locator('[data-field]').all()) {
      const type = await el.getAttribute('data-type');
      const key = (await el.getAttribute('data-field'))!;
      if (type === 'yesno') {
        if ((await el.getByRole('radio', { checked: true }).count()) === 0) await el.getByRole('radio', { name: 'No' }).click();
      } else if (type === 'select') {
        if (!(await el.inputValue())) await el.selectOption({ index: 1 });
      } else if (!(await el.inputValue())) {
        const value = type === 'date' ? (key.includes('caducidad') || key === 'fin' || key === 'hasta' ? '2032-01-01' : '2020-01-01')
          : type === 'email' ? 'a@b.co' : type === 'tel' ? '3001234567' : type === 'number' ? '1000' : 'Prueba';
        await el.fill(value);
      }
    }
  }
}

test('full applicant journey is visible to the manager at 100%', async ({ page }) => {
  test.skip(!PASSWORD, 'Set E2E_MANAGER_PASSWORD');
  await managerLogin(page);
  const { link, code } = await createApplication(page, 'Cliente E2E');

  await page.goto(link);
  await page.getByLabel('Código de acceso').fill(code);
  await page.getByRole('button', { name: 'Entrar' }).click();

  for (let guard = 0; guard < 120; guard++) {
    const kind = await page.locator('main[data-step]').getAttribute('data-step');
    if (kind === 'chapter') await page.getByRole('button', { name: 'Empezar' }).click();
    else if (kind === 'screen') {
      if ((await page.getByRole('checkbox', { name: 'Ninguno / No aplica' }).count()) > 0) await page.getByRole('checkbox', { name: 'Ninguno / No aplica' }).click();
      else await fillVisibleFields(page);
      await page.getByRole('button', { name: 'Siguiente' }).click();
    } else if (kind === 'files') {
      for (const k of ['passport', 'photo', 'national_id']) {
        await page.getByTestId(`file-input-${k}`).setInputFiles({ name: `${k}.png`, mimeType: 'image/png', buffer: PNG });
        await expect(page.locator(`[data-file-kind="${k}"]`).getByText('Archivo 1 subido')).toBeVisible({ timeout: 30_000 });
      }
      await page.getByRole('button', { name: 'Continuar a revisión' }).click();
    } else if (kind === 'review') break;
    await page.waitForTimeout(150);
  }

  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page.getByTestId('submitted')).toBeVisible();

  await page.goto(`/${MP}`);
  await page.getByRole('link', { name: 'Cliente E2E' }).click();
  await expect(page.getByTestId('progress-percent')).toHaveText('100%');
});

test('five wrong codes lock the application and the manager can unlock it', async ({ page }) => {
  test.skip(!PASSWORD, 'Set E2E_MANAGER_PASSWORD');
  await managerLogin(page);
  const { link, code } = await createApplication(page, 'Cliente Bloqueo');
  const wrong = code === '000000' ? '111111' : '000000';

  await page.goto(link);
  for (let i = 0; i < 5; i++) {
    await page.getByLabel('Código de acceso').fill(wrong);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForTimeout(300);
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Acceso bloqueado' })).toBeVisible();

  await page.goto(`/${MP}`);
  await page.getByRole('link', { name: 'Cliente Bloqueo' }).click();
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await page.goto(link);
  await expect(page.getByLabel('Código de acceso')).toBeVisible();
});

test('manager routing hides the internal path and requires login', async ({ page, request }) => {
  expect((await request.get('/manager')).status()).toBe(404);
  await page.goto(`/${MP}`);
  await expect(page).toHaveURL(new RegExp(`/${MP}/login`));
});
```

- [ ] **Step 5: Run the full suite**

Run: `npm test && npm run typecheck && npm run build`
Expected: all unit and integration tests PASS, build succeeds.

Run (with `.env.local` populated incl. R2 dev bucket + CORS, `E2E_MANAGER_PASSWORD` set): `npm run e2e`
Expected: 3 tests PASS. If the journey fails on a specific screen, the assertion message names the `data-step`; fix the filler or the screen and re-run.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add expiry cron, setup guide and end-to-end journey"
```

---

## Self-Review

**Spec coverage**
- Stack/routes/data model (spec §2): Tasks 1, 5, 8, 9.
- Access flow with code, lockout, 2 sessions, regenerate (spec §3 Access): Tasks 4, 6, 8, 12.
- Typeform-style one-screen flow, chapters, conditionals, repeat loops, auto-save, skip, review, minimal validation (spec §3 Form): Tasks 2, 3, 10, 11.
- Files: camera, compression, direct signed upload, type/size limits (spec §3 Files): Tasks 7, 8, 11.
- Manager panel: auth, list with progress/expiry/filters, create with WhatsApp share, detail with per-chapter status, file gallery, copy data, notes, unlock/regenerate/extend/delete, statuses (spec §4): Tasks 9, 12.
- Progress calculation (spec §5): Task 2.
- Security: signed URLs, hashed codes, rate limits, no PII logs, retention purge, noindex (spec §6): Tasks 1, 4, 5, 7, 8, 9, 13. (No application code logs personal data.)
- Error handling (spec §7): retry in Task 11, purge keeps row on R2 failure in Task 7, friendly expired/locked screens in Task 10, idempotent merge saves in Task 5.
- Testing strategy (spec §8): unit (Tasks 2–4, 7, 9, 11), integration (Tasks 5–7), e2e mobile (Task 13).
- Visual design (spec §9): tokens in Task 1, components in Tasks 10–12.
- Spec §11 open items: verification notes are embedded in Task 5 (Neon driver), Task 7 (SDK checksum option), Task 13 (R2 CORS/payment); per-field required/optional flags are encoded in `schema.ts` and are a review point for the manager.

**Known gaps to decide during execution**
- Applicant "Saltar por ahora" saves typed values but never validates; submission with missing data is intended.
- The manager list recomputes progress per request from all answers (fine at this scale).

**Type consistency check:** `Application`, `AccessResult`, `Step`, `Progress`, `FileKind`, `Row` names and signatures match across Tasks 2–12; `requireApplicant` returns `{application} | {response}` and every route narrows with `'response' in r`; `cookieName` is used only in Task 8; `hit` returns `Promise<boolean>` in both consumers.
