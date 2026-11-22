# InboxPage

Persönliche Benachrichtigungen: wer mich erwähnt oder mir etwas zugewiesen hat. Der Zähler sitzt in der Sidebar (und mobil als Icon in der Topbar).

## Aufbau
Titel „Inbox“, Segment „Alle / Ungelesen n“, rechts „Alle als gelesen markieren“. Darunter eine Liste (`inbox__item`): Ungelesen-Punkt in `label-blue` · Avatar · Satz („**Marco A.** hat dich bei T-139 … erwähnt“) · bei Erwähnungen das Zitat (`inbox__quote`, eingerückt mit Haarlinie) · Art und Zeit.

## Verhalten
- Klick öffnet die Aufgabe und markiert den Eintrag als gelesen; das Häkchen bei Hover markiert ohne zu öffnen.
- Gelesene Einträge: Punkt schrumpft weg (`--ease-spring`), Text tritt in `muted-foreground` zurück.
- Der Sidebar-Zähler hüpft, wenn neue Einträge ankommen.
- Ungelesen-Status ist pro Person privat gespeichert (`data/users/<id>/state`).

## Wann es eine Benachrichtigung gibt
@Erwähnung in einem Kommentar, Zuweisung als Verantwortliche/r (Detail, Tabelle oder Sammeländerung). Eigene Aktionen erzeugen nie eine Benachrichtigung.
