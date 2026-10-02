const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, timezoneId: 'Asia/Tokyo' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let weatherFails = false;
    await page.route('https://api.open-meteo.com/**', route => weatherFails ? route.fulfill({ status: 503, body: '{}' }) : route.fulfill({ json: { current: { temperature_2m: 22.4, weather_code: 3, is_day: 1 } } }));
    await page.clock.install({ time: new Date('2026-10-02T06:59:50+09:00') });
    await page.goto('http://127.0.0.1:8787');
    await page.waitForFunction(() => document.querySelector('#weather').textContent.includes('22.4'));
    assert.match(await page.locator('#date').textContent(), /2026\/10\/02（金）/);
    const originalClock = await page.locator('#clock').textContent();
    await page.clock.runFor(1000);
    assert.notEqual(await page.locator('#clock').textContent(), originalClock);

    await page.click('#alarm-add');
    await page.fill('#alarm-time', '07:00');
    await page.locator('#days input').evaluateAll(inputs => inputs.forEach(input => { input.checked = false; }));
    await page.click('#alarm-form button[type=submit]');
    assert.notEqual(await page.locator('#form-error').textContent(), '');
    await page.locator('#days label').nth(5).click();
    await page.click('#alarm-form button[type=submit]');
    assert.equal(await page.locator('.alarm-row').count(), 1);
    await page.reload();
    assert.equal(await page.locator('.alarm-row').count(), 1);
    assert.equal(await page.locator('.alarm-days').textContent(), '金');
    await page.click('#sound-enable');
    await page.waitForFunction(() => document.querySelector('#sound-enable').classList.contains('ready'));
    await page.clock.runFor(10000);
    assert.equal(await page.locator('#ring-dialog').evaluate(e => e.open), true);
    await page.waitForFunction(() => !SoundManager.audio.paused);
    assert.equal(await page.evaluate(() => SoundManager.audio.error), null);
    await page.click('#ring-snooze');
    assert.equal(await page.evaluate(() => SoundManager.audio.paused), true);
    await page.clock.fastForward(299000);
    assert.equal(await page.locator('#ring-dialog').evaluate(e => e.open), false);
    await page.clock.runFor(1000);
    assert.equal(await page.locator('#ring-dialog').evaluate(e => e.open), true);
    await page.click('#ring-stop');
    await page.clock.runFor(1000);
    assert.equal(await page.locator('#ring-dialog').evaluate(e => e.open), false);
    await page.click('.toggle');
    await page.reload();
    assert.equal(await page.locator('.toggle').getAttribute('aria-checked'), 'false');
    await page.click('.edit');
    await page.fill('#alarm-time', '08:15');
    await page.click('#every-day');
    await page.click('#alarm-form button[type=submit]');
    assert.equal(await page.locator('.alarm-time').textContent(), '08:15');
    assert.equal(await page.locator('.alarm-days').textContent(), '毎日');
    for (let i = 1; i < 10; i++) {
      await page.click('#alarm-add');
      await page.fill('#alarm-time', `09:${String(i).padStart(2, '0')}`);
      await page.click('#alarm-form button[type=submit]');
    }
    assert.equal(await page.locator('.alarm-row').count(), 10);
    assert.equal(await page.locator('#alarm-add').isDisabled(), true);
    await page.reload();
    assert.equal(await page.locator('.alarm-row').count(), 10);
    await page.locator('.delete').last().click();
    assert.equal(await page.locator('#alarm-add').isDisabled(), false);
    await page.reload();
    assert.equal(await page.locator('.alarm-row').count(), 9);

    for (const minutes of [3, 5, 10, 20, 30, 60, 120]) {
      await page.click(`[data-minutes="${minutes}"]`);
      const expected = minutes >= 60 ? `${String(minutes / 60).padStart(2, '0')}:00:00` : `${String(minutes).padStart(2, '0')}:00`;
      assert.equal(await page.locator('#timer-remaining').textContent(), expected);
    }
    await page.click('[data-minutes="3"]');
    await page.clock.runFor(2000);
    await page.click('#timer-pause');
    const paused = await page.locator('#timer-remaining').textContent();
    await page.clock.fastForward(10000);
    assert.equal(await page.locator('#timer-remaining').textContent(), paused);
    await page.click('#timer-pause');
    await page.clock.fastForward(178000);
    assert.equal(await page.locator('#timer-remaining').textContent(), '00:00');
    assert.equal(await page.locator('#ring-dialog').evaluate(e => e.open), true);
    assert.equal(await page.locator('#ring-snooze').isVisible(), false);
    await page.click('#ring-stop');
    assert.equal(await page.evaluate(() => SoundManager.audio.paused), true);
    await page.click('[data-minutes="5"]');
    await page.click('#timer-stop');
    assert.equal(await page.locator('#timer-remaining').textContent(), '00:00');
    assert.equal(await page.locator('#timer-pause').isDisabled(), true);
    await page.click('#timer-reset');
    assert.equal(await page.locator('.presets .selected').count(), 0);

    weatherFails = true;
    await page.evaluate(() => WeatherManager.update());
    assert.match(await page.locator('#weather').textContent(), /取得できません/);
    const clockBeforeFailure = await page.locator('#clock').textContent();
    await page.clock.runFor(1000);
    assert.notEqual(await page.locator('#clock').textContent(), clockBeforeFailure);
    weatherFails = false;
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 35.68, longitude: 139.76 });
    await page.click('#location');
    await page.waitForFunction(() => document.querySelector('#weather').textContent.includes('22.4') && document.querySelector('#weather').textContent.includes('現在地'));
    await page.click('#fixed-location');
    await page.waitForFunction(() => document.querySelector('#weather').textContent.includes('船橋市') && document.querySelector('#weather').textContent.includes('22.4'));

    // Keep representative rows for visual review.
    while (await page.locator('.alarm-row').count() > 3) await page.locator('.delete').last().click();
    await page.click('[data-minutes="5"]');
    fs.mkdirSync('tmp', { recursive: true });
    await page.screenshot({ path: 'tmp/desktop.png', fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: 'tmp/mobile.png', fullPage: true });
    await page.click('#alarm-add');
    assert.equal(await page.evaluate(() => document.querySelector('#alarm-dialog').getBoundingClientRect().right <= innerWidth), true);
    await page.screenshot({ path: 'tmp/mobile-dialog.png', fullPage: true });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#alarm-dialog').evaluate(e => e.open), false);

    // Specific weekday filtering and disabled alarms must suppress notifications.
    await page.evaluate(() => localStorage.setItem('clockApp.alarms', JSON.stringify([
      { id: 'wrong-day', hour: 11, minute: 0, days: [6], enabled: true },
      { id: 'disabled', hour: 11, minute: 0, days: [5], enabled: false }
    ])));
    await page.clock.setSystemTime(new Date('2026-10-02T10:59:59+09:00'));
    await page.reload();
    await page.clock.runFor(2000);
    assert.equal(await page.locator('#ring-dialog').evaluate(e => e.open), false);
    await page.evaluate(() => localStorage.setItem('clockApp.alarms', 'broken JSON'));
    await page.reload();
    assert.match(await page.locator('#storage-status').textContent(), /読み込めません/);
    assert.equal(await page.locator('.alarm-row').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: clock/date, alarm validation/CRUD/10-limit/persistence/weekdays/disabled/ring/snooze/audio stop, seven timers/pause/resume/stop/reset/expiry, weather success/failure/geolocation, mobile layout, storage corruption; no page errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
