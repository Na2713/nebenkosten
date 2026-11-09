import test from 'node:test';
import assert from 'node:assert/strict';
import {
  berechneAbrechnung, berechnePosition, fristAbgelaufen, fristEnde, inCent, pruefeZeitraum,
  tageImJahr, tageImZeitraum, vorschlagVorauszahlung, zeitanteil,
} from '../js/calc.js';
import { datum, euro, leseZahl, prozent } from '../js/format.js';
import { APP_KENNUNG, beispielJahr, jahrAusVorlage, leereStammdaten, neuePosition, neuesJahr, pruefeSicherung } from '../js/model.js';
import { erstelleBericht } from '../js/bericht.js';

const stamm = leereStammdaten();
const personen = { haupt: 4, einlieger: 1 };
const pos = (schluessel, betrag, extra = {}) => neuePosition('Test', schluessel, { betrag, ...extra });

test('Pflichtfall: Flächenanteil 77,01 / 264,70 = 29,09 %', () => {
  const p = berechnePosition(pos('flaeche', 1000), stamm, personen, 1);
  assert.equal(p.gesamtEinheiten.toFixed(2), '264.70');
  assert.equal(p.mieterEinheiten, 77.01);
  assert.equal(prozent(p.anteilProzent), '29,09 %');
});

test('Pflichtfall: Personenanteil 1 / 5 = 20 %', () => {
  const p = berechnePosition(pos('personen', 500), stamm, personen, 1);
  assert.equal(p.gesamtEinheiten, 5);
  assert.equal(prozent(p.anteilProzent), '20,00 %');
  assert.equal(p.mieterCent, 10000);
});

test('Es wird mit dem exakten Bruch gerechnet, nicht mit 29,09 %', () => {
  const p = berechnePosition(pos('flaeche', 1000), stamm, personen, 1);
  assert.equal(p.mieterCent, 29093);
});

test('Hauptwohnung: 199,59 abzüglich 11,90 ergibt die voreingestellten 187,69 m²', () => {
  assert.equal((199.59 - 11.9).toFixed(2), stamm.flaechen.haupt.toFixed(2));
});

test('Geldformat ist deutsch', () => {
  assert.equal(euro(123456), '1.234,56 €');
  assert.equal(euro(5), '0,05 €');
  assert.equal(euro(100000000), '1.000.000,00 €');
  assert.equal(euro(-123456), '-1.234,56 €');
});

test('Datumsformat ist deutsch', () => assert.equal(datum('2025-03-07'), '07.03.2025'));

test('Kaufmännische Rundung ohne Binärbruch-Fehler', () => {
  assert.equal(inCent(1.005), 101);
  assert.equal(inCent(0.285), 29);
  assert.equal(inCent(1.004), 100);
  assert.equal(inCent(-1.005), -101);
});

test('Eingaben werden deutsch und tolerant gelesen', () => {
  assert.equal(leseZahl('1.234,56'), 1234.56);
  assert.equal(leseZahl('1234,56'), 1234.56);
  assert.equal(leseZahl('1234.56'), 1234.56);
  assert.equal(leseZahl('1.234'), 1234);
  assert.equal(leseZahl('0.325'), 0.325);
  assert.equal(leseZahl('0,3214'), 0.3214);
  assert.equal(leseZahl(''), 0);
  assert.equal(leseZahl('abc'), null);
});

test('Monatswert wird im vollen Jahr mit 12 multipliziert', () => {
  const p = berechnePosition(pos('mieterin', 100, { intervall: 'monat' }), stamm, personen, 1);
  assert.equal(p.gesamtCent, 120000);
});

test('Volles Jahr ergibt Faktor 1, auch im Schaltjahr', () => {
  assert.deepEqual(zeitanteil('2024-01-01', '2024-12-31'), { tage: 366, tageJahr: 366, faktor: 1, voll: true });
  assert.equal(zeitanteil('2025-01-01', '2025-12-31').faktor, 1);
  assert.equal(tageImJahr(2024), 366);
  assert.equal(tageImJahr(2025), 365);
});

test('Tage werden einschließlich Anfang und Ende gezählt, über die Zeitumstellung hinweg', () => {
  assert.equal(tageImZeitraum('2025-07-01', '2025-12-31'), 184);
  assert.equal(tageImZeitraum('2025-03-01', '2025-03-31'), 31);
  assert.equal(tageImZeitraum('2025-05-15', '2025-05-15'), 1);
});

test('Kürzerer Zeitraum: Jahres- und Monatswerte anteilig nach Tagen', () => {
  const { faktor } = zeitanteil('2025-07-01', '2025-12-31');
  assert.equal(berechnePosition(pos('mieterin', 365), stamm, personen, faktor).gesamtCent, 18400);
  // 100 € × 12 × 184 / 365 = 604,93 €
  assert.equal(berechnePosition(pos('mieterin', 100, { intervall: 'monat' }), stamm, personen, faktor).gesamtCent, 60493);
});

function zaehler(v) {
  const p = neuePosition('Strom', 'verbrauch');
  Object.assign(p.verbrauch, { art: 'zaehler', ...v });
  return p;
}

test('Zähler: Verbrauch aus Ständen, Arbeitspreis und Grundpreis', () => {
  const p = berechnePosition(zaehler({ anfang: 1000, ende: 3500, preis: 0.32, grundpreis: 5, grundpreisIntervall: 'monat' }), stamm, personen, 1);
  assert.equal(p.verbrauch, 2500);
  assert.equal(p.gesamtCent, 86000);
  assert.equal(p.mieterCent, 86000);
  assert.equal(p.anteilProzent, 100);
});

test('Zähler: Arbeitspreis bleibt bei kürzerem Zeitraum ungekürzt, nur der Grundpreis wird anteilig', () => {
  const { faktor } = zeitanteil('2025-07-01', '2025-12-31');
  const p = berechnePosition(zaehler({ anfang: 0, ende: 1000, preis: 0.3, grundpreis: 365, grundpreisIntervall: 'jahr' }), stamm, personen, faktor);
  assert.equal(p.gesamtCent, 30000 + 18400);
});

test('Zähler: Stand am Ende kleiner als am Anfang erzeugt Warnung und 0 Verbrauch', () => {
  const hinweise = [];
  const p = berechnePosition(zaehler({ anfang: 500, ende: 400, preis: 0.3 }), stamm, personen, 1, hinweise);
  assert.equal(p.verbrauch, 0);
  assert.equal(hinweise.length, 1);
});

test('Verbrauch als Anteil am Gesamtverbrauch', () => {
  const p = pos('verbrauch', 400);
  Object.assign(p.verbrauch, { art: 'anteil', gesamt: 200, mieter: 50, einheit: 'm³' });
  const e = berechnePosition(p, stamm, personen, 1);
  assert.equal(e.mieterCent, 10000);
  assert.equal(e.einheit, 'm³');
});

test('Fester Prozentsatz und 100 % Mieterin', () => {
  assert.equal(berechnePosition(pos('prozent', 200, { prozent: 25 }), stamm, personen, 1).mieterCent, 5000);
  assert.equal(berechnePosition(pos('mieterin', 200), stamm, personen, 1).mieterCent, 20000);
});

test('Null Personen führen nicht zu einem Rechenfehler', () => {
  const hinweise = [];
  const e = berechnePosition(pos('personen', 100), stamm, { haupt: 0, einlieger: 0 }, 1, hinweise);
  assert.equal(e.mieterCent, 0);
  assert.equal(hinweise.length, 1);
});

test('Vorschlag Vorauszahlung: durch 12, auf volle Euro aufgerundet', () => {
  assert.equal(vorschlagVorauszahlung(120000, 365, 365), 100);
  assert.equal(vorschlagVorauszahlung(120001, 365, 365), 101);
  assert.equal(vorschlagVorauszahlung(0, 365, 365), 0);
});

test('Vorschlag Vorauszahlung: Sicherheitszuschlag', () => {
  assert.equal(vorschlagVorauszahlung(100000, 365, 365, 10), 92);
  assert.equal(vorschlagVorauszahlung(120000, 365, 365, 10), 110);
});

test('Vorschlag Vorauszahlung: kürzerer Zeitraum wird auf 12 Monate hochgerechnet', () => {
  // 600 € für 184 von 365 Tagen: 600 × 365 / 184 / 12 = 99,18 €
  assert.equal(vorschlagVorauszahlung(60000, 184, 365), 100);
});

test('Abrechnung: Summe aus gerundeten Zeilen, Nachzahlung', () => {
  const j = neuesJahr(2025);
  j.kosten = [pos('flaeche', 1000), pos('personen', 500)];
  j.sonstige = [];
  j.vorauszahlungen = 100;
  const r = berechneAbrechnung(j, stamm);
  assert.equal(r.summeBetriebskostenCent, 29093 + 10000);
  assert.equal(r.saldoCent, 29093);
  assert.equal(r.ergebnisArt, 'Nachzahlung');
});

test('Abrechnung: Guthaben und Ausgeglichen', () => {
  const j = neuesJahr(2025);
  j.kosten = [pos('mieterin', 100)];
  j.sonstige = [];
  j.vorauszahlungen = 150;
  assert.equal(berechneAbrechnung(j, stamm).ergebnisArt, 'Guthaben');
  assert.equal(berechneAbrechnung(j, stamm).saldoCent, -5000);
  j.vorauszahlungen = 100;
  assert.equal(berechneAbrechnung(j, stamm).ergebnisArt, 'Ausgeglichen');
});

test('Sonstige Kosten: nicht in Betriebskosten, aber im Gesamtbetrag, nicht in der Vorauszahlung', () => {
  const j = neuesJahr(2025);
  j.kosten = [pos('mieterin', 1200)];
  j.sonstige = [pos('mieterin', 20, { intervall: 'monat' })];
  j.vorauszahlungen = 1000;
  const r = berechneAbrechnung(j, stamm);
  assert.equal(r.summeBetriebskostenCent, 120000);
  assert.equal(r.saldoCent, 20000);
  assert.equal(r.summeSonstigeCent, 24000);
  assert.equal(r.gesamtbetragCent, 44000);
  assert.equal(r.neueVorauszahlungEuro, 100);
});

test('§ 35a: Rechnungslohn wird nach Schlüssel auf die Mieterin umgelegt', () => {
  const p = pos('flaeche', 500);
  p.p35a = { aktiv: true, art: 'euro', wert: 300 };
  assert.equal(berechnePosition(p, stamm, personen, 1).lohnMieterCent, 8728);
});

test('§ 35a: Lohn als Prozent der Kosten und anteilig bei kürzerem Zeitraum', () => {
  const p = pos('mieterin', 365);
  p.p35a = { aktiv: true, art: 'prozent', wert: 50 };
  const e = berechnePosition(p, stamm, personen, zeitanteil('2025-07-01', '2025-12-31').faktor);
  assert.equal(e.gesamtCent, 18400);
  assert.equal(e.lohnMieterCent, 9200);
  const p2 = pos('mieterin', 365);
  p2.p35a = { aktiv: true, art: 'euro', wert: 365 };
  assert.equal(berechnePosition(p2, stamm, personen, zeitanteil('2025-07-01', '2025-12-31').faktor).lohnMieterCent, 18400);
});

test('§ 35a: Aufstellung und Summe in der Abrechnung', () => {
  const j = beispielJahr();
  const r = berechneAbrechnung(j, j.stammdatenBeispiel);
  assert.equal(r.paragraph35a.length, 2);
  assert.equal(r.summe35aCent, r.paragraph35a.reduce((s, p) => s + p.lohnMieterCent, 0));
});

test('Abrechnungsfrist: 12 Monate nach Ende, Ablauf erst am Folgetag', () => {
  assert.equal(fristEnde('2024-12-31'), '2025-12-31');
  assert.equal(fristEnde('2024-02-29'), '2025-02-28');
  assert.equal(fristAbgelaufen('2024-12-31', '2025-12-31'), false);
  assert.equal(fristAbgelaufen('2024-12-31', '2026-01-01'), true);
});

test('Zeitraum wird geprüft', () => {
  assert.equal(pruefeZeitraum(2025, '2025-01-01', '2025-12-31'), null);
  assert.match(pruefeZeitraum(2025, '2025-06-01', '2025-05-01'), /vor dem Anfang/);
  assert.match(pruefeZeitraum(2025, '2024-06-01', '2025-05-01'), /Kalenderjahr 2025/);
});

test('Standardjahr hat die vorgegebenen Kostenarten und Schlüssel', () => {
  const j = neuesJahr(2023);
  assert.deepEqual(j.kosten.map((k) => k.schluessel), ['flaeche', 'flaeche', 'flaeche', 'personen', 'personen', 'personen', 'verbrauch', 'flaeche']);
  assert.deepEqual(j.personen, { haupt: 4, einlieger: 1 });
  assert.equal(j.vorauszahlungen, 0);
  assert.equal(j.zuschlagProzent, 0);
  assert.equal(j.von, '2023-01-01');
  assert.equal(j.bis, '2023-12-31');
});

test('Vorlage: Beträge übernommen, neue IDs, Zählerstand wird fortgeschrieben', () => {
  const alt = beispielJahr();
  alt.von = '2025-03-01';
  const neu = jahrAusVorlage(alt, 2026);
  assert.equal(neu.jahr, 2026);
  assert.equal(neu.von, '2026-01-01');
  assert.notEqual(neu.id, alt.id);
  assert.notEqual(neu.kosten[0].id, alt.kosten[0].id);
  assert.equal(neu.kosten[0].betrag, alt.kosten[0].betrag);
  const strom = neu.kosten.find((k) => k.verbrauch.art === 'zaehler');
  assert.equal(strom.verbrauch.anfang, 20615);
  assert.equal(strom.verbrauch.ende, 20615);
  assert.equal(alt.von, '2025-03-01');
});

test('Sicherung: gültige Datei wird angenommen, fremde abgelehnt', () => {
  const daten = { app: APP_KENNUNG, version: 1, stammdaten: leereStammdaten(), jahre: [neuesJahr(2024)] };
  assert.equal(pruefeSicherung(JSON.parse(JSON.stringify(daten))).jahre[0].jahr, 2024);
  assert.throws(() => pruefeSicherung({ foo: 1 }), /keine Sicherung/);
  assert.throws(() => pruefeSicherung({ ...daten, jahre: [{ jahr: 'x' }] }), /unvollständig/);
  assert.throws(() => pruefeSicherung({ ...daten, version: 99 }), /neueren Version/);
});

test('Schreiben enthält alle Pflichtteile und keine Bankverbindung', () => {
  const j = beispielJahr();
  const r = berechneAbrechnung(j, j.stammdatenBeispiel);
  const b = erstelleBericht(j, j.stammdatenBeispiel, r, '2026-11-09');
  assert.equal(b.betreff, 'Betriebskostenabrechnung für den Zeitraum 01.01.2025 – 31.12.2025');
  assert.equal(b.datum, '09.11.2026');
  assert.equal(b.absender.name, 'Max Mustermann');
  assert.equal(b.empfaenger.name, 'Erika Beispiel');
  assert.match(b.belege, /eingesehen/);
  assert.match(b.vorauszahlung, /€/);
  assert.ok(b.erklaerungen.some((t) => t.startsWith('Wohnfläche')));
  assert.ok(b.sonstige);
  assert.ok(b.p35a);
  assert.doesNotMatch(JSON.stringify(b), /IBAN|BIC|Bankverbindung/i);
});

test('Positionen ohne Kosten erscheinen nicht im Schreiben', () => {
  const j = neuesJahr(2025);
  j.kosten[0].betrag = 100;
  const b = erstelleBericht(j, stamm, berechneAbrechnung(j, stamm), '2026-01-15');
  assert.equal(b.tabelle.length, 1);
  assert.equal(b.sonstige, null);
});
