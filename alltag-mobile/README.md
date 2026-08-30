# Alltag v2

Mobile-first PWA für das iPhone: Finanzen, Sparziele, Auto/Tanken, Tages-Tracker, Merkliste, Goldpreis sowie Revolut- und C24-Open-Banking.

## Architektur
- lokale persönliche Daten in `localStorage`
- verschlüsselter optionaler Cloud-Sync über `/api/sync`
- Enable Banking serverseitig für Revolut und C24; private Schlüssel liegen nur als Vercel-Secret
- gemeinsamer Client-Kern `bank-v2.js` für beide Banken, Kontostände, Handoff und Buchungsimport
- endgültig gebuchte Bankumsätze werden automatisch importiert; Pending-Umsätze nicht
- Duplikat-, Gehalts-, Auto- und Eigenübertrag-Schutz
- Händlerregeln lernen aus manuellen Korrekturen
- Rückerstattungen können mit ursprünglichen Ausgaben verknüpft werden
- Offline-Shell über Service Worker

## UX
- Buchungssuche
- letzte Bankbuchungen auf der Übersicht
- Undo nach Löschen
- Touch-/Press-Feedback und reduzierte Animationen
- Bankquelle und Rückerstattungen werden an importierten Buchungen markiert

## Entwicklung
Ein beliebiger statischer Webserver reicht für den Client, z. B.:

```bash
python -m http.server 8080
```

Die `/api/*`-Routen benötigen für vollständige Funktionalität eine Vercel-Umgebung mit den konfigurierten Enable-Banking-Secrets.
