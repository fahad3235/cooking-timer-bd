// Node unit tests for Cooking Timer BD.
// Run from the project root:  node tests/test.js
// Exits 0 only if every check passes.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const L = require('../js/logic.js');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' :: ' + extra : '')); }
}

const presetsSrc = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/presets-source.json'), 'utf8'));
const i18nSrc = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/i18n-source.json'), 'utf8'));
const PRESETS = presetsSrc.presets;

// ---- Data integrity (source of truth) ----
console.log('preset data integrity');
check('exactly 10 presets', PRESETS.length === 10, String(PRESETS.length));
check('unique preset ids', new Set(PRESETS.map((p) => p.id)).size === 10);
PRESETS.forEach(function (p) {
  check('validatePreset clean: ' + p.id, L.validatePreset(p).length === 0, L.validatePreset(p).join(','));
});
check('preset seconds are the expected set',
  JSON.stringify(PRESETS.map((p) => p.seconds)) === JSON.stringify([180, 360, 300, 600, 600, 720, 900, 1200, 1500, 2100]),
  JSON.stringify(PRESETS.map((p) => p.seconds)));
check('preset ids in order',
  JSON.stringify(PRESETS.map((p) => p.id)) === JSON.stringify(['tea', 'soft-egg', 'noodles', 'hard-egg', 'pasta', 'steamed-veg', 'dal', 'rice', 'chicken', 'cake']));
check('validatePreset rejects bad seconds',
  L.validatePreset({ id: 'x', name: { en: 'X', bn: 'X' }, seconds: 0 }).includes('bad-seconds'));
check('validatePreset rejects missing Bengali name',
  L.validatePreset({ id: 'x', name: { en: 'X' }, seconds: 60 }).includes('missing-name-bn'));

console.log('i18n integrity');
check('35 i18n keys', Object.keys(i18nSrc).length === 35, String(Object.keys(i18nSrc).length));
check('every key has en + bn', Object.values(i18nSrc).every(function (v) {
  return typeof v.en === 'string' && v.en.length > 0 && typeof v.bn === 'string' && v.bn.length > 0;
}));
check('no {n} placeholder left unfilled in static keys',
  Object.entries(i18nSrc).every(function ([k, v]) {
    return k === 'timerCount' ? (v.en.includes('{n}') && v.bn.includes('{n}')) : (!v.en.includes('{n}') && !v.bn.includes('{n}'));
  }));

// ---- Formatting ----
console.log('formatHMS');
check('0 -> 00:00', L.formatHMS(0) === '00:00', L.formatHMS(0));
check('5 -> 00:05', L.formatHMS(5) === '00:05');
check('59 -> 00:59', L.formatHMS(59) === '00:59');
check('60 -> 01:00', L.formatHMS(60) === '01:00');
check('3599 -> 59:59', L.formatHMS(3599) === '59:59');
check('3600 -> 1:00:00', L.formatHMS(3600) === '1:00:00', L.formatHMS(3600));
check('3661 -> 1:01:01', L.formatHMS(3661) === '1:01:01');
check('86399 -> 23:59:59', L.formatHMS(86399) === '23:59:59');
check('86400 -> 24:00:00', L.formatHMS(86400) === '24:00:00');
check('negative clamps to 00:00', L.formatHMS(-30) === '00:00');
check('fraction floors: 90.9 -> 01:30', L.formatHMS(90.9) === '01:30');
check('Bengali digits: 90s -> ০১:৩০', L.formatHMSLang(90, 'bn') === '\u09e6\u09e7:\u09e9\u09e6', L.formatHMSLang(90, 'bn'));
check('English digits unchanged', L.formatHMSLang(90, 'en') === '01:30');
check('toBnDigits 1234567890', L.toBnDigits('1234567890') === '\u09e7\u09e8\u09e9\u09ea\u09eb\u09ec\u09ed\u09ee\u09ef\u09e6');
check('toBnDigits leaves colons alone', L.toBnDigits('1:05:09') === '\u09e7:\u09e6\u09eb:\u09e6\u09ef');

// ---- Duration parsing / validation ----
console.log('parseDurationInput');
check('blank all -> errNoDuration', L.parseDurationInput('', '', '').error === 'errNoDuration');
check('0,0,0 -> errNoDuration', L.parseDurationInput('0', '0', '0').error === 'errNoDuration');
check('5 min -> 300', L.parseDurationInput('', '5', '').seconds === 300);
check('1h30m -> 5400', L.parseDurationInput('1', '30', '0').seconds === 5400);
check('whitespace tolerated', L.parseDurationInput('  ', ' 2 ', '').seconds === 120);
check('23:59:59 -> 86399 (form max)', L.parseDurationInput('23', '59', '59').seconds === 86399);
check('24h -> errOutOfRange (hours cap 23)', L.parseDurationInput('24', '0', '0').error === 'errOutOfRange');
check('24h + 1s -> errOutOfRange (seconds 60)', L.parseDurationInput('24', '0', '60').error === 'errOutOfRange');
check('25h -> errOutOfRange', L.parseDurationInput('25', '0', '0').error === 'errOutOfRange');
check('60 minutes -> errOutOfRange', L.parseDurationInput('0', '60', '0').error === 'errOutOfRange');
check('60 seconds -> errOutOfRange', L.parseDurationInput('0', '0', '60').error === 'errOutOfRange');
check('decimal 1.5 -> errBadNumber', L.parseDurationInput('0', '1.5', '0').error === 'errBadNumber');
check('text abc -> errBadNumber', L.parseDurationInput('0', 'abc', '0').error === 'errBadNumber');
check('negative -5 -> errBadNumber', L.parseDurationInput('0', '-5', '0').error === 'errBadNumber');
check('leading zeros ok: 007 -> 7', L.parseDurationInput('0', '0', '007').seconds === 7);
check('null/undefined treated as blank', L.parseDurationInput(null, undefined, '30').seconds === 30);

// ---- Names ----
console.log('names');
check('cleanName trims', L.cleanName('  Dal  ') === 'Dal');
check('cleanName blank -> empty', L.cleanName('   ') === '');
check('cleanName caps at 60 chars', L.cleanName('x'.repeat(100)).length === 60);
check('defaultName en', L.defaultName(3, 'en') === 'Timer 3');
check('defaultName bn', L.defaultName(3, 'bn') === '\u099f\u09be\u0987\u09ae\u09be\u09b0 \u09e9');

// ---- Timer state machine (fake clock) ----
console.log('timer state machine');
const T0 = 1000000000000;
const tm = L.createTimer('Rice', 1200, T0);
check('created running', tm.status === 'running');
check('deadline = now + duration', tm.deadlineMs === T0 + 1200000);
check('remaining 1200 at start', L.remainingSec(tm, T0) === 1200);
check('remaining 1190 after 10s', L.remainingSec(tm, T0 + 10000) === 1190);
check('not finished at 1199s', !L.isFinished(tm, T0 + 1199000));
check('finished at deadline', L.isFinished(tm, T0 + 1200000));
check('remaining 0 past deadline', L.remainingSec(tm, T0 + 1300000) === 0);
check('progress 0 at start', L.progress(tm, T0) === 0);
check('progress 0.5 halfway', L.progress(tm, T0 + 600000) === 0.5);
check('progress 1 at deadline', L.progress(tm, T0 + 1200000) === 1);

const paused = L.pauseTimer(tm, T0 + 300000);
check('pause freezes remaining at 900', L.remainingSec(paused, T0 + 300000) === 900);
check('paused remaining stable 60s later', L.remainingSec(paused, T0 + 360000) === 900);
check('pause is a copy (original still running)', tm.status === 'running');
check('pause of paused is a no-op', L.pauseTimer(paused, T0 + 400000) === paused);

const resumed = L.resumeTimer(paused, T0 + 600000);
check('resume shifts deadline', resumed.deadlineMs === T0 + 600000 + 900000);
check('resumed remaining 900', L.remainingSec(resumed, T0 + 600000) === 900);
check('resume of running is a no-op', L.resumeTimer(resumed, T0 + 610000) === resumed);

const done = L.markDone(resumed, T0 + 1500000);
check('markDone status done', done.status === 'done');
check('markDone remaining 0', L.remainingSec(done, T0 + 1500000) === 0);
check('markDone stamps finishedAtMs', done.finishedAtMs === T0 + 1500000);
check('markDone progress 1', L.progress(done, T0 + 1500000) === 1);

const reset = L.resetTimer(done, T0 + 2000000);
check('reset restarts full duration', reset.status === 'running' && reset.deadlineMs === T0 + 2000000 + 1200000);
check('reset clears finishedAtMs', reset.finishedAtMs === null);

const plus = L.addMinutes(resumed, 5, T0 + 700000);
check('addMinutes running shifts deadline +5m', plus.deadlineMs === resumed.deadlineMs + 300000);
const plusPaused = L.addMinutes(paused, 1, T0 + 400000);
check('addMinutes paused adds remaining', L.remainingSec(plusPaused, T0 + 400000) === 960);
const plusDone = L.addMinutes(done, 5, T0 + 1600000);
check('addMinutes done is a no-op', plusDone.deadlineMs === done.deadlineMs);

// ---- Sorting ----
console.log('sortTimers');
const a = L.createTimer('A', 600, T0);            // running, 600s left
const b = L.createTimer('B', 60, T0);             // running, 60s left
const c = L.pauseTimer(L.createTimer('C', 300, T0), T0 + 1000);
const d1 = L.markDone(L.createTimer('D1', 10, T0), T0 + 20000);
const d2 = L.markDone(L.createTimer('D2', 10, T0), T0 + 10000);
const sorted = L.sortTimers([a, d1, c, d2, b], T0 + 5000).map((x) => x.name);
check('running soonest first, then paused, then done latest first',
  JSON.stringify(sorted) === JSON.stringify(['B', 'A', 'C', 'D1', 'D2']), JSON.stringify(sorted));

// ---- ASCII safety of shipped sources ----
console.log('ascii safety');
['index.html', 'css/style.css', 'js/logic.js', 'js/app.js', 'js/i18n.js', 'js/presets.js'].forEach(function (rel) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  check(rel + ' is pure ASCII', buf.every((b) => b < 128));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
