# Cooking Timer BD

Offline bilingual (English / বাংলা) kitchen timer app for Bangladesh: run several cooking timers at once — tea, eggs, rice, dal, cake — with quick presets, pause/resume, a finish alarm, and timers that survive a page reload.

## Features

- **Multiple simultaneous timers** — add as many named timers as you need; each counts down independently from its own deadline, so switching tabs or reloading never loses time.
- **Custom timer form** — name (optional) + hours/minutes/seconds, with plain-language validation (at least 1 second, max 24 hours, whole numbers only, 0–59 for minutes/seconds).
- **10 quick presets** — Tea 3:00, Soft-boiled egg 6:00, Instant noodles 5:00, Hard-boiled egg 10:00, Pasta 10:00, Steamed vegetables 12:00, Dal 15:00, Rice 20:00, Chicken curry 25:00, Cake 35:00. Preset times are common kitchen guides, not rules — adjust to your stove and taste.
- **Pause, resume, reset, +1/+5 minutes** on any timer, plus delete.
- **Finish alarm** — WebAudio beep pattern (repeats every 5 s for ~30 s, then goes quiet), a flashing green "Done!" card, and a Finished section with dismiss / clear-all.
- **Persistence** — timers, language, and sound preference live in `localStorage`; a running timer restored after reload keeps counting from its stored deadline, and one whose deadline passed while the page was closed shows as finished.
- **Bilingual UI** — English / বাংলা toggle (persisted), with Bengali digits in countdowns when Bangla is active.
- **Offline, zero network requests** — no fonts, CDNs, or tracking; works from `file://` or any static host.
- **Responsive** — verified at 1280×800 and 390×844 (no horizontal overflow).

## Stack

- Vanilla HTML + CSS + JavaScript (no build step, no dependencies)
- `js/logic.js` — pure, side-effect-free timer logic (unit-tested in Node)
- `js/app.js` — DOM wiring, tick loop, WebAudio alarm, persistence
- `js/i18n.js`, `js/presets.js` — generated ASCII-safe data files (see below)
- Tests: `tests/test.js` (Node unit tests) + `tests/smoke.mjs` (headless-Chrome CDP smoke test, no npm deps)

## Prerequisites

- Any modern browser (Chrome, Firefox, Safari, Edge). No server needed.
- For tests: Node.js 18+ and the Playwright-cached `headless_shell` binary used by the smoke test (see Testing).

## Install & run

```sh
# Just open it — no install, no build:
open index.html            # or double-click it in a file manager

# Or serve it statically:
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Development commands

```sh
# Regenerate the ASCII-safe JS data files after editing tools/*.json:
python3 tools/build-i18n.py

# Unit tests (88 checks):
node tests/test.js

# Headless-Chrome smoke tests (53 checks each):
node tests/smoke.mjs 1280
node tests/smoke.mjs 390
```

## Bengali text & ASCII safety

Bengali lives only in `tools/i18n-source.json` and `tools/presets-source.json` (UTF-8, the source of truth). `tools/build-i18n.py` generates `js/i18n.js` and `js/presets.js` with `json.dumps(ensure_ascii=True)`, so every shipped app source is pure ASCII — the GitHub push path once corrupted raw non-ASCII argv text, so Bengali travels as `\uXXXX` escapes in code and as raw UTF-8 only in the `tools/*.json` sources. `tests/test.js` asserts all shipped sources are pure ASCII.

## Testing

Real results (2026-11-22, run #411):

- `node tests/test.js`: **88/88 passed** — formatting, duration validation, timer state machine (pause/resume/reset/+minutes with a fake clock), sorting, data integrity, ASCII safety. One test expectation fixed during the run (the form's hour field caps at 23, so 24:00:00 is unreachable — the code was right).
- `node tests/smoke.mjs 1280`: **53/53 passed** — render, validation errors, custom timer add/countdown, pause freeze, +1 min, reset, preset add, delete, finish-to-Done flow, dismiss, persistence across reload, Bangla toggle with Bengali digits, sound toggle, no horizontal overflow, 0 console errors, 0 failed requests.
- `node tests/smoke.mjs 390`: **53/53 passed** — same suite at mobile width.
- Screenshots verified by reading: `tests/smoke-1280.png`, `tests/smoke-390.png` (local only — the push API cannot carry binaries, so they are not in the repo).

Not asserted: real alarm audio through speakers (headless Chrome has no audio output; the beep code is exercised for errors only — a visual "Done!" card always shows even if audio is unavailable).

## Deployment

Static site — copy the project (except `tests/smoke-*.png`, which are local-only) to any static host, or enable GitHub Pages on the repo (main branch, `/` root).

## Limitations

- Timers live in the browser's `localStorage` on one device; there is no account, sync, or sharing.
- The alarm uses the Web Audio API: it needs sound enabled on the device, and some browsers require a tap on the page before audio plays (adding a timer counts as that tap).
- Countdowns update every 250 ms; a timer finishing while the tab is fully suspended by the OS shows as finished when the tab wakes.
- Preset times are guides for common dishes, not tested recipes — check your food, not just the clock.

## Status

Complete MVP, tested and verified locally (see `TEST_RESULTS.md`). Factory run #411, 2026-11-22 11:00 Asia/Dhaka.
