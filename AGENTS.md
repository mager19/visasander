# AGENTS.md

Shared instructions for any AI coding agent working in this repository. Keep this file as the single source of truth; tool-specific files (e.g. `CLAUDE.md`) should only import it.

## Project

Visa intake app for a US-visa preparation consultant (not affiliated with the embassy). Applicants fill in DS-160 data and upload documents from their phones; the manager reviews completeness in a private panel.

Full design: `docs/superpowers/specs/2026-09-30-visa-intake-design.md` (read it before changing behavior).
Question source: `Ds- 160.docx`. Visual reference: `DESIGN (1).md`.

## Stack

- Next.js (App Router) on Vercel
- Neon (serverless Postgres), answers stored as JSONB
- Cloudflare R2 (private bucket, signed URLs) for files
- Tests: unit + integration, Playwright end-to-end in a mobile viewport

## Routes

- `/s/[token]` — applicant flow (access code + session cookie)
- `/gestor` — manager panel (single password). Path comes from an env var.

## Non-negotiable rules

- Mobile first. Design and test at phone width before desktop.
- Data is highly sensitive (passports, IDs, family data). Never log personal data, never expose files publicly, never commit secrets. All file access goes through short-lived signed URLs.
- Access codes and session tokens are stored hashed. Enforce attempt limits and the 2-session cap.
- Retention: applications expire (default 90 days, configurable) and a scheduled job deletes rows and R2 objects.
- Do not use Supabase. The database must not require manual reactivation.
- Saves must be idempotent. Nothing the applicant typed may be lost on a failed upload or reload.
- Progress % comes from one versioned list of required fields; do not duplicate that logic.
- YAGNI: v1 has no notifications, no multi-manager accounts, no payments (see the spec's future options).

## Conventions

- Code, identifiers, comments, UI copy keys, tests, and docs: English. User-facing form text is Spanish (Colombia-neutral).
- Follow the design tokens in `DESIGN (1).md`: lime `#beff50`, ink `#14140f`, canvas `#f5f5eb`, 28px radii, no shadows, Inter as the OTSono substitute.
- Keep units small and single-purpose; prefer pure functions for progress, validation, and screen grouping so they are easy to test.
- Conventional commits. Do not add AI attribution trailers to commits.
- Write tests first for progress calculation, access-code lockout, and expiry purge.

## Working agreements

- Before implementing a feature, check it against the spec. If the spec is wrong or silent, propose a change to the spec first.
- Verify free-tier limits and library APIs against current docs; do not rely on memory.
- Prefer the smallest change that meets the requirement; do not refactor unrelated code.
- Report honestly: if tests fail or a step was skipped, say so.

## Commands

To be filled in once the project is scaffolded (install, dev, test, e2e, lint, build).
