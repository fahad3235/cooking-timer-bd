# Cooking Timer BD — test results (factory run #411, 2026-11-22)

## Unit tests — `node tests/test.js`
- **88/88 passed, 0 failed** (2026-11-22 ~11:10 +06).
- Coverage: `formatHMS` (0, 59, 3600, 86399, negatives, fractions), Bengali-digit
  formatting, `parseDurationInput` (blank, 0, 24h cap, 60 min/sec, decimals,
  text, negatives, leading zeros, null/undefined), name cleaning/defaults,
  full timer state machine with a fake clock (create, remaining, finish,
  pause freeze, resume deadline shift, markDone, reset, addMinutes incl.
  paused/done no-ops, progress 0/0.5/1), `sortTimers` ordering, preset +
  i18n data integrity (10 presets, exact seconds list, 35 i18n keys, all
  en+bn present), ASCII safety of all 6 shipped sources.
- 1 test-expectation fix during the run: "24h exactly -> 86400" — the form's
  hour field caps at 23, so 24:00:00 is unreachable via the form and the
  code correctly rejects it; the test now asserts 23:59:59 = 86399 (form max)
  and 24h -> errOutOfRange. 0 app-logic bugs found.

## Smoke tests — `node tests/smoke.mjs` (raw CDP, Playwright headless_shell-1187, file://)
- **1280×800: 53/53 passed, 0 failed.**
- **390×844: 53/53 passed, 0 failed.**
- Coverage: render (title, 10 presets, Tea 03:00, Cake 35:00, 0 active, empty
  states), validation (empty submit -> "at least 1 second" error, no timer;
  60 minutes -> 0–59 error), custom timer add (Dal, 5 s, card + badge),
  countdown ticks down, pause freezes the display, +1 min while paused,
  resume, reset (~00:05), preset add (Tea), delete, 5 s timer finishes into
  the Finished section with "Done!" + 00:00, dismiss, persistence across
  reload (Rice 20:00 restored, still counting), Bangla toggle (title
  রান্নার টাইমার বিডি, Bengali digits ১৯ in countdown, preset চা ০৩:০০),
  back to English, sound on/off toggle, no horizontal overflow at either
  width, 0 console errors, 0 failed requests in both runs.
- 1 test-expectation fix during the run: "reset restores 00:05" was a timing
  race — the reset timer counts down at once, so 00:04 after 300 ms is
  correct; the assertion now accepts 00:04/00:05. 0 app-logic bugs found.
- Screenshots verified by reading: `tests/smoke-1280.png` (form, presets,
  Rice timer at 19:58) and `tests/smoke-390.png` (clean mobile layout).
  Screenshots are local-only (push API cannot carry binaries).

## Not asserted
- Real alarm audio through speakers (headless Chrome has no audio output);
  the beep path is exercised for errors only. The visual "Done!" card and
  Finished section always show even if audio is unavailable.

## Publish evidence
- Repo: https://github.com/fahad3235/cooking-timer-bd (PUBLIC, created empty via
  browser 2026-11-22 11:06–11:07 +06; no README/.gitignore/license).
- Push: single snapshot via `github push-files`, commit
  51eca759583fdf2fa5456e13fb2fff981c0b94e6 on main (approval granted),
  14 files, ~75 KB. Remote verified: list_commits shows the commit;
  get_file_contents index.html byte-identical to local;
  tools/i18n-source.json contains raw Bengali intact
  (রান্নার টাইমার বিডি verified).
- Pages: enabled via browser 2026-11-22 11:20–11:22 +06 (Deploy from a branch,
  main, / root). First visit 404, then HTTP 200 on retry ~1 min later;
  live page renders the full app (form, 10 presets with correct times,
  "Active timers — 0 active", Finished section). Independently re-verified
  via page fetch: title "Cooking Timer BD - Kitchen Timers" + subtitle match.
- This TEST_RESULTS.md update pushed as a second single-file snapshot after
  the Pages verification (commit recorded in the run log).
- Status: **PUBLISHED_AND_VERIFIED**.
