// Oberfläche der App: Ansichten, Eingaben, automatisches Speichern, Export und Sicherung.
import { berechneAbrechnung, fristAbgelaufen, fristEnde, SCHLUESSEL } from './calc.js';
import { euro, zahl, zahlKurz, datum, leseZahl, heuteISO, prozent } from './format.js';
import {
  APP_KENNUNG, DATEN_VERSION, beispielJahr, jahrAusVorlage, leereStammdaten, neuePosition, neuesJahr, pruefeSicherung,
} from './model.js';
import { erstelleBericht } from './bericht.js';
import { erzeugeDocx, erzeugePdf } from './export.js';
import * as db from './db.js';

const zustand = { stamm: leereStammdaten(), jahre: [], letzteSicherung: null };
const inhalt = document.getElementById('inhalt');
const SICHERUNG_ALLE_TAGE = 30;
let aktualisiereJahr = () => {};

// ---------- Hilfsfunktionen für die Oberfläche ----------

function el(tag, attribute = {}, ...kinder) {
  const n = document.createElement(tag);
  let wert;
  for (const [k, v] of Object.entries(attribute)) {
    if (k === 'class') n.className = v;
    else if (k === 'value') wert = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  kinder.flat(Infinity).forEach((k) => {
    if (k != null && k !== false) n.append(k.nodeType ? k : String(k));
  });
  if (wert !== undefined) n.value = wert;
  return n;
}

/** Ersetzt den Inhalt eines Elements; leere Werte werden übersprungen. */
function fuelle(knoten, ...kinder) {
  knoten.replaceChildren(...el('div', {}, kinder).childNodes);
}

function modal(aufbau) {
  const hinter = el('div', { class: 'modal-hinter' });
  const box = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
  hinter.append(box);
  document.body.append(hinter);
  const zu = () => hinter.remove();
  aufbau(box, zu);
  return { box, zu };
}

function fragen(titel, text, okText, gefahr = false) {
  return new Promise((resolve) => {
    modal((box, zu) => {
      box.append(
        el('h2', {}, titel),
        el('p', {}, text),
        el('div', { class: 'knopf-reihe' },
          el('button', { onclick: () => { zu(); resolve(false); } }, 'Abbrechen'),
          el('button', { class: gefahr ? 'gefahr' : 'primaer', onclick: () => { zu(); resolve(true); } }, okText)),
      );
    });
  });
}

function meldung(titel, text) {
  modal((box, zu) => box.append(el('h2', {}, titel), el('p', {}, text), el('button', { class: 'primaer breit', onclick: zu }, 'OK')));
}

// Speichern mit kurzer Verzögerung, damit beim Tippen nicht jeder Buchstabe schreibt.
const offen = new Map();
function speichereSpaeter(jahr) {
  clearTimeout(offen.get(jahr)?.t);
  offen.set(jahr, { t: setTimeout(() => speichereJetzt(jahr), 300) });
}
function speichereJetzt(jahr) {
  clearTimeout(offen.get(jahr)?.t);
  offen.delete(jahr);
  db.schreibeJahr(jahr).catch((e) => meldung('Speichern fehlgeschlagen', String(e?.message || e)));
}
function speichereAlles() {
  [...offen.keys()].forEach(speichereJetzt);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') speichereAlles(); });
window.addEventListener('pagehide', speichereAlles);

function textFeld(beschriftung, obj, schluessel, beiAenderung, optionen = {}) {
  const attr = {
    value: obj[schluessel] ?? '',
    autocomplete: 'off',
    oninput: (e) => { obj[schluessel] = e.target.value; beiAenderung(); },
  };
  return el('label', { class: 'feld' }, beschriftung, optionen.mehrzeilig ? el('textarea', attr) : el('input', { ...attr, type: 'text' }));
}

function zahlFeld(beschriftung, obj, schluessel, beiAenderung, optionen = {}) {
  const { stellen = 2, kurz = false, hilfe, platzhalter } = optionen;
  const zeige = (v) => {
    if (!v) return '';
    return kurz ? zahlKurz(v, stellen) : zahl(v, stellen);
  };
  const eingabe = el('input', {
    class: 'zahl', type: 'text', inputmode: 'decimal', autocomplete: 'off',
    placeholder: platzhalter ?? (kurz ? '0' : zahl(0, stellen)),
    value: zeige(obj[schluessel]),
    oninput: (e) => {
      const v = leseZahl(e.target.value);
      e.target.classList.toggle('ungueltig', v === null);
      if (v !== null) { obj[schluessel] = v; beiAenderung(); }
    },
    onblur: (e) => {
      if (!e.target.classList.contains('ungueltig')) e.target.value = zeige(obj[schluessel]);
    },
  });
  return el('label', { class: 'feld' }, beschriftung, eingabe, hilfe && el('span', { class: 'hilfe' }, hilfe));
}

function segment(beschriftung, wahl, obj, schluessel, beiAenderung) {
  const knoepfe = wahl.map(([wert, text]) => el('button', {
    type: 'button',
    'aria-pressed': String(obj[schluessel] === wert),
    onclick: () => {
      obj[schluessel] = wert;
      knoepfe.forEach((k, i) => k.setAttribute('aria-pressed', String(wahl[i][0] === wert)));
      beiAenderung();
    },
  }, text));
  return el('div', { class: 'feld-gruppe' },
    el('div', { class: 'klein', style: 'font-weight:600' }, beschriftung),
    el('div', { class: 'segment', role: 'group', 'aria-label': beschriftung }, knoepfe));
}

const INTERVALLE = [['monat', 'pro Monat'], ['jahr', 'pro Jahr']];
const istZaehler = (p) => p.schluessel === 'verbrauch' && p.verbrauch.art === 'zaehler';
const stammFuer = (j) => j.stammdatenBeispiel || zustand.stamm;

function fristHinweis(jahr, bis = jahr.bis) {
  if (!bis) return null;
  const heute = heuteISO();
  const ende = fristEnde(bis);
  if (fristAbgelaufen(bis, heute)) {
    return el('div', { class: 'hinweis' },
      el('strong', {}, 'Abrechnungsfrist abgelaufen'),
      `Die zwölfmonatige Frist nach § 556 Abs. 3 BGB endete am ${datum(ende)}. Eine Nachforderung ist dann in der Regel ausgeschlossen. Die Berechnung bleibt trotzdem möglich.`);
  }
  return el('div', { class: 'hinweis ruhig' },
    `Die Abrechnung muss der Mieterin spätestens am ${datum(ende)} zugehen (§ 556 Abs. 3 BGB).`);
}

function tageSeit(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function sicherungsHinweis() {
  const zuletzt = zustand.letzteSicherung;
  const tage = zuletzt ? tageSeit(zuletzt) : null;
  const faellig = tage === null || tage >= SICHERUNG_ALLE_TAGE;
  const stand = zuletzt ? `Letzte Sicherung: ${new Date(zuletzt).toLocaleDateString('de-DE')}.` : 'Noch keine Sicherung vorhanden.';
  return el('div', { class: `hinweis sicherung-hinweis${faellig ? '' : ' ruhig'}` },
    el('div', {},
      el('strong', {}, faellig ? 'Bitte Daten sichern' : 'Daten sind gesichert'),
      `${stand} Safari kann lokale Daten löschen. Sichere deshalb regelmäßig in die Dateien-App.`),
    el('a', { class: 'knopf', href: '#/sicherung' }, 'Zur Sicherung'));
}

function ergebnisText(r) {
  if (r.saldoCent === 0) return 'Ausgeglichen';
  return `${r.ergebnisArt} ${euro(Math.abs(r.saldoCent))}`;
}

// ---------- Abrechnungsliste ----------

function zeigeListe() {
  const jahre = [...zustand.jahre].sort((a, b) => b.jahr - a.jahr || (a.von < b.von ? 1 : -1));
  fuelle(inhalt,
    el('div', { class: 'kopf' },
      el('h1', {}, 'Abrechnungen'),
      el('button', { class: 'primaer', onclick: neuesJahrDialog }, 'Neues Jahr anlegen')),
    sicherungsHinweis(),
    jahre.length === 0 && el('div', { class: 'karte leer' }, el('p', {}, 'Noch keine Abrechnung vorhanden.')),
    jahre.map((j) => {
      const r = berechneAbrechnung(j, stammFuer(j));
      return el('a', { class: 'jahr-eintrag', href: `#/jahr/${j.id}/eingaben` },
        el('div', {},
          el('span', { class: 'jahr-zahl' }, j.jahr), j.beispiel && el('span', { class: 'marke' }, 'Beispiel'),
          el('div', { class: 'klein' }, `${datum(j.von)} – ${datum(j.bis)}`)),
        el('div', { class: 'jahr-betrag' }, ergebnisText(r),
          fristAbgelaufen(j.bis || `${j.jahr}-12-31`, heuteISO()) && el('div', { class: 'klein', style: 'font-weight:400' }, 'Frist abgelaufen')));
    }),
    !zustand.jahre.some((j) => j.beispiel) && el('button', { class: 'breit rand-oben', onclick: legeBeispielAn }, 'Beispielabrechnung anlegen'),
  );
}

async function legeBeispielAn() {
  const j = beispielJahr();
  zustand.jahre.push(j);
  await db.schreibeJahr(j);
  zeigeListe();
}

function neuesJahrDialog() {
  const aktuell = new Date().getFullYear();
  const zahlen = [];
  for (let z = aktuell + 1; z >= 2022; z -= 1) zahlen.push(z);
  const vorschlag = aktuell - 1;

  modal((box, zu) => {
    const hinweisOrt = el('div', {});
    const vorlageOrt = el('div', {});
    let vorlageWahl;

    const vorlagen = (z) => zustand.jahre.filter((j) => j.jahr < z).sort((a, b) => b.jahr - a.jahr);
    const jahrWahl = el('select', {
      value: String(vorschlag),
      onchange: aktualisiere,
    }, zahlen.map((z) => el('option', { value: String(z) }, z)));
    jahrWahl.value = String(vorschlag);

    function aktualisiere() {
      const z = Number(jahrWahl.value);
      const liste = vorlagen(z);
      vorlageWahl = el('select', {}, el('option', { value: '' }, 'Leer beginnen'), liste.map((j) => el('option', { value: j.id }, `${j.jahr}${j.beispiel ? ' (Beispiel)' : ''}`)));
      if (liste.length) vorlageWahl.value = liste[0].id;
      fuelle(vorlageOrt,liste.length
        ? el('label', { class: 'feld' }, 'Vorjahr als Vorlage übernehmen', vorlageWahl,
          el('span', { class: 'hilfe' }, 'Beträge und Einstellungen werden kopiert, der Zählerstand wird fortgeschrieben. Bitte danach alle Werte prüfen.'))
        : '');
      fuelle(hinweisOrt,fristHinweis({}, `${z}-12-31`));
    }

    box.append(
      el('h2', {}, 'Neues Jahr anlegen'),
      el('label', { class: 'feld' }, 'Kalenderjahr', jahrWahl),
      vorlageOrt, hinweisOrt,
      el('div', { class: 'knopf-reihe' },
        el('button', { onclick: zu }, 'Abbrechen'),
        el('button', { class: 'primaer', onclick: async () => {
          const z = Number(jahrWahl.value);
          if (zustand.jahre.some((j) => j.jahr === z && !j.beispiel)) {
            const ok = await fragen('Jahr schon vorhanden', `Für ${z} gibt es bereits eine Abrechnung. Eine weitere ist zum Beispiel bei einem Mieterwechsel sinnvoll. Trotzdem anlegen?`, 'Trotzdem anlegen');
            if (!ok) return;
          }
          const vorlage = zustand.jahre.find((j) => j.id === vorlageWahl.value);
          const neu = vorlage ? jahrAusVorlage(vorlage, z) : neuesJahr(z);
          zustand.jahre.push(neu);
          await db.schreibeJahr(neu);
          zu();
          location.hash = `#/jahr/${neu.id}/eingaben`;
        } }, 'Anlegen')),
    );
    aktualisiere();
  });
}

// ---------- Jahresansicht ----------

function positionKarte(jahr, pos, liste, sonstig, beiAenderung, neuZeichnen) {
  const karte = el('section', { class: `karte${sonstig ? ' getrennt' : ''}` });

  function zeichne() {
    const schluessel = Object.entries(SCHLUESSEL).filter(([k]) => !sonstig || k !== 'verbrauch');
    const felder = [];

    const betragFelder = () => [
      zahlFeld('Betrag in €', pos, 'betrag', beiAenderung),
      segment('Der Betrag gilt', INTERVALLE, pos, 'intervall', () => { beiAenderung(); zeichne(); }),
    ];

    if (pos.schluessel === 'verbrauch') {
      felder.push(segment('Art der Erfassung', [['zaehler', 'Eigener Zähler'], ['anteil', 'Anteil am Gesamtverbrauch']], pos.verbrauch, 'art', () => { beiAenderung(); zeichne(); }));
    }

    if (istZaehler(pos)) {
      const v = pos.verbrauch;
      felder.push(
        zahlFeld('Zählerstand Anfang', v, 'anfang', beiAenderung, { kurz: true }),
        zahlFeld('Zählerstand Ende', v, 'ende', beiAenderung, { kurz: true }),
        zahlFeld('Arbeitspreis in € pro kWh', v, 'preis', beiAenderung, { stellen: 4, kurz: true, platzhalter: '0,00' }),
        zahlFeld('Anteiliger Grundpreis in € (optional)', v, 'grundpreis', beiAenderung),
        segment('Der Grundpreis gilt', INTERVALLE, v, 'grundpreisIntervall', beiAenderung),
      );
    } else if (pos.schluessel === 'verbrauch') {
      const v = pos.verbrauch;
      felder.push(
        ...betragFelder(),
        zahlFeld('Gesamtverbrauch', v, 'gesamt', beiAenderung, { kurz: true }),
        zahlFeld('Verbrauch Mieterin', v, 'mieter', beiAenderung, { kurz: true }),
        textFeld('Einheit', v, 'einheit', beiAenderung),
      );
    } else {
      felder.push(...betragFelder());
      if (pos.schluessel === 'prozent') felder.push(zahlFeld('Anteil Mieterin in %', pos, 'prozent', beiAenderung));
    }

    const p = pos.p35a;
    const intervallText = istZaehler(pos) ? 'pro Jahr' : (pos.intervall === 'monat' ? 'pro Monat' : 'pro Jahr');

    fuelle(karte,
      el('div', { class: 'pos-kopf' },
        textFeld('Bezeichnung', pos, 'name', beiAenderung),
        el('button', { class: 'gefahr', type: 'button', onclick: async () => {
          if (await fragen('Kostenart löschen?', `„${pos.name}“ wird aus diesem Jahr entfernt.`, 'Löschen', true)) {
            liste.splice(liste.indexOf(pos), 1);
            beiAenderung();
            neuZeichnen();
          }
        } }, 'Löschen')),
      el('div', { class: 'raster' },
        el('label', { class: 'feld' }, 'Umlageschlüssel', el('select', {
          value: pos.schluessel,
          onchange: (e) => { pos.schluessel = e.target.value; beiAenderung(); zeichne(); },
        }, schluessel.map(([k, t]) => el('option', { value: k }, t)))),
        felder),
      el('div', { class: 'block-35a' },
        el('label', { class: 'checkzeile' },
          el('input', { type: 'checkbox', checked: p.aktiv, onchange: (e) => { p.aktiv = e.target.checked; beiAenderung(); zeichne(); } }),
          'Enthält haushaltsnahe Dienstleistungen/Handwerkerleistungen nach § 35a EStG'),
        p.aktiv && el('div', { class: 'raster' },
          segment('Lohnanteil angeben', [['euro', 'in €'], ['prozent', 'in % der Kosten']], p, 'art', () => { beiAenderung(); zeichne(); }),
          zahlFeld(p.art === 'euro' ? `Lohnanteil laut Rechnung in € (${intervallText})` : 'Lohnanteil in % der Kosten', p, 'wert', beiAenderung, {
            hilfe: 'Gesamtwert laut Rechnung. Den Anteil der Mieterin berechnet die App.',
          }))),
      el('div', { class: 'pos-fuss', 'data-anteil': pos.id }),
    );
    aktualisiereJahr();
  }
  zeichne();
  return karte;
}

function positionsListe(jahr, liste, sonstig, beiAenderung) {
  const ort = el('div', {});
  function neuZeichnen() {
    fuelle(ort,
      ...liste.map((p) => positionKarte(jahr, p, liste, sonstig, beiAenderung, neuZeichnen)),
      el('button', { class: 'breit', type: 'button', onclick: () => {
        liste.push(neuePosition(sonstig ? 'Neue sonstige Kosten' : 'Neue Kostenart', sonstig ? 'mieterin' : 'flaeche'));
        beiAenderung();
        neuZeichnen();
      } }, sonstig ? 'Sonstige Kosten hinzufügen' : 'Kostenart hinzufügen'),
    );
    aktualisiereJahr();
  }
  neuZeichnen();
  return ort;
}

function zeigeJahr(id, tab) {
  const jahr = zustand.jahre.find((j) => j.id === id);
  if (!jahr) { location.hash = '#/'; return; }

  const leiste = el('a', { class: 'ergebnis-leiste', href: `#/jahr/${jahr.id}/ergebnis`, style: 'text-decoration:none' });
  const hinweise = el('div', {});
  const beiAenderung = () => { speichereSpaeter(jahr); aktualisiereJahr(); };

  aktualisiereJahr = () => {
    const r = berechneAbrechnung(jahr, stammFuer(jahr));
    fuelle(leiste,
      el('div', { class: 'neben' }, 'Betriebskosten Mieterin', el('br'), euro(r.summeBetriebskostenCent)),
      el('div', { class: 'wert' }, ergebnisText(r)),
    );
    fuelle(hinweise,
      r.fehler && el('div', { class: 'hinweis fehler' }, el('strong', {}, 'Zeitraum prüfen'), r.fehler),
      !r.fehler && fristHinweis(jahr),
      r.hinweise.length ? el('div', { class: 'hinweis' }, el('strong', {}, 'Bitte prüfen'), el('ul', {}, r.hinweise.map((h) => el('li', {}, h)))) : null,
    );
    const nachId = new Map([...r.positionen, ...r.sonstige].map((p) => [p.id, p]));
    document.querySelectorAll('[data-anteil]').forEach((n) => {
      const p = nachId.get(n.dataset.anteil);
      if (!p) return;
      const links = p.verbrauch !== null
        ? `Verbrauch ${zahlKurz(p.verbrauch, 2)} ${p.einheit} · Kosten ${euro(p.gesamtCent)}`
        : `Kosten im Zeitraum ${euro(p.gesamtCent)} · Anteil ${prozent(p.anteilProzent)}`;
      fuelle(n,el('span', { class: 'klein' }, links), el('b', {}, `Mieterin: ${euro(p.mieterCent)}`));
    });
  };

  const reiter = el('div', { class: 'segment', role: 'group', 'aria-label': 'Ansicht' },
    el('button', { type: 'button', 'aria-pressed': String(tab === 'eingaben'), onclick: () => { location.hash = `#/jahr/${jahr.id}/eingaben`; } }, 'Eingaben'),
    el('button', { type: 'button', 'aria-pressed': String(tab === 'ergebnis'), onclick: () => { location.hash = `#/jahr/${jahr.id}/ergebnis`; } }, 'Ergebnis und Export'));

  const kopf = [
    el('a', { class: 'knopf zurueck', href: '#/' }, '‹ Abrechnungen'),
    el('div', { class: 'kopf' },
      el('h1', {}, `Abrechnung ${jahr.jahr}`, jahr.beispiel && el('span', { class: 'marke' }, 'Beispiel')),
      el('button', { class: 'gefahr', onclick: async () => {
        if (await fragen('Abrechnung löschen?', `Die Abrechnung ${jahr.jahr} wird dauerhaft von diesem Gerät gelöscht.`, 'Löschen', true)) {
          await db.loescheJahr(jahr.id);
          zustand.jahre = zustand.jahre.filter((j) => j !== jahr);
          location.hash = '#/';
        }
      } }, 'Löschen')),
    leiste, reiter,
    jahr.beispiel && el('div', { class: 'hinweis ruhig rand-oben' }, 'Das ist eine Beispielabrechnung mit erfundenen Daten. Sie nutzt eigene Stammdaten und kann jederzeit gelöscht werden.'),
    el('div', { class: 'rand-oben' }, hinweise),
  ];

  if (tab === 'ergebnis') {
    fuelle(inhalt,...kopf.filter(Boolean), ergebnisAnsicht(jahr));
    aktualisiereJahr();
    return;
  }

  const zeitraumBegrenzung = { min: `${jahr.jahr}-01-01`, max: `${jahr.jahr}-12-31` };
  const datumFeld = (text, key) => el('label', { class: 'feld' }, text, el('input', {
    type: 'date', ...zeitraumBegrenzung, value: jahr[key],
    onchange: (e) => { jahr[key] = e.target.value; beiAenderung(); },
  }));

  fuelle(inhalt,
    ...kopf.filter(Boolean),
    el('h2', {}, 'Zeitraum und Personen'),
    el('section', { class: 'karte' },
      el('div', { class: 'raster' },
        datumFeld('Anfang', 'von'), datumFeld('Ende', 'bis'),
        zahlFeld('Personen Hauptwohnung', jahr.personen, 'haupt', beiAenderung, { kurz: true, platzhalter: '0' }),
        zahlFeld('Personen Einliegerwohnung', jahr.personen, 'einlieger', beiAenderung, { kurz: true, platzhalter: '0' })),
      el('p', { class: 'klein rand-oben', style: 'margin-bottom:0' }, 'Ist der Zeitraum kürzer als das Kalenderjahr, werden die Beträge anteilig nach Tagen berechnet.')),
    el('h2', {}, 'Vorauszahlungen'),
    el('section', { class: 'karte' },
      el('div', { class: 'raster' },
        zahlFeld('Geleistete Vorauszahlungen im Zeitraum, gesamt in €', jahr, 'vorauszahlungen', beiAenderung),
        zahlFeld('Sicherheitszuschlag neue Vorauszahlung in %', jahr, 'zuschlagProzent', beiAenderung, { kurz: true, platzhalter: '0' }))),
    el('h2', {}, 'Kostenarten'),
    positionsListe(jahr, jahr.kosten, false, beiAenderung),
    el('h2', {}, 'Sonstige vereinbarte Kosten (keine Betriebskosten)'),
    el('p', { class: 'klein' }, 'Zum Beispiel Telefon oder Internet. Diese Kosten werden getrennt ausgewiesen und zählen nicht zur Betriebskostensumme.'),
    positionsListe(jahr, jahr.sonstige, true, beiAenderung),
  );
  aktualisiereJahr();
}

function einheitenText(wert, einheit) {
  if (einheit === 'm²') return `${zahl(wert)} m²`;
  if (einheit === '%') return prozent(wert);
  return `${zahlKurz(wert, 2)} ${einheit}`;
}

function kostenTabelle(zeilen, summenText, summeCent) {
  return el('div', { class: 'tabelle-huelle' }, el('table', { class: 'tabelle-breit' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'Kostenart'), el('th', { class: 'r' }, 'Gesamt'), el('th', {}, 'Schlüssel'),
      el('th', { class: 'r' }, 'Einheiten'), el('th', { class: 'r' }, 'Anteil'), el('th', { class: 'r' }, '%'), el('th', { class: 'r' }, 'Mieterin'))),
    el('tbody', {}, zeilen.map((p) => el('tr', {},
      el('td', {}, p.name), el('td', { class: 'r' }, euro(p.gesamtCent)), el('td', {}, SCHLUESSEL[p.schluessel]),
      el('td', { class: 'r' }, einheitenText(p.gesamtEinheiten, p.einheit)),
      el('td', { class: 'r' }, einheitenText(p.mieterEinheiten, p.einheit)),
      el('td', { class: 'r' }, prozent(p.anteilProzent)),
      el('td', { class: 'r' }, euro(p.mieterCent))))),
    el('tfoot', {}, el('tr', {}, el('td', { colspan: '6' }, summenText), el('td', { class: 'r' }, euro(summeCent))))));
}

function betragZeile(text, wert, summe = false) {
  return el('tr', { class: summe ? 'summe' : '' }, el('td', {}, text), el('td', { class: 'r' }, wert));
}

function ergebnisAnsicht(jahr) {
  const stamm = stammFuer(jahr);
  const r = berechneAbrechnung(jahr, stamm);
  const zeilen = r.positionen.filter((p) => p.gesamtCent !== 0);
  const sonstige = r.sonstige.filter((p) => p.gesamtCent !== 0);

  const fehlt = [
    !stamm.vermieter.name && 'Name des Vermieters', !stamm.vermieter.adresse && 'Adresse des Vermieters',
    !stamm.mieterin.name && 'Name der Mieterin', !stamm.mieterin.adresse && 'Adresse der Mieterin',
  ].filter(Boolean);

  const datumEingabe = el('input', {
    type: 'date', value: jahr.briefDatum || heuteISO(),
    onchange: (e) => { jahr.briefDatum = e.target.value; speichereSpaeter(jahr); },
  });

  const exportiere = (art) => starteExport(jahr, art, datumEingabe.value || heuteISO());

  return el('div', {},
    el('h2', {}, 'Betriebskosten'),
    el('section', { class: 'karte' },
      zeilen.length ? kostenTabelle(zeilen, 'Summe Betriebskosten', r.summeBetriebskostenCent) : el('p', {}, 'Noch keine Kosten eingetragen.')),
    el('section', { class: 'karte' }, el('table', { class: 'betraege' }, el('tbody', {},
      betragZeile('Anteil Mieterin an den Betriebskosten', euro(r.summeBetriebskostenCent)),
      betragZeile('abzüglich Vorauszahlungen', euro(-r.vorauszahlungenCent)),
      betragZeile(r.saldoCent === 0 ? 'Ergebnis' : r.ergebnisArt, r.saldoCent === 0 ? 'ausgeglichen' : euro(Math.abs(r.saldoCent)), true)))),
    sonstige.length > 0 && [
      el('h2', {}, 'Sonstige vereinbarte Kosten (keine Betriebskosten)'),
      el('section', { class: 'karte getrennt' },
        kostenTabelle(sonstige, 'Summe sonstige Kosten', r.summeSonstigeCent),
        el('table', { class: 'betraege rand-oben' }, el('tbody', {},
          betragZeile('Ergebnis Betriebskosten', euro(r.saldoCent)),
          betragZeile('Sonstige vereinbarte Kosten', euro(r.summeSonstigeCent)),
          betragZeile(r.gesamtbetragCent >= 0 ? 'Gesamtbetrag von der Mieterin' : 'Gesamtbetrag an die Mieterin', euro(Math.abs(r.gesamtbetragCent)), true)))),
    ],
    el('h2', {}, 'Neue monatliche Vorauszahlung'),
    el('section', { class: 'karte' },
      el('div', { class: 'jahr-zahl' }, euro(r.neueVorauszahlungEuro * 100)),
      el('p', { class: 'klein', style: 'margin:6px 0 0' },
        `Anteil Betriebskosten${r.zeit.voll ? '' : ` auf 12 Monate hochgerechnet (${r.zeit.tage} von ${r.zeit.tageJahr} Tagen)`}, ${Number(jahr.zuschlagProzent) > 0 ? `mit ${zahlKurz(jahr.zuschlagProzent, 2)} % Zuschlag, ` : ''}durch 12, auf volle Euro aufgerundet.`)),
    r.paragraph35a.length > 0 && [
      el('h2', {}, 'Anteile nach § 35a EStG'),
      el('section', { class: 'karte' }, el('div', { class: 'tabelle-huelle' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Kostenart'), el('th', { class: 'r' }, 'Lohn gesamt'), el('th', { class: 'r' }, 'Anteil'), el('th', { class: 'r' }, 'Lohn Mieterin'))),
        el('tbody', {}, r.paragraph35a.map((p) => el('tr', {}, el('td', {}, p.name), el('td', { class: 'r' }, euro(p.lohnGesamtCent)), el('td', { class: 'r' }, prozent(p.anteilProzent)), el('td', { class: 'r' }, euro(p.lohnMieterCent))))),
        el('tfoot', {}, el('tr', {}, el('td', { colspan: '3' }, 'Summe'), el('td', { class: 'r' }, euro(r.summe35aCent))))))),
    ],
    el('h2', {}, 'Schreiben erstellen'),
    el('section', { class: 'karte' },
      fehlt.length > 0 && el('div', { class: 'hinweis' }, el('strong', {}, 'In den Stammdaten fehlt noch'), fehlt.join(', ')),
      el('label', { class: 'feld' }, 'Datum des Schreibens', datumEingabe),
      el('div', { class: 'knopf-reihe' },
        el('button', { class: 'primaer', disabled: Boolean(r.fehler), onclick: () => exportiere('pdf') }, 'Als PDF erstellen'),
        el('button', { class: 'primaer', disabled: Boolean(r.fehler), onclick: () => exportiere('docx') }, 'Als Word erstellen'))),
  );
}

// ---------- Export und Teilen ----------

const geladen = new Map();
function ladeSkript(pfad) {
  if (!geladen.has(pfad)) {
    geladen.set(pfad, new Promise((resolve, reject) => {
      const s = el('script', { src: pfad });
      s.onload = resolve;
      s.onerror = () => { geladen.delete(pfad); reject(new Error(`${pfad} konnte nicht geladen werden.`)); };
      document.head.append(s);
    }));
  }
  return geladen.get(pfad);
}

async function erzeugeDatei(art, bericht) {
  if (art === 'pdf') {
    await ladeSkript('vendor/jspdf.umd.min.js');
    await ladeSkript('vendor/jspdf.plugin.autotable.min.js');
    const blob = erzeugePdf(bericht, window.jspdf.jsPDF).output('blob');
    return new File([blob], `${bericht.dateiname}.pdf`, { type: 'application/pdf' });
  }
  await ladeSkript('vendor/docx.iife.js');
  const blob = await window.docx.Packer.toBlob(erzeugeDocx(bericht, window.docx));
  return new File([blob], `${bericht.dateiname}.docx`, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function herunterladen(datei) {
  const url = URL.createObjectURL(datei);
  const a = el('a', { href: url, download: datei.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Zeigt die fertige Datei. Das Teilen braucht auf dem iPad einen eigenen Fingertipp. */
function dateiDialog(datei, titel, kopfzeilen, beiErfolg = () => {}) {
  const kannTeilen = Boolean(navigator.canShare?.({ files: [datei] }));
  modal((box, zu) => {
    const fertig = () => { beiErfolg(); zu(); };
    const status = el('p', { class: 'klein' });
    box.append(
      el('h2', {}, titel),
      kopfzeilen,
      el('p', {}, datei.name),
      kannTeilen && el('p', { class: 'klein' }, 'Tippe auf „Teilen“ und wähle dann „In Dateien sichern“.'),
      status,
      el('div', { class: 'knopf-reihe' },
        kannTeilen && el('button', { class: 'primaer', onclick: async () => {
          try {
            await navigator.share({ files: [datei], title: datei.name });
            fertig();
          } catch (e) {
            if (e?.name !== 'AbortError') status.textContent = 'Teilen hat nicht geklappt. Bitte „Herunterladen“ versuchen.';
          }
        } }, 'Teilen'),
        el('button', { class: kannTeilen ? '' : 'primaer', onclick: () => { herunterladen(datei); fertig(); } }, 'Herunterladen'),
      ),
      el('button', { class: 'breit rand-oben', onclick: zu }, 'Schließen'),
    );
  });
}

async function starteExport(jahr, art, briefDatum) {
  speichereAlles();
  const stamm = stammFuer(jahr);
  const r = berechneAbrechnung(jahr, stamm);
  const warte = modal((box) => box.append(el('h2', {}, 'Schreiben wird erstellt …')));
  try {
    const datei = await erzeugeDatei(art, erstelleBericht(jahr, stamm, r, briefDatum));
    warte.zu();
    const frist = fristAbgelaufen(jahr.bis, heuteISO()) ? fristHinweis(jahr) : null;
    dateiDialog(datei, art === 'pdf' ? 'PDF ist fertig' : 'Word-Datei ist fertig', frist);
  } catch (e) {
    warte.zu();
    meldung('Export fehlgeschlagen', String(e?.message || e));
  }
}

// ---------- Stammdaten ----------

function zeigeStammdaten() {
  const s = zustand.stamm;
  const speichern = () => {
    clearTimeout(zeigeStammdaten.t);
    zeigeStammdaten.t = setTimeout(() => db.schreibeMeta('stammdaten', s), 300);
    summe.textContent = `Gesamtwohnfläche: ${zahl(Number(s.flaechen.haupt) + Number(s.flaechen.einlieger))} m²`;
  };
  const summe = el('p', { class: 'rand-oben', style: 'font-weight:600;margin-bottom:0' });
  fuelle(inhalt,
    el('div', { class: 'kopf' }, el('h1', {}, 'Stammdaten')),
    el('p', { class: 'klein' }, 'Änderungen werden automatisch gespeichert und gelten für alle Abrechnungsjahre.'),
    el('h2', {}, 'Vermieter'),
    el('section', { class: 'karte raster' },
      textFeld('Name', s.vermieter, 'name', speichern),
      textFeld('Adresse', s.vermieter, 'adresse', speichern, { mehrzeilig: true })),
    el('h2', {}, 'Mieterin'),
    el('section', { class: 'karte raster' },
      textFeld('Name', s.mieterin, 'name', speichern),
      textFeld('Adresse (Einliegerwohnung)', s.mieterin, 'adresse', speichern, { mehrzeilig: true })),
    el('h2', {}, 'Wohnflächen'),
    el('section', { class: 'karte' },
      el('div', { class: 'raster' },
        zahlFeld('Hauptwohnung in m²', s.flaechen, 'haupt', speichern, { hilfe: '199,59 m² abzüglich 11,90 m² Hausanschlussraum, der nicht zur Wohnfläche zählt' }),
        zahlFeld('Einliegerwohnung in m²', s.flaechen, 'einlieger', speichern)),
      summe),
  );
  speichern();
}

// ---------- Sicherung ----------

function zeigeSicherung() {
  const dateiWahl = el('input', {
    type: 'file', style: 'display:none',
    onchange: async (e) => {
      const datei = e.target.files?.[0];
      e.target.value = '';
      if (datei) await wiederherstellen(datei);
    },
  });

  fuelle(inhalt,
    el('div', { class: 'kopf' }, el('h1', {}, 'Sicherung')),
    sicherungsHinweis(),
    el('section', { class: 'karte' },
      el('h3', {}, 'Daten sichern'),
      el('p', {}, 'Speichert Stammdaten und alle Abrechnungen in einer Datei. Lege sie am besten in iCloud Drive ab, dann bleibt sie auch beim Verlust des iPads erhalten.'),
      el('button', { class: 'primaer breit', onclick: sichern }, 'Daten sichern')),
    el('section', { class: 'karte' },
      el('h3', {}, 'Daten wiederherstellen'),
      el('p', {}, 'Lädt eine zuvor gesicherte Datei. Die aktuellen Daten auf diesem Gerät werden dabei ersetzt.'),
      el('button', { class: 'breit', onclick: () => dateiWahl.click() }, 'Datei auswählen und wiederherstellen'),
      dateiWahl),
    el('section', { class: 'karte' },
      el('h3', {}, 'Datenschutz'),
      el('p', { style: 'margin:0' }, 'Alle Daten bleiben auf diesem Gerät. Die App nutzt keinen Server, keine Cloud, kein Konto und keine Tracker. Dateien verlassen das Gerät nur, wenn du sie selbst teilst.')),
  );
}

function sichern() {
  speichereAlles();
  const daten = {
    app: APP_KENNUNG,
    version: DATEN_VERSION,
    exportiert: new Date().toISOString(),
    stammdaten: zustand.stamm,
    jahre: zustand.jahre,
  };
  const name = `Nebenkosten_Sicherung_${heuteISO()}.json`;
  const datei = new File([JSON.stringify(daten, null, 2)], name, { type: 'application/json' });
  dateiDialog(datei, 'Sicherung ist fertig', null, async () => {
    zustand.letzteSicherung = new Date().toISOString();
    await db.schreibeMeta('letzteSicherung', zustand.letzteSicherung);
    if (location.hash === '#/sicherung') zeigeSicherung();
  });
}

async function wiederherstellen(datei) {
  let daten;
  try {
    daten = pruefeSicherung(JSON.parse(await datei.text()));
  } catch (e) {
    meldung('Wiederherstellen nicht möglich', e instanceof SyntaxError ? 'Die Datei konnte nicht gelesen werden.' : e.message);
    return;
  }
  const ok = await fragen('Daten ersetzen?', `Die Sicherung enthält ${daten.jahre.length} Abrechnung(en). Alle aktuellen Daten auf diesem Gerät werden ersetzt.`, 'Ersetzen', true);
  if (!ok) return;
  speichereAlles();
  await db.ersetzeJahre(daten.jahre);
  await db.schreibeMeta('stammdaten', daten.stammdaten);
  zustand.stamm = daten.stammdaten;
  zustand.jahre = daten.jahre;
  meldung('Wiederhergestellt', 'Die Daten wurden erfolgreich wiederhergestellt.');
  zeigeSicherung();
}

// ---------- Navigation und Start ----------

const ICONS = {
  liste: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm3 5h8M8 12h8M8 16h5',
  stamm: 'M4 11 12 4l8 7M6 10v10h12V10M10 20v-6h4v6',
  sicherung: 'M12 16V5m-4 4 4-4 4 4M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4',
};

function zeichneTabs(aktiv) {
  const icon = (d) => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.append(p);
    return svg;
  };
  fuelle(document.getElementById('tabs'),
    ...[['#/', 'liste', 'Abrechnungen'], ['#/stammdaten', 'stamm', 'Stammdaten'], ['#/sicherung', 'sicherung', 'Sicherung']].map(([href, k, text]) => el('a', {
      href, class: aktiv === k ? 'aktiv' : '', 'aria-current': aktiv === k ? 'page' : false,
    }, icon(ICONS[k]), text)),
  );
}

function route() {
  speichereAlles();
  aktualisiereJahr = () => {};
  document.querySelectorAll('.modal-hinter').forEach((m) => m.remove());
  const teile = location.hash.replace(/^#\/?/, '').split('/');
  window.scrollTo(0, 0);
  if (teile[0] === 'jahr' && teile[1]) {
    zeichneTabs('liste');
    zeigeJahr(teile[1], teile[2] === 'ergebnis' ? 'ergebnis' : 'eingaben');
  } else if (teile[0] === 'stammdaten') {
    zeichneTabs('stamm');
    zeigeStammdaten();
  } else if (teile[0] === 'sicherung') {
    zeichneTabs('sicherung');
    zeigeSicherung();
  } else {
    zeichneTabs('liste');
    zeigeListe();
  }
}

async function start() {
  try {
    const [stamm, jahre, letzte, beispielErledigt] = await Promise.all([
      db.leseMeta('stammdaten'), db.leseJahre(), db.leseMeta('letzteSicherung'), db.leseMeta('beispielAngelegt'),
    ]);
    if (stamm) zustand.stamm = stamm;
    else await db.schreibeMeta('stammdaten', zustand.stamm);
    zustand.jahre = jahre;
    zustand.letzteSicherung = letzte || null;
    if (!beispielErledigt) {
      await db.schreibeMeta('beispielAngelegt', true);
      if (jahre.length === 0) await legeBeispielAn();
    }
    db.bitteUmDauerhaftenSpeicher();
  } catch (e) {
    fuelle(inhalt,el('div', { class: 'hinweis fehler' }, el('strong', {}, 'Der Speicher konnte nicht geöffnet werden'), String(e?.message || e)));
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();
