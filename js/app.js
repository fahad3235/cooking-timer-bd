// Cooking Timer BD - UI wiring (DOM). Pure ASCII: all visible Bengali text
// comes from window.I18N / window.PRESETS (generated \uXXXX escapes).
// Timers persist in localStorage; running timers are restored from their
// stored deadline, so a reload never loses a running timer.
'use strict';

(function () {
  var L = window.CTB;
  var I18N = window.I18N || {};
  var PRESETS = window.PRESETS || [];
  var STORE_KEY = 'cooking-timer-bd:v1';

  var lang = 'en';
  var soundOn = true;
  var timers = [];
  var audioCtx = null;
  var beepTimers = {}; // timerId -> interval handle for the repeat alarm
  var beepCount = {};  // timerId -> beeps already played

  function t(key) {
    var entry = I18N[key];
    if (!entry) return key;
    return entry[lang] || entry.en || key;
  }

  function fmt(n) {
    return lang === 'bn' ? L.toBnDigits(n) : String(n);
  }

  function $(id) { return document.getElementById(id); }

  // ---------- persistence ----------
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        lang: lang, soundOn: soundOn, timers: timers,
      }));
    } catch (e) { /* storage full/blocked: app keeps working in memory */ }
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { raw = null; }
    if (!raw) return;
    try {
      var data = JSON.parse(raw);
      if (data.lang === 'bn' || data.lang === 'en') lang = data.lang;
      if (typeof data.soundOn === 'boolean') soundOn = data.soundOn;
      if (Array.isArray(data.timers)) {
        timers = data.timers.filter(function (x) {
          return x && typeof x.id === 'string' && Number.isFinite(x.durationSec);
        });
      }
    } catch (e) { /* corrupt store: start fresh */ }
  }

  // ---------- audio alarm ----------
  function ensureAudio() {
    try {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      }
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }
  }

  function beepOnce() {
    if (!audioCtx || !soundOn) return;
    try {
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.45);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.5);
    } catch (e) { /* headless / no audio device: visual alarm still shows */ }
  }

  function beepPattern() { beepOnce(); setTimeout(beepOnce, 600); setTimeout(beepOnce, 1200); }

  function startAlarm(id) {
    stopAlarm(id);
    beepCount[id] = 0;
    beepPattern();
    beepTimers[id] = setInterval(function () {
      beepCount[id]++;
      if (beepCount[id] >= 6) { stopAlarm(id); return; } // ~30s of sound, then quiet
      beepPattern();
    }, 5000);
  }

  function stopAlarm(id) {
    if (beepTimers[id]) { clearInterval(beepTimers[id]); delete beepTimers[id]; }
  }

  // ---------- timer actions ----------
  function nextDefaultName() {
    var n = timers.length + 1;
    while (timers.some(function (x) { return x.name === L.defaultName(n, lang); })) n++;
    return L.defaultName(n, lang);
  }

  function addTimer(name, durationSec) {
    ensureAudio();
    var clean = L.cleanName(name);
    var timer = L.createTimer(clean === '' ? nextDefaultName() : clean, durationSec, Date.now());
    timers.push(timer);
    save();
    render();
    return timer;
  }

  function findTimer(id) {
    for (var i = 0; i < timers.length; i++) if (timers[i].id === id) return timers[i];
    return null;
  }

  function updateTimer(id, fn) {
    for (var i = 0; i < timers.length; i++) {
      if (timers[i].id === id) { timers[i] = fn(timers[i], Date.now()); break; }
    }
    save();
    render();
  }

  // ---------- rendering ----------
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function applyI18n() {
    document.documentElement.lang = lang === 'bn' ? 'bn' : 'en';
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    $('langBtn').textContent = t('langToggle');
    $('soundBtn').textContent = soundOn ? t('soundOn') : t('soundOff');
  }

  function renderPresets() {
    var wrap = $('presets');
    wrap.innerHTML = '';
    PRESETS.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.setAttribute('data-preset', p.id);
      b.innerHTML = '<span class="preset-name">' + esc(p.name[lang] || p.name.en) + '</span>' +
        '<span class="preset-time">' + esc(L.formatHMSLang(p.seconds, lang)) + '</span>';
      b.addEventListener('click', function () {
        addTimer(p.name[lang] || p.name.en, p.seconds);
      });
      wrap.appendChild(b);
    });
  }

  function timerCard(timer, now) {
    var left = L.remainingSec(timer, now);
    var pct = Math.round(L.progress(timer, now) * 100);
    var card = document.createElement('article');
    card.className = 'timer-card' + (timer.status === 'done' ? ' is-done' : '') +
      (timer.status === 'paused' ? ' is-paused' : '');
    card.setAttribute('data-timer-id', timer.id);

    var statusKey = timer.status === 'done' ? 'done' : (timer.status === 'paused' ? 'paused' : 'running');
    var html = '<div class="timer-head"><h3>' + esc(timer.name) + '</h3>' +
      '<span class="status status-' + timer.status + '">' + esc(t(statusKey)) + '</span></div>' +
      '<div class="timer-time" data-role="time">' + esc(L.formatHMSLang(left, lang)) + '</div>' +
      '<div class="progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
      '<div class="progress-fill" data-role="fill" style="width:' + pct + '%"></div></div>' +
      '<div class="timer-meta"><span data-role="total">' + esc(L.formatHMSLang(timer.durationSec, lang)) + '</span></div>' +
      '<div class="timer-actions">';

    if (timer.status === 'running') {
      html += '<button type="button" data-act="pause">' + esc(t('pause')) + '</button>' +
        '<button type="button" data-act="add1">' + esc(t('add1min')) + '</button>' +
        '<button type="button" data-act="add5">' + esc(t('add5min')) + '</button>';
    } else if (timer.status === 'paused') {
      html += '<button type="button" data-act="resume">' + esc(t('resume')) + '</button>' +
        '<button type="button" data-act="add1">' + esc(t('add1min')) + '</button>';
    } else {
      html += '<button type="button" data-act="dismiss">' + esc(t('dismiss')) + '</button>';
    }
    html += '<button type="button" data-act="reset">' + esc(t('reset')) + '</button>' +
      '<button type="button" data-act="delete">' + esc(t('delete')) + '</button></div>';

    card.innerHTML = html;
    card.addEventListener('click', function (ev) {
      var act = ev.target.getAttribute && ev.target.getAttribute('data-act');
      if (!act) return;
      ensureAudio();
      if (act === 'pause') updateTimer(timer.id, function (x, now) { return L.pauseTimer(x, now); });
      else if (act === 'resume') updateTimer(timer.id, function (x, now) { return L.resumeTimer(x, now); });
      else if (act === 'reset') { stopAlarm(timer.id); updateTimer(timer.id, function (x, now) { return L.resetTimer(x, now); }); }
      else if (act === 'add1') updateTimer(timer.id, function (x, now) { return L.addMinutes(x, 1, now); });
      else if (act === 'add5') updateTimer(timer.id, function (x, now) { return L.addMinutes(x, 5, now); });
      else if (act === 'dismiss' || act === 'delete') {
        stopAlarm(timer.id);
        timers = timers.filter(function (x) { return x.id !== timer.id; });
        save(); render();
      }
    });
    return card;
  }

  function render() {
    var now = Date.now();
    applyI18n();
    renderPresets();

    var active = timers.filter(function (x) { return x.status !== 'done'; });
    var done = timers.filter(function (x) { return x.status === 'done'; });
    $('activeCount').textContent = t('timerCount').replace('{n}', fmt(active.length));
    $('emptyActive').style.display = active.length ? 'none' : 'block';
    $('emptyDone').style.display = done.length ? 'none' : 'block';
    $('clearFinished').style.display = done.length ? '' : 'none';

    var activeWrap = $('activeList');
    activeWrap.innerHTML = '';
    L.sortTimers(active, now).forEach(function (x) { activeWrap.appendChild(timerCard(x, now)); });

    var doneWrap = $('doneList');
    doneWrap.innerHTML = '';
    L.sortTimers(done, now).forEach(function (x) { doneWrap.appendChild(timerCard(x, now)); });
  }

  // ---------- tick ----------
  function tick() {
    var now = Date.now();
    var changed = false;
    for (var i = 0; i < timers.length; i++) {
      var tm = timers[i];
      if (tm.status === 'running' && L.isFinished(tm, now)) {
        timers[i] = L.markDone(tm, now);
        startAlarm(tm.id);
        changed = true;
      }
    }
    // Update live countdown text + progress without rebuilding the DOM.
    document.querySelectorAll('.timer-card').forEach(function (card) {
      var tm = findTimer(card.getAttribute('data-timer-id'));
      if (!tm) return;
      var timeEl = card.querySelector('[data-role="time"]');
      var fillEl = card.querySelector('[data-role="fill"]');
      if (timeEl) timeEl.textContent = L.formatHMSLang(L.remainingSec(tm, now), lang);
      if (fillEl) {
        var pct = Math.round(L.progress(tm, now) * 100);
        fillEl.style.width = pct + '%';
        fillEl.parentElement.setAttribute('aria-valuenow', String(pct));
      }
    });
    if (changed) { save(); render(); }
  }

  // ---------- form ----------
  function onStart(ev) {
    ev.preventDefault();
    var res = L.parseDurationInput($('inH').value, $('inM').value, $('inS').value);
    var err = $('formError');
    if (res.error) {
      err.textContent = t(res.error);
      err.style.display = 'block';
      return;
    }
    err.style.display = 'none';
    addTimer($('inName').value, res.seconds);
    $('inName').value = '';
    $('inH').value = ''; $('inM').value = ''; $('inS').value = '';
    $('inName').focus();
  }

  // ---------- boot ----------
  function boot() {
    load();
    // Any timer whose deadline passed while the page was closed is done now.
    var now = Date.now();
    timers = timers.map(function (tm) {
      if (tm.status === 'running' && now >= tm.deadlineMs) return L.markDone(tm, now);
      return tm;
    });
    $('timerForm').addEventListener('submit', onStart);
    $('langBtn').addEventListener('click', function () {
      lang = lang === 'en' ? 'bn' : 'en';
      save(); render();
    });
    $('soundBtn').addEventListener('click', function () {
      soundOn = !soundOn;
      if (soundOn) ensureAudio();
      save(); render();
    });
    $('clearFinished').addEventListener('click', function () {
      timers = timers.filter(function (x) { return x.status !== 'done'; });
      save(); render();
    });
    render();
    setInterval(tick, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
