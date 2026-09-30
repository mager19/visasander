# Visa Intake App — Design Spec

Date: 2026-09-30
Status: Draft for review

## 1. Problem and goal

A visa-preparation consultant (the "manager") helps people get organized before applying for a US visa (DS-160 form and appointment). The service has no agreement with the embassy. Today applicants send their data manually over WhatsApp, and the manager loses control of what has been received.

Goal: replace the WhatsApp exchange with (a) a public, mobile-first form the applicant fills in using a link and an access code, and (b) a private panel where the manager sees every applicant's data, files, and completion progress.

Source of questions: `Ds- 160.docx` (DS-160 data list). Visual reference: `DESIGN (1).md` ("Perk" style).

### Success criteria
- An applicant can complete the whole form from a phone in one sitting, with an optional resume via ID.
- The manager sees, per applicant, a completion percentage and exactly which fields/files are missing.
- Sensitive data (passports, national IDs) is never publicly reachable and is deleted automatically after the retention period.
- Runs on free tiers that do not require manual reactivation.

### Non-goals (YAGNI)
- No automatic submission to the embassy or integration with the official DS-160 site.
- No multi-manager accounts or roles (single manager for now).
- No email/SMS notifications in v1 (future option).
- No payments.

## 2. Stack and architecture

- **App:** one Next.js application deployed on Vercel.
- **Database:** Neon (serverless Postgres). Compute scales to zero and wakes on the next query; no manual reactivation.
- **Files:** Cloudflare R2, private bucket, S3-compatible, accessed only through short-lived signed URLs.
- **Verify before implementation:** current free-tier limits of Neon and R2, and whether enabling R2 requires a payment method.

### Routes
- `/s/[token]` — public applicant flow (access code required).
- `/gestor` — manager panel (password). Path configurable through an environment variable.

### Data model (conceptual)
- `applications`: id, public token, short readable ID (e.g. `VZ-4K7P`), client name, access code hash, status, answers (JSONB), failed-attempt counter, locked flag, created/updated/submitted/reviewed timestamps, expires_at, manager notes.
- `sessions`: application id, session token hash, device info, last seen. Maximum 2 active per application.
- `files`: application id, kind (passport, photo, national_id, previous_visa, employment_letter), R2 object key, mime type, size, uploaded_at.

## 3. Applicant flow

### Access
1. Manager creates an application (client name only). The system generates the link, a short ID, and a 6-digit access code.
2. Manager delivers link and code separately (link via WhatsApp share, code through another message or call).
3. Applicant opens the link and enters the code. On success a session cookie is stored and no code is asked again on that device.
4. Limits: 5 failed attempts lock the application; the manager unlocks or regenerates the code. Maximum 2 active sessions per application. Regenerating the code invalidates all sessions.
5. The short ID also lets the applicant resume (alongside the link), shown on screen after first access.

### Form experience
- Typeform-style: one question, or one tight group of up to 3–4 related short fields, per screen. Roughly 60 base fields, about 25–30 screens.
- Eight chapters following the Word document, with a short transition screen between chapters:
  1. Personal information
  2. Passport
  3. Travel
  4. Companions and US history
  5. US point of contact
  6. Family
  7. Work and education
  8. Files and final review
- Progress bar reflects the real percentage of answered questions.
- Conditional questions (e.g. lost passport details) appear only when triggered and are skipped otherwise.
- Repeatable sections (previous jobs, education, companions, previous trips) use an "Add another" loop.
- Native keyboards per field type (tel, email, date). Full-width thumb-reach buttons. Back button always available. "Skip for now" on optional fields.
- Auto-save on every step. Editable review screen at the end; submission allowed with missing fields so the manager can request them later.
- Validation is minimal: email/phone format, coherent dates (issue before expiry).

### Files
- Required: passport data page photo, visa-style photo, national ID. Optional: previous US visa, employment letter.
- Camera capture on mobile, preview with retake, client-side compression, direct upload to R2 through a signed URL.
- Accepted types: JPG, PNG, PDF (PDF only where sensible). Server-enforced size limits.

## 4. Manager panel

- **Auth:** single password (hash in env var), signed `httpOnly` session cookie, login attempt rate limiting, `noindex`.
- **List:** cards/rows with name, short ID, progress bar (%), status, days until expiry. Search by name/ID, filter by status. "New application" action.
- **Create:** name input, generates link and code, "Copy link" and "Share via WhatsApp" (prefilled message).
- **Detail:**
  - Data grouped in the 8 chapters with per-chapter completeness (complete / incomplete). Missing fields highlighted.
  - File gallery with preview and download through signed URLs.
  - "Copy data" per chapter, to paste into the official DS-160.
  - Internal notes (never visible to the applicant).
  - Last access and active-device count; unlock, regenerate code, extend expiry, delete.
- **Statuses:** Created → In progress → Submitted by applicant → Reviewed by manager (manual).
- Must be usable on mobile.

## 5. Progress calculation

A fixed, versioned list of required fields per chapter, derived from the Word document. Conditional fields count only when their trigger answer activates them. Repeatable sections count as complete when they have at least one entry or the applicant declares "none". Progress % = answered required fields / applicable required fields.

## 6. Security and privacy

- HTTPS only; Neon and R2 encrypted at rest.
- Private R2 bucket; signed URLs valid for a few minutes; type and size validation.
- Access codes and session tokens stored hashed.
- Rate limiting per IP and per application on both the manager login and the applicant code.
- No personal data in logs.
- Retention: configurable, default 90 days (60 allowed). A daily scheduled job deletes expired applications and their R2 objects. Manager can extend expiry.
- Manager path (`/gestor`) is guessable by design; real protection is password, rate limiting, and `noindex`. Path is changeable via env var. Two-step verification is a future option.

## 7. Error handling

- Upload failure on weak connectivity: automatic retry, clear state, nothing typed is lost.
- R2 download failure in the panel: visible message with retry.
- Expired link or locked application: friendly screen telling the applicant to contact the manager.
- Saves are idempotent; repeating a step never duplicates data.

## 8. Testing

- **Unit:** progress calculation (including conditional fields), validation rules, screen grouping.
- **Integration:** access-code flow with lockout and 2-session limit; expiry purge (rows and R2 objects).
- **End-to-end (Playwright, mobile viewport):** full applicant journey and manager review.

## 9. Visual design

Follow `DESIGN (1).md`: Electric Lime `#beff50` for the primary action, Off-Black Ink `#14140f`, Off-White Canvas `#f5f5eb`, white surfaces, 28px radii for cards and buttons, pill tags, no shadows, single-family sans (OTSono, substitute Inter), tight tracking on large headings. Typeform-like pacing, but with this visual identity. Mobile-first; touch targets and contrast meet WCAG AA.

## 10. Future options (out of v1)

- Email notification to the manager on submission and to the applicant with reminders.
- Two-step verification for the manager.
- Multi-manager accounts with audit trail.
- Export of an applicant's data as a structured PDF/checklist.
- Appointment-preparation checklist per applicant.
- Multi-language form.

## 11. Open items to verify before planning

- Neon and R2 free-tier limits and R2 payment-method requirement.
- Exact required vs. optional flag for every field in the Word document.
- Default retention value confirmed with the manager (60 or 90 days; default 90).
