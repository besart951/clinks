# Spitex: Wochenplan freigeben

Planende erstellen den Einsatzplan in Ruhe. Mitarbeitende sehen ihre Einsätze erst, wenn die Woche freigegeben
ist, und dann nur lesend.

## Wer was sieht

| Berechtigung      | Sieht                                                                  | Typische Rolle            |
| ----------------- | ---------------------------------------------------------------------- | ------------------------- |
| `spitex.read`     | den ganzen Plan samt Entwürfen, alle Klient:innen                      | Planende, Administration  |
| `spitex.write`    | wie `spitex.read`, und plant Einsätze                                  | Planende                  |
| `spitex.release`  | gibt eine Woche frei und entzieht die Freigabe (braucht `spitex.read`) | Leitung                   |
| `spitex.own.read` | nur die eigenen Einsätze freigegebener Wochen                          | «Spitex-Pflege» (Vorlage) |

Die geschützte Rolle «Benutzer» enthält jedes Leserecht, also auch den ganzen Plan. Mitarbeitende, die nur ihre
eigenen Einsätze sehen sollen, bekommen deshalb eine eigene Rolle mit nur `spitex.own.read`
(Einstellungen → Rollen → Neue Rolle, dann im Team zuweisen).

## Ablauf

1. Planen wie bisher. Die Woche steht auf «Entwurf».
2. «Woche freigeben»: Jede Person sieht unter «Meine Einsätze» ihre Einsätze dieser Woche, mit Name, Adresse und
   Telefon der Klient:in, Leistung, Ankunftsfenster und Notiz zum Einsatz. Sie bekommt eine Benachrichtigung
   und, wenn sie E-Mails eingeschaltet hat, eine Mail. In der Mail steht nur die Woche und ein Link.
3. Änderungen nach der Freigabe gelten sofort. Betroffene werden benachrichtigt (bei einer Umteilung beide), der
   Einsatz ist als «Geändert» oder «Neu» markiert. Mehrere Änderungen innert einer halben Stunde ergeben eine
   Nachricht.
4. «Freigabe entziehen»: Die Woche ist wieder ein Entwurf und verschwindet von den Geräten der Mitarbeitenden.

Offene Einsätze (noch niemandem zugewiesen) sieht auch nach der Freigabe nur die Planung.

## Technik in Kürze

- `spitex_week_releases` hält die freigegebenen Wochen (Montag, in der Zeitzone des Mandanten). Trigger setzen
  daraus `appointments.published`.
- Row-Level Security und die Sync-Streams (`spitex_planning`, `my_visits`, `visit_clients`) lesen dieses Feld.
  Entwürfe und fremde Einsätze kommen gar nicht auf das Gerät der Mitarbeitenden.
- Freigeben und Entziehen laufen über `/sync/write` und stehen im Aktivitätsprotokoll.

## Beim Einspielen

- Nach `pnpm db:migrate` das Leserecht der Replikation erneuern (neue Tabelle):
  `GRANT SELECT ON ALL TABLES IN SCHEMA public TO clinks_replication;`
- PowerSync neu starten, damit es die geänderte `sync-config.yaml` lädt.
- Bestehende Konten mit der Rolle «Benutzer» sehen weiterhin den ganzen Plan, bis sie auf die neue Rolle
  umgestellt sind.

## Tätigkeit, Bedarf und Einsatz

Eine einmalige Tätigkeit wird als Spitex-Termin mit Kontakt, aussagekräftigem Titel und bei Bedarf einer Einsatznotiz erfasst. In der Klientenakte legt die Planung einen wiederkehrenden Bedarf mit Tätigkeit, Wochentagen, Startzeit, Dauer und optionalem Ankunftsfenster an. Vor dem Speichern zeigt das Formular die Zahl der offenen Einsätze für den gewählten Zeitraum (höchstens 93 Tage). Zweimal tägliche Tätigkeiten erhalten zwei Bedarfspositionen. Geplant wird in der Zeitzone des Mandanten.

Alle erzeugten Einsätze haben dieselbe Bedarfs-ID in `appointments.series_id` und eine eigene Termin-UUID. Die Planung kann einen Einsatz verschieben, zuweisen oder absagen. Der nächste Zeitraum beginnt nach dem letzten geplanten Zeitraum und kann andere Wochentage oder Tätigkeiten verwenden. Abgeschlossene, abgesagte und individuell veränderte Termine behalten ihren Inhalt. Die Planung erzeugt keine persönlichen Zuweisungen, Abrechnungen oder Verordnungen. Für Mitarbeitende gilt die bestehende Wochenfreigabe.

### Übernahme aus Besmir

1. Originalfelder und Quell-IDs im geschützten Mapping aufbewahren. Eine Tätigkeit aus einem Namensfeld als Vorschlag am passenden Bedarf oder Einzeltermin erfassen. Kontaktadresse, private Telefonnummer und allgemeine Kontakthinweise gehören weiterhin zum Kontakt.
2. Den Kontakt über die bestätigte Identität und den Bedarf je Quellkontakt und Bedarfs-ID auflösen. Gleichnamigkeit oder ein Hinweis wie «mittags» reichen nicht zur Festlegung von Person, Wiederholung und Uhrzeit.
3. Bereits geplante Termine mit ihrer eigenen UUID, tatsächlichen Zeiten und bestätigter Bedarfs-ID übernehmen. Bei einem Snapshot über `/sync/import` werden aus Bedarfen keine zusätzlichen Termine generiert. Termine ohne bestätigte Zuordnung bleiben in der Ausnahmeliste. Bedarfe ohne bestätigte Planungsparameter bleiben zunächst im Importentwurf.
4. Vor dem Entfernen eines importierten Tätigkeitsvermerks am Kontakt die tatsächlich zugeordneten Zieltermine prüfen. Ausschliesslich den exakt übernommenen Textabschnitt entfernen. Bei fehlendem Beleg bleiben die Angaben im geschützten Zwischenstand.
5. Erst nach dem Stichtag einen neuen Zeitraum explizit planen. Vor dem Commit UUIDs und Mengen vergleichen; eine Wiederholung desselben Imports darf die Zahl der Einsätze nicht erhöhen.
