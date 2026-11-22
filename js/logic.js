// Cooking Timer BD - pure logic (no DOM). Usable from Node (tests) and the
// browser (window.CTB). All functions are total and side-effect free.
// This file is pure ASCII by design: Bengali digits are \u09e6-\u09ef escapes.
'use strict';

const BN_DIGITS = ['\u09e6', '\u09e7', '\u09e8', '\u09e9', '\u09ea', '\u09eb', '\u09ec', '\u09ed', '\u09ee', '\u09ef'];
const MAX_SECONDS = 24 * 3600; // 24 hours
const MIN_SECONDS = 1;

/** Bengali digits for a string that may contain 0-9 (other chars pass through). */
function toBnDigits(str) {
  return String(str).split('').map(function (ch) {
    return (ch >= '0' && ch <= '9') ? BN_DIGITS[ch.charCodeAt(0) - 48] : ch;
  }).join('');
}

/** Pad a number to two digits: 5 -> "05". */
function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

/**
 * Format a duration in seconds as "MM:SS" (< 1h) or "H:MM:SS" (>= 1h).
 * Negative values clamp to 0. Fractional seconds are floored (a countdown
 * showing 0.4s left reads 00:00, never a negative or a jump).
 */
function formatHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return h + ':' + pad2(m) + ':' + pad2(sec);
  return pad2(m) + ':' + pad2(sec);
}

/** Format a duration for the current language (Bengali digits in bn). */
function formatHMSLang(totalSeconds, lang) {
  const out = formatHMS(totalSeconds);
  return lang === 'bn' ? toBnDigits(out) : out;
}

/**
 * Validate raw hour/minute/second inputs (strings from form fields).
 * Returns { seconds } on success or { error: '<i18n key>' } on failure.
 * Empty strings count as 0. Non-integer text is rejected.
 */
function parseDurationInput(hoursRaw, minutesRaw, secondsRaw) {
  const parts = [hoursRaw, minutesRaw, secondsRaw].map(function (raw) {
    const t = String(raw === undefined || raw === null ? '' : raw).trim();
    if (t === '') return 0;
    if (!/^\d+$/.test(t)) return null;
    return parseInt(t, 10);
  });
  if (parts.some(function (p) { return p === null; })) return { error: 'errBadNumber' };
  const h = parts[0], m = parts[1], s = parts[2];
  if (h > 23 || m > 59 || s > 59) return { error: 'errOutOfRange' };
  const total = h * 3600 + m * 60 + s;
  if (total < MIN_SECONDS) return { error: 'errNoDuration' };
  if (total > MAX_SECONDS) return { error: 'errTooLong' };
  return { seconds: total };
}

/** Default name for a timer when the user leaves the name blank. */
function defaultName(n, lang) {
  const base = lang === 'bn' ? '\u099f\u09be\u0987\u09ae\u09be\u09b0' : 'Timer';
  return lang === 'bn' ? base + ' ' + toBnDigits(n) : base + ' ' + n;
}

/** Trim a user-typed name; empty/whitespace-only becomes '' (caller defaults it). */
function cleanName(raw) {
  return String(raw === undefined || raw === null ? '' : raw).trim().slice(0, 60);
}

let _nextId = 1;

/** Create a timer object. `nowMs` is injected so tests can control the clock. */
function createTimer(name, durationSec, nowMs) {
  const id = 't' + (nowMs || 0) + '-' + (_nextId++);
  return {
    id: id,
    name: name,
    durationSec: durationSec,
    status: 'running', // 'running' | 'paused' | 'done'
    deadlineMs: nowMs + durationSec * 1000,
    remainingMs: durationSec * 1000,
    createdAtMs: nowMs,
    finishedAtMs: null,
  };
}

/** Seconds left for a timer at `nowMs` (0 once finished or past deadline). */
function remainingSec(timer, nowMs) {
  if (timer.status === 'done') return 0;
  if (timer.status === 'paused') return Math.max(0, Math.floor(timer.remainingMs / 1000));
  return Math.max(0, Math.floor((timer.deadlineMs - nowMs) / 1000));
}

/** True when a running timer has reached (or passed) its deadline. */
function isFinished(timer, nowMs) {
  return timer.status === 'running' && nowMs >= timer.deadlineMs;
}

/** Mark a timer done. Returns a new object; the input is untouched. */
function markDone(timer, nowMs) {
  const t = Object.assign({}, timer);
  t.status = 'done';
  t.remainingMs = 0;
  t.finishedAtMs = nowMs;
  return t;
}

/** Pause a running timer: freeze the remaining time. No-op for other states. */
function pauseTimer(timer, nowMs) {
  if (timer.status !== 'running') return timer;
  const t = Object.assign({}, timer);
  t.status = 'paused';
  t.remainingMs = Math.max(0, timer.deadlineMs - nowMs);
  return t;
}

/** Resume a paused timer: new deadline = now + remaining. No-op otherwise. */
function resumeTimer(timer, nowMs) {
  if (timer.status !== 'paused') return timer;
  const t = Object.assign({}, timer);
  t.status = 'running';
  t.deadlineMs = nowMs + timer.remainingMs;
  return t;
}

/** Reset a timer to its full duration, running from `nowMs`. */
function resetTimer(timer, nowMs) {
  const t = Object.assign({}, timer);
  t.status = 'running';
  t.remainingMs = timer.durationSec * 1000;
  t.deadlineMs = nowMs + timer.durationSec * 1000;
  t.finishedAtMs = null;
  return t;
}

/** Add whole minutes to a timer (running: shift deadline; paused: add remaining). */
function addMinutes(timer, minutes, nowMs) {
  const t = Object.assign({}, timer);
  const addMs = minutes * 60 * 1000;
  if (t.status === 'running') {
    t.deadlineMs += addMs;
    t.remainingMs = Math.max(0, t.deadlineMs - nowMs);
  } else if (t.status === 'paused') {
    t.remainingMs += addMs;
  }
  return t;
}

/** Fraction of the timer elapsed, 0..1 (for the progress bar). */
function progress(timer, nowMs) {
  const total = timer.durationSec * 1000;
  if (total <= 0) return 1;
  const left = timer.status === 'paused'
    ? timer.remainingMs
    : (timer.status === 'done' ? 0 : Math.max(0, timer.deadlineMs - nowMs));
  return Math.min(1, Math.max(0, 1 - left / total));
}

/** Validate a preset entry from tools/presets-source.json. Returns error strings. */
function validatePreset(p) {
  const errs = [];
  if (!p || typeof p !== 'object') return ['not-an-object'];
  if (!p.id || typeof p.id !== 'string') errs.push('missing-id');
  if (!p.name || typeof p.name.en !== 'string' || !p.name.en) errs.push('missing-name-en');
  if (!p.name || typeof p.name.bn !== 'string' || !p.name.bn) errs.push('missing-name-bn');
  if (!Number.isInteger(p.seconds) || p.seconds < MIN_SECONDS || p.seconds > MAX_SECONDS) errs.push('bad-seconds');
  return errs;
}

/** Sort for display: running first (soonest deadline), then paused, then done (latest first). */
function sortTimers(timers, nowMs) {
  const rank = { running: 0, paused: 1, done: 2 };
  return timers.slice().sort(function (a, b) {
    const r = rank[a.status] - rank[b.status];
    if (r !== 0) return r;
    if (a.status === 'done') return (b.finishedAtMs || 0) - (a.finishedAtMs || 0);
    return remainingSec(a, nowMs) - remainingSec(b, nowMs);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BN_DIGITS, MAX_SECONDS, MIN_SECONDS,
    toBnDigits, pad2, formatHMS, formatHMSLang,
    parseDurationInput, defaultName, cleanName,
    createTimer, remainingSec, isFinished, markDone,
    pauseTimer, resumeTimer, resetTimer, addMinutes, progress,
    validatePreset, sortTimers,
  };
} else if (typeof window !== 'undefined') {
  window.CTB = {
    BN_DIGITS, MAX_SECONDS, MIN_SECONDS,
    toBnDigits, pad2, formatHMS, formatHMSLang,
    parseDurationInput, defaultName, cleanName,
    createTimer, remainingSec, isFinished, markDone,
    pauseTimer, resumeTimer, resetTimer, addMinutes, progress,
    validatePreset, sortTimers,
  };
}
