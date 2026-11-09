// Berechnungslogik der Nebenkostenabrechnung. Keine Abhängigkeit vom Browser.
// Geldbeträge werden als ganze Cent geführt, damit Summen exakt aufgehen.

export const SCHLUESSEL = {
  flaeche: 'Wohnfläche',
  personen: 'Personen',
  verbrauch: 'Verbrauch',
  prozent: 'Fester Prozentsatz',
  mieterin: '100 % Mieterin',
};

const MS_TAG = 86400000;

// Beseitigt Binärbruch-Reste wie 100,49999999999999 vor dem Runden.
const bereinigt = (x) => Number(x.toPrecision(12));
const zahlOderNull = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

/** Kaufmännisch runden auf ganze Einheiten (für Cent-Werte). */
export function runde(x) {
  const s = x < 0 ? -1 : 1;
  return s * Math.round(bereinigt(Math.abs(x)));
}

/** Euro-Betrag → gerundete Cent */
export function inCent(euro) {
  return runde(euro * 100);
}

function utc(iso) {
  const [j, m, t] = iso.split('-').map(Number);
  return Date.UTC(j, m - 1, t);
}

export function istSchaltjahr(j) {
  return (j % 4 === 0 && j % 100 !== 0) || j % 400 === 0;
}

export function tageImJahr(j) {
  return istSchaltjahr(j) ? 366 : 365;
}

/** Anzahl Tage von `von` bis `bis`, beide einschließlich */
export function tageImZeitraum(von, bis) {
  return Math.round((utc(bis) - utc(von)) / MS_TAG) + 1;
}

/** Zeitanteil des Abrechnungszeitraums am Kalenderjahr */
export function zeitanteil(von, bis) {
  const jahr = Number(von.slice(0, 4));
  const tage = tageImZeitraum(von, bis);
  const tageJahr = tageImJahr(jahr);
  return { tage, tageJahr, faktor: tage / tageJahr, voll: tage === tageJahr };
}

/** Prüft den Zeitraum; liefert eine Fehlermeldung oder null */
export function pruefeZeitraum(jahr, von, bis) {
  if (!von || !bis) return 'Bitte Anfang und Ende des Abrechnungszeitraums eintragen.';
  if (von > bis) return 'Das Ende des Abrechnungszeitraums liegt vor dem Anfang.';
  if (Number(von.slice(0, 4)) !== jahr || Number(bis.slice(0, 4)) !== jahr) {
    return `Anfang und Ende müssen im Kalenderjahr ${jahr} liegen.`;
  }
  return null;
}

/** Letzter Tag der Abrechnungsfrist: 12 Monate nach Ende des Zeitraums (§ 556 Abs. 3 BGB) */
export function fristEnde(bis) {
  const [j, m, t] = bis.split('-').map(Number);
  const zielJahr = j + 1;
  const letzterTag = new Date(Date.UTC(zielJahr, m, 0)).getUTCDate();
  const tag = Math.min(t, letzterTag);
  return `${zielJahr}-${String(m).padStart(2, '0')}-${String(tag).padStart(2, '0')}`;
}

export function fristAbgelaufen(bis, heute) {
  return heute > fristEnde(bis);
}

function aufZeitraum(betrag, intervall, faktor) {
  return zahlOderNull(betrag) * (intervall === 'monat' ? 12 : 1) * faktor;
}

function verteilung(pos, stamm, personen, hinweise) {
  const f = stamm.flaechen;
  switch (pos.schluessel) {
    case 'flaeche':
      return { gesamt: zahlOderNull(f.haupt) + zahlOderNull(f.einlieger), mieter: zahlOderNull(f.einlieger), einheit: 'm²' };
    case 'personen':
      return { gesamt: zahlOderNull(personen.haupt) + zahlOderNull(personen.einlieger), mieter: zahlOderNull(personen.einlieger), einheit: 'Pers.' };
    case 'prozent':
      if (pos.prozent < 0 || pos.prozent > 100) hinweise.push(`„${pos.name}“: Der Prozentsatz muss zwischen 0 und 100 liegen.`);
      return { gesamt: 100, mieter: zahlOderNull(pos.prozent), einheit: '%' };
    case 'verbrauch': {
      const v = pos.verbrauch;
      if (zahlOderNull(v.mieter) > zahlOderNull(v.gesamt)) hinweise.push(`„${pos.name}“: Der Verbrauch der Mieterin ist größer als der Gesamtverbrauch.`);
      return { gesamt: zahlOderNull(v.gesamt), mieter: zahlOderNull(v.mieter), einheit: v.einheit || 'kWh' };
    }
    case 'mieterin':
    default:
      return { gesamt: 100, mieter: 100, einheit: '%' };
  }
}

/** Berechnet eine einzelne Kostenart oder sonstige Position */
export function berechnePosition(pos, stamm, personen, faktor, hinweise = []) {
  const istZaehler = pos.schluessel === 'verbrauch' && pos.verbrauch?.art === 'zaehler';
  let gesamtCent;
  let mieterCent;
  let gesamtEinheiten;
  let mieterEinheiten;
  let einheit;
  let quote;
  let verbrauchKwh = null;

  if (istZaehler) {
    const v = pos.verbrauch;
    const differenz = bereinigt(zahlOderNull(v.ende) - zahlOderNull(v.anfang));
    if (differenz < 0) hinweise.push(`„${pos.name}“: Der Zählerstand am Ende ist kleiner als am Anfang.`);
    verbrauchKwh = Math.max(0, differenz);
    const arbeit = verbrauchKwh * zahlOderNull(v.preis);
    const grund = aufZeitraum(v.grundpreis, v.grundpreisIntervall, faktor);
    gesamtCent = inCent(arbeit + grund);
    mieterCent = gesamtCent;
    gesamtEinheiten = verbrauchKwh;
    mieterEinheiten = verbrauchKwh;
    einheit = v.einheit || 'kWh';
    quote = 1;
  } else {
    gesamtCent = inCent(aufZeitraum(pos.betrag, pos.intervall, faktor));
    const d = verteilung(pos, stamm, personen, hinweise);
    gesamtEinheiten = d.gesamt;
    mieterEinheiten = d.mieter;
    einheit = d.einheit;
    if (d.gesamt <= 0) {
      if (gesamtCent !== 0) hinweise.push(`„${pos.name}“: Die Gesamteinheiten sind 0, der Anteil kann nicht berechnet werden.`);
      quote = 0;
    } else {
      quote = d.mieter / d.gesamt;
    }
    // Exakter Bruch: Multiplikation vor der Division, gerundet wird erst das Ergebnis.
    mieterCent = d.gesamt > 0 ? runde((gesamtCent * d.mieter) / d.gesamt) : 0;
  }

  let lohnGesamtCent = 0;
  let lohnMieterCent = 0;
  const p = pos.p35a;
  if (p?.aktiv) {
    lohnGesamtCent = p.art === 'prozent'
      ? runde((gesamtCent * zahlOderNull(p.wert)) / 100)
      : inCent(aufZeitraum(p.wert, istZaehler ? 'jahr' : pos.intervall, faktor));
    if (lohnGesamtCent > gesamtCent) hinweise.push(`„${pos.name}“: Der Lohnanteil ist höher als die Kosten.`);
    lohnMieterCent = runde(lohnGesamtCent * quote);
  }

  return {
    id: pos.id,
    name: pos.name,
    schluessel: pos.schluessel,
    verbrauchsart: pos.schluessel === 'verbrauch' ? pos.verbrauch?.art : null,
    gesamtCent,
    gesamtEinheiten,
    mieterEinheiten,
    einheit,
    anteilProzent: quote * 100,
    mieterCent,
    verbrauch: verbrauchKwh,
    lohnAktiv: Boolean(p?.aktiv),
    lohnGesamtCent,
    lohnMieterCent,
  };
}

/**
 * Vorschlag für die monatliche Vorauszahlung in vollen Euro:
 * Anteil tagesgenau auf ein volles Jahr hochgerechnet, Zuschlag darauf, durch 12, aufgerundet.
 */
export function vorschlagVorauszahlung(summeCent, tage, tageJahr, zuschlagProzent = 0) {
  if (summeCent <= 0 || tage <= 0) return 0;
  const zuschlag = (100 + zahlOderNull(zuschlagProzent)) / 100;
  const monatEuro = ((summeCent * tageJahr) / tage) * zuschlag / 1200;
  return Math.ceil(bereinigt(monatEuro));
}

const summe = (liste, feld) => liste.reduce((s, x) => s + x[feld], 0);

/** Berechnet die gesamte Abrechnung eines Jahres */
export function berechneAbrechnung(jahr, stamm) {
  const hinweise = [];
  const fehler = pruefeZeitraum(jahr.jahr, jahr.von, jahr.bis);
  const von = fehler ? `${jahr.jahr}-01-01` : jahr.von;
  const bis = fehler ? `${jahr.jahr}-12-31` : jahr.bis;
  const zeit = zeitanteil(von, bis);

  const positionen = jahr.kosten.map((p) => berechnePosition(p, stamm, jahr.personen, zeit.faktor, hinweise));
  const sonstige = jahr.sonstige.map((p) => berechnePosition(p, stamm, jahr.personen, zeit.faktor, hinweise));

  const summeBetriebskostenCent = summe(positionen, 'mieterCent');
  const vorauszahlungenCent = inCent(zahlOderNull(jahr.vorauszahlungen));
  const saldoCent = summeBetriebskostenCent - vorauszahlungenCent;
  const summeSonstigeCent = summe(sonstige, 'mieterCent');
  const gesamtbetragCent = saldoCent + summeSonstigeCent;

  const paragraph35a = [...positionen, ...sonstige]
    .filter((p) => p.lohnAktiv && p.lohnGesamtCent !== 0)
    .map((p) => ({ name: p.name, lohnGesamtCent: p.lohnGesamtCent, lohnMieterCent: p.lohnMieterCent, anteilProzent: p.anteilProzent }));

  return {
    fehler,
    hinweise,
    zeit,
    positionen,
    sonstige,
    summeBetriebskostenCent,
    vorauszahlungenCent,
    saldoCent,
    ergebnisArt: saldoCent > 0 ? 'Nachzahlung' : saldoCent < 0 ? 'Guthaben' : 'Ausgeglichen',
    summeSonstigeCent,
    gesamtbetragCent,
    neueVorauszahlungEuro: vorschlagVorauszahlung(summeBetriebskostenCent, zeit.tage, zeit.tageJahr, jahr.zuschlagProzent),
    paragraph35a,
    summe35aCent: summe(paragraph35a, 'lohnMieterCent'),
  };
}
