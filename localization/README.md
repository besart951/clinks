# Produktübersetzungen

`product-catalog.json` ist die einzige gepflegte Quelle für alle produktbesessenen Übersetzungen. `de-CH` ist zwingend und die Standardsprache. Deutsche Texte folgen der Schweizer Rechtschreibung: `ss` statt `ß`, Umlaute bleiben erhalten.

Weitere Locale-Werte sind optionale Überlagerungen. Fehlt ein Wert, liefert der Server den deutschen Standardtext. Die generierten TypeScript- und Go-Dateien werden mit `pnpm generate:translations` aktualisiert und dürfen nicht manuell geändert werden.

Die Datenbank enthält keine Produkt-Basiswerte. Super-Administratoren speichern dort ausschliesslich Translation Overrides; diese überlagern den Katalog zur Laufzeit.
