# Anleitung: Veröffentlichen und auf dem iPad installieren

Du brauchst einmalig etwa 15 Minuten, einen Windows-PC und ein kostenloses GitHub-Konto.

**Zum Datenschutz:** Auf GitHub liegt nur das Programm, das jeder sehen kann. Deine Namen, Adressen und Beträge gibst du erst auf dem iPad ein. Sie bleiben dort und werden nirgendwohin übertragen.

## Teil 1: App bei GitHub veröffentlichen (am PC)

1. Öffne [github.com](https://github.com) und erstelle über **Sign up** ein kostenloses Konto. Merke dir deinen Benutzernamen.
2. Klicke oben rechts auf **+** und dann auf **New repository**.
3. Trage bei **Repository name** ein: `nebenkosten`
4. Wähle **Public** und klicke unten auf **Create repository**.
5. Klicke auf der neuen Seite auf den Link **uploading an existing file**.
6. Öffne im Windows-Explorer den Ordner `nebenkosten-app`. Markiere darin mit **Strg + A** alles und ziehe es in das Browserfenster.
   Wichtig: den Inhalt des Ordners ziehen, nicht den Ordner selbst. Die Datei `index.html` muss danach ganz oben in der Liste stehen.
7. Warte, bis alle Dateien aufgelistet sind, und klicke unten auf **Commit changes**.
8. Klicke oben auf **Settings** und links auf **Pages**.
9. Wähle unter **Branch** den Eintrag **main**, daneben **/ (root)**, und klicke auf **Save**.
10. Warte 1 bis 2 Minuten und lade die Seite neu. Oben erscheint deine Adresse:
    `https://DEINNAME.github.io/nebenkosten/`

## Teil 2: Auf dem iPad installieren

1. Öffne die Adresse auf dem iPad in **Safari**.
2. Tippe oben auf das **Teilen-Symbol** (Quadrat mit Pfeil nach oben).
3. Tippe auf **Zum Home-Bildschirm** und dann auf **Hinzufügen**.
4. Starte die App ab jetzt **immer über das neue Symbol** auf dem Home-Bildschirm.
   Die installierte App und ein Safari-Tab haben getrennte Speicher. Daten aus dem einen sind im anderen nicht sichtbar.
5. Trage unter **Stammdaten** deine Angaben ein.

Zum Ausprobieren ist bereits eine Beispielabrechnung 2025 mit erfundenen Daten angelegt. Sie kann im Jahr über **Löschen** entfernt werden.

**Offline-Test:** Öffne die App einmal mit Internet, schalte dann den Flugmodus ein und starte sie erneut.

## Regelmäßig sichern

Safari kann lokale Daten löschen, außerdem sind sie weg, wenn das iPad verloren geht oder die App entfernt wird.

1. Tippe in der App unten auf **Sicherung** und dann auf **Daten sichern**.
2. Tippe auf **Teilen** und dann auf **In Dateien sichern**.
3. Wähle **iCloud Drive** und tippe auf **Sichern**.

Sichere am besten nach jeder Eingabe-Sitzung, mindestens monatlich. Zum Zurückholen: **Sicherung**, dann **Datei auswählen und wiederherstellen**.

## PDF oder Word speichern

1. Öffne das Jahr und tippe auf **Ergebnis und Export**.
2. Tippe unten auf **Als PDF erstellen** oder **Als Word erstellen**.
3. Tippe auf **Teilen** und dann auf **In Dateien sichern**, oder wähle dort direkt Mail oder Drucken.

## Später eine neue Version einspielen

Öffne dein Repository bei GitHub, klicke auf **Add file** und **Upload files**, ziehe die geänderten Dateien hinein und klicke auf **Commit changes**. Die App lädt die neue Version beim nächsten Start mit Internet. Deine Daten bleiben erhalten.

## Für Fortgeschrittene: Tests ausführen

Im Ordner `nebenkosten-app` mit installiertem Node.js:

```bash
npm test
```
