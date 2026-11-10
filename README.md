# FRAME – Bilder und Videos teilen

Eine deutsche, responsive Projektgalerie für **MaximilianBoller/share**. Die Website läuft auf GitHub Pages, Medien und Projektverzeichnis liegen im selben Repository. Kein Cloudflare und kein eigener Server notwendig.

## Funktionen

- Projekte mit Titel und Beschreibung erstellen.
- Bilder und Videos per Dateiauswahl oder Drag-and-drop hochladen.
- Bilder in einer großen Vorschau ansehen; mit Pfeiltasten durchblättern.
- Videos direkt abspielen; Browserunterstützung hängt vom Video-Codec ab. MP4 mit H.264 ist eine gute Ausgangsbasis, MOV spielt nicht jeder Browser ab.
- Nach Bildern/Videos filtern und nach Dateinamen suchen.
- Einzelne Originale herunterladen oder alle Dateien als ZIP speichern.
- Einen direkten Projektlink kopieren und weitergeben. Empfänger benötigen keine Anmeldung.
- Dateien und Projekte aus der aktuellen Website entfernen.

## Öffentlichkeit und Grenzen

**Alle Dateien, Projekte und frühere Git-Versionen sind öffentlich. Projektlinks sind keine Zugangskontrolle.** Das ist bewusst die reine GitHub-Variante. `noindex` ist nur ein Hinweis für Suchmaschinen.

Die Anwendung erlaubt höchstens **90 MiB je Datei** und **850 MiB Medien insgesamt**, damit Platz für die Website innerhalb des 1-GB-Pages-Limits bleibt. GitHub blockiert Repository-Dateien über 100 MiB. Bei vielen oder großen Videos ist ein zusätzlicher Objektspeicher geeigneter. Entfernte Dateien bleiben in der Git-Historie und können weiterhin Speicher belegen und heruntergeladen werden.

Für ZIP-Downloads können Chrome und Edge am Computer direkt auf die Festplatte schreiben. Andere Browser bauen das ZIP im Arbeitsspeicher auf; ab 400 MiB fordert die Anwendung deshalb Chrome/Edge oder einzelne Downloads an. Dateien werden im ZIP unverändert gespeichert, ohne erneute verlustbehaftete Komprimierung.

## Website veröffentlichen

1. Den Inhalt dieses Ordners ins **Wurzelverzeichnis** des öffentlichen Repositories `MaximilianBoller/share` auf Branch `main` übertragen.
2. In GitHub **Settings → Pages → Build and deployment → Source → GitHub Actions** wählen.
3. Unter **Actions** den Workflow „Website auf GitHub Pages veröffentlichen“ ausführen, falls er nicht bereits durch den Push läuft.
4. Die Website ist unter **https://maximilianboller.github.io/share/** erreichbar, sobald der Workflow erfolgreich abgeschlossen ist.

Der Workflow installiert reproduzierbar die Abhängigkeiten, führt Tests aus, baut JavaScript und veröffentlicht ausschließlich `public/`. Eigene Medien werden automatisch mit veröffentlicht. Es werden keine Tokens oder andere Secrets mitgeliefert.

Für ein anderes Repository `public/config.js` anpassen. Die Website funktioniert sowohl unter einem Repository-Unterpfad als auch mit eigener Domain. Die Dateien nicht per `file://` öffnen; zum lokalen Ausprobieren den Entwicklungsserver verwenden.

## Hochladen über die Website

1. Unter GitHub **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token** einen zeitlich begrenzten Token für **ausschließlich `share`** erstellen.
2. Repository permission: **Contents → Read and write**. Keine Berechtigung für Administration, Workflows oder andere Repositories nötig. Metadata-Lesezugriff wird von GitHub automatisch vergeben.
3. Auf der Website **Verwalten** wählen und den Token eingeben.
4. **Neues Projekt** wählen, Titel eingeben und speichern.
5. Bilder/Videos hineinziehen oder auswählen. Nach dem Upload **1–3 Minuten** auf die Veröffentlichung durch GitHub Actions warten. Status bei Bedarf unter `https://github.com/MaximilianBoller/share/actions` ansehen.
6. **Link teilen** kopiert die Projektadresse. Besucher können sofort nach der Veröffentlichung ansehen und herunterladen.

Der Token bleibt ausschließlich im JavaScript-Arbeitsspeicher des aktuellen Tabs. Er wird nur in Authorization-Headern an `api.github.com` gesendet. Er steht weder im Repository noch in Browser-Storage, Projektlinks oder Medien-Anfragen. Beim Neuladen oder Abmelden wird eine erneute Anmeldung nötig. Keine Tokens in `config.js` eintragen.

Ein Upload erzeugt zuerst Git-Blobs und veröffentlicht anschließend Dateien plus Projektverzeichnis **atomar in einem Commit**. Ein zwischenzeitlich geänderter Branch wird nicht überschrieben. Bei einer Konfliktmeldung neu laden und erneut versuchen; unveröffentlichte Blobs werden nicht im Projekt angezeigt.

## Lokal entwickeln

Node.js 20 oder neuer, empfohlen Node.js 22:

```powershell
npm ci
npm test
npm run build
npm run dev
```

Vorschau: `http://localhost:5173`. Nach Änderungen an `src/` erneut `npm run build` ausführen und die Seite neu laden. Die Entwicklungsseite verwendet dasselbe konfigurierte Repository; echte Uploads ändern deshalb auch dort das Repository.

## Dateien

- `public/config.js`: öffentlicher Repository-Name.
- `public/data/projects.json`: Projektverzeichnis.
- `public/media/<projekt-id>/`: Originaldateien nach dem Hochladen.
- `src/app.js`: Oberfläche, Uploads und Downloads.
- `src/core.js`: GitHub-API, Validierung und atomare Commits.
- `.github/workflows/pages.yml`: Tests, Build und Pages-Deployment.

## Dokumentation

- [GitHub Pages – Limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [GitHub API – Datei-Inhalte](https://docs.github.com/en/rest/repos/contents)
- [GitHub API – Git-Datenbank](https://docs.github.com/en/rest/git)
- [Fine-grained Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

Ohne Backend lässt sich der angemeldete GitHub-Account des Browsers nicht automatisch als Upload-Anmeldung wiederverwenden. Dafür ist der auf dieses Repository begrenzte Token vorgesehen.
