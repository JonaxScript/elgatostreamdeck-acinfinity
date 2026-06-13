# AC Infinity Sensor — Stream Deck Plugin

Displays **live temperature and humidity** from your AC Infinity controller directly on an Elgato Stream Deck key. Data is fetched from the official AC Infinity cloud API and refreshes automatically at a configurable interval.

---

## Features

- Live temperature (°C or °F) and humidity on the key
- Offline indicator when the device is unreachable
- Manual refresh by pressing the key
- Configurable refresh interval (10 s – 60 min)
- Font size presets: Small / Medium / Large / Extra Large / Custom
- Custom font size inputs for full control over temp and humidity text size
- Debug log with live output in the Property Inspector
- Fallback credentials via `config.js` file (no UI login required)

---

## Requirements

- Elgato Stream Deck software **6.0** or newer
- Windows 10 / macOS 10.11 or newer
- An AC Infinity account with at least one controller

---

## Installation

1. Close Stream Deck if it is open.
2. Run `install.ps1` (right-click → *Run with PowerShell*).  
   The script copies the plugin and restarts Stream Deck automatically.
3. Drag the **AC Infinity → Temperature & Humidity** action onto a key.

---

## Configuration

Open the Property Inspector by clicking the key in Stream Deck software.

| Field | Description |
|---|---|
| Email Address | Your AC Infinity account e-mail |
| Password | Your AC Infinity account password (max. 25 characters) |
| Device Index | `0` = first device, `1` = second, … |
| Temperature Unit | °C or °F |
| Font Size | Small / Medium / Large / Extra Large / Custom |
| Temp Size (px) | Visible when **Custom** is selected — temperature text size |
| Humidity Size (px) | Visible when **Custom** is selected — humidity text size |
| Refresh Interval | How often to poll the API (seconds) |
| Debug Log | Shows a live log inside the Property Inspector |

### Alternative: config.js

If you prefer not to enter credentials in the UI, edit `config.js` inside the plugin folder:

```js
window.AC_INFINITY_CONFIG = {
    email:           "your@email.com",
    password:        "YourPassword",
    deviceIndex:     0,
    tempUnit:        "C",
    refreshInterval: 30
};
```

Restart Stream Deck after saving.

---

## File Structure

```
com.acinfinity.sensor.sdPlugin/
├── manifest.json       Plugin manifest (SDK v2)
├── plugin.html         Plugin entry point (headless)
├── plugin.js           Main plugin logic & API communication
├── pi.html             Property Inspector UI
├── config.js           Optional fallback credentials
└── images/             Action and category icons
```

---

## API Notes

- Host: `http://www.acinfinityserver.com`
- Login endpoint uses the parameter `appPasswordl` (intentional typo in the AC Infinity API)
- Auth token (`appId`) is sent as a `token` header on subsequent requests
- Temperature is stored as integer × 100 (e.g. `2417` = 24.17 °C)
- User-Agent must be `okhttp/4.12.0`

---

## Troubleshooting

**Key shows nothing / "config.js or settings required"**  
→ Enter your credentials in the Property Inspector and save.

**NaN on temperature or humidity**  
→ Check the Device Index — try `0`, `1`, `2` until the correct device appears.

**Login error**  
→ Verify your e-mail and password. Note: only the first 25 characters of the password are used by the API.

**Debug log is empty**  
→ Enable the *Debug Log* toggle in the Property Inspector. The log is cleared every time Stream Deck restarts.
