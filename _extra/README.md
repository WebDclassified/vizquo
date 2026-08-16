# `_extra` — Reference & working notes (not project docs)

This folder keeps **reference material and personal working notes** out of the
repo root so the open-source surface stays clean for contributors. Nothing in
here is imported by the build, tests, or tooling — it documents *how* the
project was specified and run, not *what* the project is.

| File | What it is | Why it's here |
|---|---|---|
| `Requirements.md` | The master hardening/QA specification (§§1–88) the implementation was audited against | A working brief, not part of the product docs — the outcomes live in `HARDENING_REPORT.md`, `TESTING.md`, `SECURITY.md`, `THREAT_MODEL.md` |
| `Redesign.md` | The v2 landing-page design specification ("Instrumented Glass", "See beyond the surface") | The design brief — the shipped result is `landing/index.html`; the decisions are summarized in `CHANGELOG.md` |
| `tomorrow.md` | The maintainer's day-to-day handoff notes | Personal working notes; superseded by `CHANGELOG.md` + the store-submission checklist in `deploy-kit/publish-checklist.md` |

## Maintenance notes

- `scripts/bump-version.mjs` still updates the version string in
  `_extra/tomorrow.md` (its `FILES` list points here), so the release pipeline
  keeps working untouched.
- If a spec in here is ever superseded, delete it rather than leaving both
  versions around.
