# Oclock

A lightweight clock, recurring alarm, timer, and weather dashboard built with plain HTML, CSS, and JavaScript. The interface is in Japanese.

[日本語の使い方](docs/README.ja.md)

## Run locally

Serve this directory with any static HTTP server, for example:

```sh
python -m http.server 8787 --bind 127.0.0.1
```

Open http://localhost:8787. No build step or runtime dependencies are required. Use localhost or HTTPS for geolocation. Static hosting (including GitHub Pages) is supported.

## Features

- Large 24-hour clock, local date and weekday, updated from the device clock.
- Up to ten recurring alarms with weekday selection, enable/disable, editing, deletion, and automatic localStorage persistence.
- Stop controls and a five-minute snooze for alarms.
- Instant 3, 5, 10, 20, 30, 60, and 120-minute timers, with pause, resume, stop, and reset.
- Deadline-based timer accounting to avoid accumulated interval drift.
- Weather and temperature from [Open-Meteo](https://open-meteo.com/en/docs), refreshed every fifteen minutes. The default location is Funabashi, Japan; users may explicitly request geolocation.
- Responsive desktop and mobile layouts, keyboard controls, and bundled original notification audio.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Japanese interface and dialogs |
| `style.css` | Responsive styling |
| `app.js` | Clock, alarms, timer, weather, audio, and UI |
| `sounds/alarm.mp3` | Original synthesized alarm sound (MIT) |
| `tests/browser.cjs` | Browser acceptance checks using Playwright |

## Behavior and limitations

Keep the page open and the device awake to receive alerts. Closed browsers and sleeping devices cannot ring reliably; background tabs may delay callbacks. Alarms delayed by up to one minute are recognized once; older missed alarms are not replayed. Timers recognize completion on the next available callback. The operating system controls volume and silent mode.

The first click or key press enables audio when allowed by the browser. The top-right button reports audio readiness; blocked playback is also reported in the ringing dialog. Verify sound on your device before relying on an alarm.

Only alarm settings are persisted, under `clockApp.alarms`. Timers, snoozes, and geolocation selections last for the current page session. Storage is specific to the site origin; clearing site data removes alarms. Storage failures are shown on screen. Weather failures do not interrupt the clock, alarms, or timer.

Change `fixedLocation` in `app.js` for a different fixed installation. Geolocation coordinates are sent to Open-Meteo only after the user requests current-location weather. Weather uses the provider's current model data and requires internet access. Review [Open-Meteo's terms](https://open-meteo.com/en/terms) for your deployment; the application's MIT license does not replace API service terms.

## Verification

With a local server running on port 8787, run `node tests/browser.cjs` in an environment with Playwright installed. The test uses installed Chrome on Windows by default; set `CHROME_PATH` to override it. It controls browser time and mocks weather for deterministic checks. Screenshots are saved in ignored `tmp/`.

## License

[MIT](LICENSE), including the original notification audio. The local specification PDF and temporary verification files are excluded from Git.
