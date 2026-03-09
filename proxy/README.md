# PreisWächter — Lokaler Proxy

Dieser Proxy löst das CORS-Problem: Chrome Extensions dürfen
die Anthropic API nicht direkt aufrufen. Der Proxy läuft lokal
auf deinem PC und leitet die Anfragen weiter.

## Einrichtung (einmalig, 2 Minuten)

### 1. Node.js installieren (falls noch nicht vorhanden)
https://nodejs.org → LTS Version herunterladen und installieren

### 2. API Key eintragen
Datei `proxy.js` öffnen und diese Zeile anpassen:

    const API_KEY = 'DEIN_API_KEY';
                     ↓
    const API_KEY = 'sk-ant-api03-...';

API Key besorgen: https://console.anthropic.com → API Keys → Create Key

### 3. Proxy starten
Terminal / Eingabeaufforderung öffnen, in diesen Ordner navigieren:

    # Windows
    cd C:\Pfad\zu\preiswaechter-extension\proxy
    node proxy.js

    # Mac / Linux
    cd /pfad/zu/preiswaechter-extension/proxy
    node proxy.js

Du siehst dann:
    ╔════════════════════════════════════════╗
    ║   PreisWächter Proxy läuft  ✓          ║
    ╚════════════════════════════════════════╝

### 4. Extension neu laden
chrome://extensions → PreisWächter → Neu laden (↻)

## Automatisch starten (optional)

### Windows — Autostart
1. Win+R → `shell:startup`
2. Neue Datei `preiswaechter-proxy.bat` erstellen:
   ```
   @echo off
   cd /d "C:\Pfad\zu\proxy"
   node proxy.js
   ```
3. Datei in Autostart-Ordner legen

### Mac — Autostart mit launchd
Datei `~/Library/LaunchAgents/preiswaechter.proxy.plist` erstellen:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>preiswaechter.proxy</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/pfad/zu/proxy/proxy.js</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
```
Dann: `launchctl load ~/Library/LaunchAgents/preiswaechter.proxy.plist`

## Status prüfen
http://127.0.0.1:45678/health
→ {"status":"ok","version":"1.0.0"}

## Sicherheit
- Proxy hört nur auf 127.0.0.1 (nur dein PC, nicht Netzwerk)
- Kein API Key wird an die Extension weitergegeben
- Läuft komplett lokal, keine Drittanbieter
