// Baut den Inhalt des Abrechnungsschreibens. PDF und Word verwenden dieselbe Struktur.
import { SCHLUESSEL } from './calc.js';
import { euro, zahl, zahlKurz, prozent, datum } from './format.js';

function einheiten(wert, einheit) {
  if (einheit === 'm²') return `${zahl(wert, 2)} m²`;
  if (einheit === '%') return prozent(wert);
  return `${zahlKurz(wert, 2)} ${einheit}`;
}

function schluesselText(p) {
  if (p.schluessel === 'verbrauch') return p.verbrauchsart === 'zaehler' ? 'Verbrauch (Zähler)' : 'Verbrauch';
  return SCHLUESSEL[p.schluessel];
}

function tabellenZeilen(positionen) {
  return positionen.map((p) => [
    p.name,
    euro(p.gesamtCent),
    schluesselText(p),
    einheiten(p.gesamtEinheiten, p.einheit),
    einheiten(p.mieterEinheiten, p.einheit),
    prozent(p.anteilProzent),
    euro(p.mieterCent),
  ]);
}

function erklaerungen(jahr, stamm, r) {
  const f = stamm.flaechen;
  const genutzt = new Set([...r.positionen, ...r.sonstige].filter((p) => p.gesamtCent !== 0).map((p) => p.schluessel));
  const summeFlaeche = Number(f.haupt) + Number(f.einlieger);
  const summePersonen = Number(jahr.personen.haupt) + Number(jahr.personen.einlieger);
  const texte = [];
  if (genutzt.has('flaeche')) {
    texte.push(`Wohnfläche: Die Kosten werden nach dem Anteil an der Gesamtwohnfläche verteilt. Hauptwohnung ${zahl(f.haupt)} m², Einliegerwohnung ${zahl(f.einlieger)} m², zusammen ${zahl(summeFlaeche)} m².`);
  }
  if (genutzt.has('personen')) {
    texte.push(`Personen: Die Kosten werden nach der Zahl der Bewohner verteilt. Hauptwohnung ${zahlKurz(jahr.personen.haupt, 2)}, Einliegerwohnung ${zahlKurz(jahr.personen.einlieger, 2)}, zusammen ${zahlKurz(summePersonen, 2)} Personen.`);
  }
  for (const p of jahr.kosten) {
    if (p.schluessel !== 'verbrauch') continue;
    const e = r.positionen.find((x) => x.id === p.id);
    if (!e || e.gesamtCent === 0) continue;
    const v = p.verbrauch;
    const einheit = v.einheit || 'kWh';
    if (v.art === 'zaehler') {
      let text = `${p.name}: Verbrauch laut eigenem Zähler. Stand Anfang ${zahlKurz(v.anfang, 2)}, Stand Ende ${zahlKurz(v.ende, 2)}, Verbrauch ${zahlKurz(e.verbrauch, 2)} ${einheit}, Arbeitspreis ${zahlKurz(v.preis, 4)} € je ${einheit}.`;
      if (Number(v.grundpreis) > 0) {
        text += ` Zuzüglich anteiliger Grundpreis von ${zahl(v.grundpreis, 2)} € pro ${v.grundpreisIntervall === 'monat' ? 'Monat' : 'Jahr'}.`;
      }
      texte.push(text);
    } else {
      texte.push(`${p.name}: Verteilung nach Verbrauch. Gesamtverbrauch ${zahlKurz(v.gesamt, 2)} ${einheit}, davon Einliegerwohnung ${zahlKurz(v.mieter, 2)} ${einheit}.`);
    }
  }
  if (genutzt.has('prozent')) texte.push('Fester Prozentsatz: Der Anteil ist vereinbart und in der Tabelle angegeben.');
  if (genutzt.has('mieterin')) texte.push('100 % Mieterin: Die Kosten entfallen vollständig auf die Einliegerwohnung.');
  if (!r.zeit.voll) {
    texte.push(`Zeitanteil: Der Abrechnungszeitraum umfasst ${r.zeit.tage} von ${r.zeit.tageJahr} Tagen. Jahres- und Monatsbeträge sind entsprechend anteilig nach Tagen angesetzt. Die Gesamtkosten in der Tabelle sind bereits die Kosten für diesen Zeitraum.`);
  }
  return texte;
}

function zeilen(text) {
  return String(text || '').split('\n').map((z) => z.trim()).filter(Boolean);
}

const KOPF = ['Kostenart', 'Gesamtkosten', 'Umlageschlüssel', 'Gesamteinheiten', 'Anteil Einheiten', 'Anteil %', 'Betrag Mieterin'];

/** @returns Inhalt des Schreibens als neutrale Struktur */
export function erstelleBericht(jahr, stamm, r, briefDatum) {
  const zeitraum = `${datum(jahr.von)} – ${datum(jahr.bis)}`;
  const positionen = r.positionen.filter((p) => p.gesamtCent !== 0);
  const sonstige = r.sonstige.filter((p) => p.gesamtCent !== 0);

  let ergebnisZeile;
  let ergebnisSatz;
  if (r.saldoCent > 0) {
    ergebnisZeile = ['Nachzahlung', euro(r.saldoCent)];
    ergebnisSatz = `Aus den Betriebskosten ergibt sich eine Nachzahlung von ${euro(r.saldoCent)}.`;
  } else if (r.saldoCent < 0) {
    ergebnisZeile = ['Guthaben', euro(-r.saldoCent)];
    ergebnisSatz = `Aus den Betriebskosten ergibt sich ein Guthaben von ${euro(-r.saldoCent)}.`;
  } else {
    ergebnisZeile = ['Ergebnis', 'ausgeglichen'];
    ergebnisSatz = 'Die Betriebskosten sind durch die Vorauszahlungen genau ausgeglichen.';
  }

  let gesamt = null;
  if (sonstige.length) {
    const c = r.gesamtbetragCent;
    gesamt = {
      zeilen: [
        [r.saldoCent < 0 ? 'Guthaben aus den Betriebskosten' : 'Ergebnis der Betriebskosten', r.saldoCent < 0 ? `-${euro(-r.saldoCent)}` : euro(r.saldoCent)],
        ['Sonstige vereinbarte Kosten', euro(r.summeSonstigeCent)],
      ],
      ergebnis: [c > 0 ? 'Gesamtbetrag zu Ihren Lasten' : c < 0 ? 'Gesamtbetrag zu Ihren Gunsten' : 'Gesamtbetrag', euro(Math.abs(c))],
    };
  }

  const zuZahlen = gesamt ? r.gesamtbetragCent : r.saldoCent;
  const zahlung = zuZahlen > 0
    ? 'Bitte überweisen Sie den Betrag auf das Ihnen bekannte Konto.'
    : zuZahlen < 0 ? 'Der Betrag wird Ihnen erstattet.' : '';

  let vorauszahlung = `Auf Grundlage dieser Abrechnung ergibt sich als neue monatliche Betriebskostenvorauszahlung ein Betrag von ${euro(r.neueVorauszahlungEuro * 100)}.`;
  if (!r.zeit.voll) vorauszahlung += ' Der Anteil wurde dafür tagesgenau auf ein volles Jahr hochgerechnet.';
  if (Number(jahr.zuschlagProzent) > 0) vorauszahlung += ` Darin ist ein Sicherheitszuschlag von ${zahlKurz(jahr.zuschlagProzent, 2)} % enthalten.`;

  return {
    dateiname: `Betriebskostenabrechnung_${jahr.von}_bis_${jahr.bis}`,
    absender: { name: stamm.vermieter.name, zeilen: zeilen(stamm.vermieter.adresse) },
    empfaenger: { name: stamm.mieterin.name, zeilen: zeilen(stamm.mieterin.adresse) },
    datum: datum(briefDatum),
    betreff: `Betriebskostenabrechnung für den Zeitraum ${zeitraum}`,
    anrede: `Guten Tag ${stamm.mieterin.name},`.replace(' ,', ','),
    einleitung: `nachfolgend erhalten Sie die Abrechnung der Betriebskosten für die Einliegerwohnung (${zahl(stamm.flaechen.einlieger)} m²) für den Zeitraum ${zeitraum}.`,
    kopf: KOPF,
    tabelle: tabellenZeilen(positionen),
    summe: ['Summe Betriebskosten', euro(r.summeBetriebskostenCent)],
    ergebnis: {
      zeilen: [
        ['Ihr Anteil an den Betriebskosten', euro(r.summeBetriebskostenCent)],
        ['abzüglich geleisteter Vorauszahlungen', `-${euro(r.vorauszahlungenCent)}`.replace('-0,00', '0,00')],
      ],
      ergebnis: ergebnisZeile,
      satz: ergebnisSatz,
    },
    erklaerungen: erklaerungen(jahr, stamm, r),
    sonstige: sonstige.length ? {
      ueberschrift: 'Sonstige vereinbarte Kosten (keine Betriebskosten)',
      hinweis: 'Diese Kosten gehören nicht zu den Betriebskosten und sind in der obigen Summe nicht enthalten.',
      kopf: KOPF,
      zeilen: tabellenZeilen(sonstige),
      summe: ['Summe sonstige Kosten', euro(r.summeSonstigeCent)],
    } : null,
    gesamt,
    zahlung,
    belege: 'Die Belege zu dieser Abrechnung können nach vorheriger Terminabsprache eingesehen werden.',
    vorauszahlung,
    gruss: 'Mit freundlichen Grüßen',
    unterschrift: stamm.vermieter.name,
    p35a: r.paragraph35a.length ? {
      ueberschrift: 'Aufstellung nach § 35a EStG',
      text: 'In den Kosten sind die folgenden Arbeitslöhne für haushaltsnahe Dienstleistungen und Handwerkerleistungen enthalten. Der rechte Betrag ist Ihr Anteil.',
      kopf: ['Kostenart', 'Lohnanteil gesamt', 'Ihr Anteil %', 'Ihr Lohnanteil'],
      zeilen: r.paragraph35a.map((p) => [p.name, euro(p.lohnGesamtCent), prozent(p.anteilProzent), euro(p.lohnMieterCent)]),
      summe: ['Summe Ihrer Lohnanteile', euro(r.summe35aCent)],
    } : null,
  };
}
