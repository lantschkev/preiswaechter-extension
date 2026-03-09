# 👁 PreisWächter

> Chrome Extension zur Preisüberwachung deines Amazon.it Warenkorbs — mit KI-gestützter Kaufempfehlung.

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Node.js](https://img.shields.io/badge/Proxy-Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Claude API](https://img.shields.io/badge/KI-Claude%20API-cc785c?style=flat-square)](https://console.anthropic.com)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

---

## Was es macht

PreisWächter liest deinen Amazon-Warenkorb automatisch aus, verfolgt den Preisverlauf und analysiert mit Claude KI den besten Kaufzeitpunkt.

```
Warenkorb öffnen → Button klicken → Artikel importiert → KI analysiert → Alert bei günstigstem Preis
```

---

## Features

| Feature | Details |
|---|---|
| 🛒 **Warenkorb-Import** | Automatisches Auslesen direkt von amazon.it |
| 📊 **Preisverlauf** | 90-Tage-Historie mit Mini-Charts pro Artikel |
| 🤖 **KI-Analyse** | Kaufempfehlung via Claude — ACQUISTA / ASPETTA / TROPPO CARO |
| 🎯 **Zielpreis** | Individuell pro Artikel, mit Alert bei Erreichen |
| 🔔 **Notifications** | Browser-Push bei Preisabfall, hist. Tief, KI-Score ≥ 65 |
| 🌙 **Dark / Light Mode** | Persistent gespeichert, jederzeit umschaltbar |
| 🔒 **Lokal & privat** | API Key verlässt deinen PC nie |

---

## Voraussetzungen

- [Google Chrome](https://www.google.com/chrome/) 88+
- [Node.js](https://nodejs.org) 16+ (für den lokalen KI-Proxy)
- [Anthropic API Key](https://console.anthropic.com) (für KI-Analyse)

---

## Installation

### 1 — Extension in Chrome laden

```
chrome://extensions  →  Entwicklermodus AN  →  „Entpackte Erweiterung laden"  →  diesen Ordner wählen
```

### 2 — Proxy einrichten

```bash
cd proxy
cp proxy.example.js proxy.js
```

`proxy.js` öffnen und deinen API Key eintragen:

```js
const API_KEY = 'sk-ant-api03-...';   // console.anthropic.com → API Keys
```

Proxy starten:

```bash
node proxy.js
```

### 3 — Benutzen

1. Extension-Icon klicken → **„Warenkorb öffnen"**
2. Bei Amazon.it einloggen und Warenkorb aufrufen
3. Orangenen **„Importa carrello"** Button unten rechts klicken
4. Artikel erscheinen in der Watchlist — KI-Analyse per Klick verfügbar

---

## Projektstruktur

```
preiswaechter-extension/
├── manifest.json          # Chrome Extension Manifest V3
├── content.js             # Liest Amazon-Warenkorb aus
├── background.js          # Service Worker, Alarms, Storage
├── popup.html             # Extension Popup UI
├── popup.js               # Popup Logik (CSP-konform, kein inline JS)
├── icons/                 # Extension Icons (16, 48, 128px)
└── proxy/
    ├── proxy.js           # Lokaler CORS-Proxy (nicht im Repo)
    ├── proxy.example.js   # Vorlage ohne API Key
    └── README.md          # Proxy Setup & Autostart
```

---

## KI-Score Algorithmus

Der Kaufscore (0–100) berechnet sich aus vier Faktoren:

| Faktor | Gewicht | Logik |
|---|---|---|
| Position im Preis-Range | 40 Pkt | Sanfte Kurve — am Tief = voll, am Hoch = 0 |
| vs. 90-Tage-Durchschnitt | 25 Pkt | Unter Schnitt = voll, bis 10% drüber = anteilig |
| Kurzzeit-Trend (14 Tage) | 20 Pkt | Preis fällt = 20, steigt = 0 |
| Zielpreis erreicht | 15 Pkt | Bonus auch wenn bis 10% darüber |

```
ACQUISTA ≥ 65   |   ASPETTA 42–64   |   TROPPO CARO < 42
```

---

## Proxy & Sicherheit

Die Anthropic API erlaubt aus Sicherheitsgründen keine direkten Requests aus Chrome Extensions (CORS). Der Proxy löst das lokal:

```
Extension  →  http://127.0.0.1:45678  →  api.anthropic.com
```

- Hört ausschließlich auf `127.0.0.1` — nicht im Netzwerk erreichbar
- `proxy.js` ist in `.gitignore` — API Key wird nie ins Repository gepusht
- Die Extension selbst kennt den API Key nicht

### Proxy automatisch starten

**Windows** — `.bat` Datei in den Autostart-Ordner legen (`Win+R` → `shell:startup`):

```bat
@echo off
cd /d "C:\Pfad\zu\proxy"
node proxy.js
```

**macOS** — LaunchAgent unter `~/Library/LaunchAgents/preiswaechter.proxy.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>preiswaechter.proxy</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/pfad/zu/proxy/proxy.js</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
```

---

## Lizenz

MIT © [lantschkev](https://github.com/lantschkev)
