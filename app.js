'use strict';

const $ = (selector) => document.querySelector(selector);
const pad = (value) => String(value).padStart(2, '0');
const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
const alarmKey = 'clockApp.alarms';
// Fixed installation location. Geolocation is requested only by the location button.
const fixedLocation = { latitude: 35.6947, longitude: 139.982, name: '船橋市' };

const SoundManager = {
  audio: new Audio('sounds/alarm.mp3'),
  ready: false,
  async unlock() {
    if (this.ready) return;
    this.audio.loop = true;
    this.audio.muted = true;
    try {
      await this.audio.play();
      this.ready = true;
      if (!UI.ringing.length) { this.audio.pause(); this.audio.currentTime = 0; }
      this.audio.muted = false;
      const soundButton = $('#sound-enable');
      if (soundButton) { soundButton.textContent = '✓ 音は有効です'; soundButton.classList.add('ready'); }
    } catch {
      this.audio.muted = false;
      const soundButton = $('#sound-enable');
      if (soundButton) soundButton.textContent = '音を有効にする（再試行）';
    }
  },
  async play() {
    this.audio.loop = true;
    this.audio.muted = false;
    try { await this.audio.play(); $('#sound-error').textContent = ''; }
    catch { $('#sound-error').textContent = '音を再生できません。画面上部の「音を有効にする」を押してお使いください。'; }
  },
  stop() { this.audio.pause(); this.audio.currentTime = 0; }
};

const AlarmManager = {
  alarms: [],
  fired: new Map(),
  snoozes: [],
  lastCheck: Date.now() - 1000,
  load() {
    try {
      const raw = localStorage.getItem(alarmKey);
      if (!raw) return;
      const alarms = JSON.parse(raw);
      if (!Array.isArray(alarms) || alarms.length > 10 || !alarms.every(a =>
        a && typeof a.id === 'string' && Number.isInteger(a.hour) && a.hour >= 0 && a.hour < 24 &&
        Number.isInteger(a.minute) && a.minute >= 0 && a.minute < 60 && typeof a.enabled === 'boolean' &&
        Array.isArray(a.days) && a.days.length > 0 && a.days.every(d => Number.isInteger(d) && d >= 0 && d < 7) &&
        (a.oneTime === true ? /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') : true)
      ) || new Set(alarms.map(a => a.id)).size !== alarms.length) throw new Error('Invalid data');
      this.alarms = alarms;
    } catch { $('#storage-status').textContent = '保存データを読み込めませんでした。新しい設定はこの画面で利用できます。'; }
  },
  save() {
    try { localStorage.setItem(alarmKey, JSON.stringify(this.alarms)); $('#storage-status').textContent = '設定はこのブラウザに自動保存されます'; }
    catch { $('#storage-status').textContent = '保存できませんでした。設定はページを閉じると失われます。'; }
  },
  cancelPending(id) { this.snoozes = this.snoozes.filter(s => s.id !== id); },
  check(now) {
    // Catch delayed callbacks within the last minute; do not replay hours of missed alarms.
    const start = Math.max(this.lastCheck, now - 60000);
    const hits = [];
    for (const a of this.alarms) {
      if (!a.enabled) continue;
      if (a.oneTime) {
        const scheduled = new Date(`${a.date}T${pad(a.hour)}:${pad(a.minute)}:00`);
        const stamp = scheduled.getTime();
        if (stamp > start && stamp <= now && this.fired.get(a.id) !== stamp) {
          this.fired.set(a.id, stamp);
          a.enabled = false;
          this.save();
          hits.push({ type: 'alarm', id: a.id, label: `${a.date} ${pad(a.hour)}:${pad(a.minute)} のアラーム` });
        }
        continue;
      }
      for (const dayOffset of [-1, 0]) {
        const scheduled = new Date(now);
        scheduled.setDate(scheduled.getDate() + dayOffset);
        scheduled.setHours(a.hour, a.minute, 0, 0);
        const stamp = scheduled.getTime();
        if (a.days.includes(scheduled.getDay()) && stamp > start && stamp <= now && this.fired.get(a.id) !== stamp) {
          this.fired.set(a.id, stamp);
          hits.push({ type: 'alarm', id: a.id, label: `${pad(a.hour)}:${pad(a.minute)} のアラーム` });
        }
      }
    }
    this.lastCheck = now;
    const due = this.snoozes.filter(s => s.at <= now);
    this.snoozes = this.snoozes.filter(s => s.at > now);
    for (const s of due) if (this.alarms.some(a => a.id === s.id && a.enabled)) hits.push({ type: 'alarm', id: s.id, label: s.label });
    if (hits.length) UI.ring(hits);
  }
};

const TimerManager = {
  state: 'idle', total: 0, remaining: 0, end: 0,
  start(minutes) {
    const now = Date.now();
    if (this.state === 'running') this.tick(now);
    if (this.state === 'running' || this.state === 'paused') {
      const added = minutes * 60000;
      this.total += added;
      this.remaining += added;
      if (this.state === 'running') this.end += added;
      this.render();
      return;
    }
    this.total = minutes * 60000;
    this.remaining = this.total;
    this.end = now + this.total;
    this.state = 'running';
    this.render();
  },
  tick(now) {
    if (this.state !== 'running') return;
    this.remaining = Math.max(0, this.end - now);
    if (this.remaining === 0) {
      this.state = 'finished';
      UI.ring([{ type: 'timer', label: `${this.total / 60000}分のタイマーが終了しました` }]);
    }
    this.render();
  },
  pause() {
    if (this.state === 'running') {
      this.tick(Date.now());
      if (this.state === 'running') this.state = 'paused';
    } else if (this.state === 'paused') { this.end = Date.now() + this.remaining; this.state = 'running'; }
    this.render();
  },
  stop() { this.state = 'stopped'; this.remaining = 0; this.render(); },
  reset() { this.state = 'idle'; this.total = this.remaining = this.end = 0; this.render(); },
  render() {
    const seconds = Math.ceil(this.remaining / 1000);
    const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
    $('#timer-remaining').textContent = h ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    $('#timer-status').textContent = ({ idle: '準備ができたら、ひと呼吸。', running: `${this.total / 60000}分タイマー · 残り時間`, paused: '一時停止中', stopped: '停止しました', finished: '時間になりました' })[this.state];
    $('#timer-pause').textContent = this.state === 'paused' ? '再開' : '一時停止';
    $('#timer-pause').disabled = !['running', 'paused'].includes(this.state);
    $('#timer-stop').disabled = !['running', 'paused'].includes(this.state);
    $('#timer-reset').disabled = this.state === 'idle';
    $('#timer-progress').style.width = `${this.total ? this.remaining / this.total * 100 : 0}%`;
    for (const button of document.querySelectorAll('[data-minutes]')) {
      const selected = Number(button.dataset.minutes) * 60000 === this.total;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  }
};

const WeatherManager = {
  location: fixedLocation,
  controller: null,
  description(code, day) {
    if (code === 0) return day ? '☀ 晴れ' : '☾ 晴れ';
    if (code <= 2) return day ? '🌤 晴れ時々くもり' : '☁ 晴れ時々くもり';
    if (code === 3) return '☁ くもり';
    if ([45, 48].includes(code)) return '🌫 霧';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄ 雪';
    if (code >= 95) return '⛈ 雷雨';
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '☂ 雨';
    return '天気不明';
  },
  async update() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    const { latitude, longitude, name } = this.location;
    $('#weather').textContent = `${name} · 天気を取得中…`;
    try {
      const params = new URLSearchParams({ latitude, longitude, current: 'temperature_2m,weather_code,is_day', timezone: 'auto' });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error('Weather unavailable');
      const data = await response.json();
      if (!Number.isFinite(data.current?.temperature_2m) || !Number.isFinite(data.current?.weather_code)) throw new Error('Invalid weather');
      if (this.controller !== controller) return;
      const current = data.current;
      $('#weather').textContent = `${this.description(current.weather_code, current.is_day)}　${current.temperature_2m.toFixed(1)}°C　${name}`;
      const now = new Date();
      $('#weather-note').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())} 更新 · 15分ごとに自動更新`;
    } catch {
      if (this.controller !== controller) return;
      $('#weather').textContent = `${name} · 天気を取得できませんでした`;
      $('#weather-note').textContent = '15分後に再試行します。時計・アラーム・タイマーは利用できます。';
    } finally { clearTimeout(timeout); }
  },
  locate() {
    if (!navigator.geolocation) { $('#weather-note').textContent = 'このブラウザは現在地取得に対応していません。'; return; }
    $('#location').disabled = true;
    $('#weather-note').textContent = '現在地の許可を確認しています…';
    navigator.geolocation.getCurrentPosition(position => {
      this.location = { latitude: position.coords.latitude, longitude: position.coords.longitude, name: '現在地' };
      $('#location').disabled = false;
      $('#fixed-location').hidden = false;
      this.update();
    }, () => {
      $('#location').disabled = false;
      $('#weather-note').textContent = '現在地を取得できませんでした。現在の地点設定を継続します。';
    }, { timeout: 10000, maximumAge: 300000 });
  }
};

const UI = {
  editing: null,
  ringing: [],
  renderAlarms() {
    const list = $('#alarm-list');
    list.replaceChildren();
    $('#alarm-count').textContent = `${AlarmManager.alarms.length} / 10`;
    $('#alarm-add').disabled = AlarmManager.alarms.length >= 10;
    if (!AlarmManager.alarms.length) {
      list.innerHTML = '<div class="empty"><span class="empty-symbol" aria-hidden="true">◴</span><p>まだアラームはありません</p><small>朝の目覚めも、ひと休みの時間も。</small></div>';
      return;
    }
    for (const a of [...AlarmManager.alarms].sort((a, b) => a.hour - b.hour || a.minute - b.minute)) {
      const row = document.createElement('div');
      row.className = `alarm-row${a.enabled ? '' : ' off'}`;
      const time = `${pad(a.hour)}:${pad(a.minute)}`;
      const repeatLabel = a.oneTime ? `一回限り · ${a.date}` : (new Set(a.days).size === 7 ? '毎日' : [...new Set(a.days)].sort().map(d => weekdays[d]).join('・'));
      row.innerHTML = `<div class="alarm-info"><div class="alarm-time">${time}</div><div class="alarm-days">${repeatLabel}</div></div>`;
      const toggle = document.createElement('button');
      toggle.className = 'toggle'; toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-checked', String(a.enabled)); toggle.setAttribute('aria-label', `${time} のアラーム`); toggle.textContent = a.enabled ? 'ON' : 'OFF';
      toggle.onclick = () => { a.enabled = !a.enabled; if (!a.enabled) AlarmManager.cancelPending(a.id); AlarmManager.save(); this.renderAlarms(); };
      const edit = document.createElement('button'); edit.className = 'icon-button edit'; edit.textContent = '編集'; edit.setAttribute('aria-label', `${time} を編集`); edit.onclick = () => this.openEditor(a);
      const remove = document.createElement('button'); remove.className = 'icon-button delete'; remove.textContent = '削除'; remove.setAttribute('aria-label', `${time} を削除`);
      remove.onclick = () => { AlarmManager.alarms = AlarmManager.alarms.filter(item => item.id !== a.id); AlarmManager.cancelPending(a.id); AlarmManager.fired.delete(a.id); AlarmManager.save(); this.renderAlarms(); };
      row.append(toggle, edit, remove); list.append(row);
    }
  },
  openEditor(alarm = null) {
    if (!alarm && AlarmManager.alarms.length >= 10) return;
    this.editing = alarm?.id ?? null;
    $('#dialog-title').textContent = alarm ? 'アラームを編集' : 'アラームを追加';
    $('#alarm-time').value = alarm ? `${pad(alarm.hour)}:${pad(alarm.minute)}` : '07:00';
    $('#alarm-enabled').checked = alarm?.enabled ?? true;
    $('#one-time').checked = alarm?.oneTime ?? false;
    $('#alarm-date').value = alarm?.date ?? new Date().toISOString().slice(0, 10);
    this.updateOneTimeFields();
    $('#form-error').textContent = '';
    for (const input of document.querySelectorAll('#days input')) input.checked = alarm ? alarm.days.includes(Number(input.value)) : true;
    $('#alarm-dialog').showModal();
  },
  saveEditor(event) {
    event.preventDefault();
    const days = [...document.querySelectorAll('#days input:checked')].map(input => Number(input.value));
    const oneTime = $('#one-time').checked;
    if (!oneTime && !days.length) { $('#form-error').textContent = '曜日を1つ以上選んでください。'; return; }
    if (oneTime && !$('#alarm-date').value) { $('#form-error').textContent = '日付を選んでください。'; return; }
    if (!this.editing && AlarmManager.alarms.length >= 10) return;
    const [hour, minute] = $('#alarm-time').value.split(':').map(Number);
    const alarm = { id: this.editing ?? crypto.randomUUID(), hour, minute, days: oneTime ? [new Date(`${$('#alarm-date').value}T00:00:00`).getDay()] : days, date: oneTime ? $('#alarm-date').value : null, oneTime, enabled: $('#alarm-enabled').checked };
    const index = AlarmManager.alarms.findIndex(a => a.id === this.editing);
    if (index >= 0) { AlarmManager.alarms[index] = alarm; AlarmManager.cancelPending(alarm.id); }
    else AlarmManager.alarms.push(alarm);
    AlarmManager.save(); this.renderAlarms(); $('#alarm-dialog').close();
  },
  updateOneTimeFields() {
    const oneTime = $('#one-time').checked;
    $('#alarm-date').hidden = !oneTime;
    $('#alarm-date-label').hidden = !oneTime;
    $('#repeat-field').hidden = oneTime;
  },
  ring(items) {
    this.ringing.push(...items);
    $('#ring-title').textContent = this.ringing.some(i => i.type === 'alarm') ? 'アラームの時間です' : 'タイマーが終了しました';
    $('#ring-detail').textContent = this.ringing.map(i => i.label).join('\n');
    $('#ring-snooze').hidden = !this.ringing.some(i => i.type === 'alarm');
    if (!$('#ring-dialog').open) $('#ring-dialog').showModal();
    SoundManager.play();
  },
  stopRing(snooze = false) {
    if (snooze) for (const item of this.ringing) {
      if (item.type === 'alarm') {
        AlarmManager.cancelPending(item.id);
        AlarmManager.snoozes.push({ id: item.id, label: item.label, at: Date.now() + 300000 });
      }
    }
    this.ringing = []; SoundManager.stop(); $('#ring-dialog').close();
  }
};

const Clock = {
  tick() {
    const now = new Date();
    $('#clock').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    $('#clock').dateTime = now.toISOString();
    $('#date').textContent = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}（${weekdays[now.getDay()]}）`;
    AlarmManager.check(now.getTime()); TimerManager.tick(now.getTime());
  }
};

for (const [day, label] of weekdays.entries()) {
  const element = document.createElement('label'); element.className = 'day';
  element.innerHTML = `<input type="checkbox" value="${day}" aria-label="${label}曜日"><span>${label}</span>`;
  $('#days').append(element);
}
document.addEventListener('click', () => SoundManager.unlock());
document.addEventListener('keydown', () => SoundManager.unlock());
$('#alarm-add').onclick = () => UI.openEditor();
$('#alarm-form').onsubmit = event => UI.saveEditor(event);
$('#dialog-close').onclick = $('#dialog-cancel').onclick = () => $('#alarm-dialog').close();
$('#every-day').onclick = () => document.querySelectorAll('#days input').forEach(input => { input.checked = true; });
$('#one-time').onchange = () => UI.updateOneTimeFields();
$('#presets').onclick = event => { const button = event.target.closest('[data-minutes]'); if (button) TimerManager.start(Number(button.dataset.minutes)); };
$('#timer-pause').onclick = () => TimerManager.pause();
$('#timer-stop').onclick = () => TimerManager.stop();
$('#timer-reset').onclick = () => TimerManager.reset();
$('#ring-stop').onclick = () => UI.stopRing();
$('#ring-snooze').onclick = () => UI.stopRing(true);
$('#ring-dialog').addEventListener('cancel', event => { event.preventDefault(); UI.stopRing(); });
$('#location').onclick = () => WeatherManager.locate();
$('#fixed-location').onclick = () => { WeatherManager.location = fixedLocation; $('#fixed-location').hidden = true; WeatherManager.update(); };
AlarmManager.load(); UI.renderAlarms(); TimerManager.render(); Clock.tick();
setInterval(() => Clock.tick(), 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) Clock.tick(); });
WeatherManager.update(); setInterval(() => WeatherManager.update(), 15 * 60000);
