// Datenmodell: neue Jahre, Vorlagen, Beispieldaten und Prüfung von Sicherungen.

export const APP_KENNUNG = 'nebenkosten-einliegerwohnung';
export const DATEN_VERSION = 1;

export function neueId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function leereStammdaten() {
  return {
    vermieter: { name: '', adresse: '' },
    mieterin: { name: '', adresse: '' },
    flaechen: { haupt: 187.69, einlieger: 77.01 },
  };
}

export function neuePosition(name, schluessel, extra = {}) {
  return {
    id: neueId(),
    name,
    betrag: 0,
    intervall: 'jahr',
    schluessel,
    prozent: 0,
    verbrauch: {
      art: 'anteil',
      anfang: 0,
      ende: 0,
      preis: 0,
      grundpreis: 0,
      grundpreisIntervall: 'monat',
      gesamt: 0,
      mieter: 0,
      einheit: 'kWh',
    },
    p35a: { aktiv: false, art: 'euro', wert: 0 },
    ...extra,
  };
}

function zaehlerPosition(name) {
  const pos = neuePosition(name, 'verbrauch');
  pos.verbrauch.art = 'zaehler';
  return pos;
}

export function standardKosten() {
  return [
    neuePosition('Grundsteuer', 'flaeche'),
    neuePosition('Gebäudeversicherung', 'flaeche'),
    neuePosition('Strom Wärmepumpe (Heizung/Warmwasser)', 'flaeche'),
    neuePosition('Frischwasser', 'personen'),
    neuePosition('Abwasser/Kanal', 'personen'),
    neuePosition('Müllabfuhr', 'personen'),
    zaehlerPosition('Strom Einliegerwohnung'),
    neuePosition('Allgemeinstrom', 'flaeche'),
  ];
}

export function neuesJahr(jahr) {
  return {
    id: neueId(),
    jahr,
    von: `${jahr}-01-01`,
    bis: `${jahr}-12-31`,
    personen: { haupt: 4, einlieger: 1 },
    vorauszahlungen: 0,
    zuschlagProzent: 0,
    kosten: standardKosten(),
    sonstige: [neuePosition('Telefon/Internet', 'mieterin')],
    beispiel: false,
  };
}

/** Übernimmt ein Jahr als Vorlage; der alte Endstand wird neuer Anfangsstand. */
export function jahrAusVorlage(vorlage, jahr) {
  const kopie = JSON.parse(JSON.stringify(vorlage));
  kopie.id = neueId();
  kopie.jahr = jahr;
  kopie.von = `${jahr}-01-01`;
  kopie.bis = `${jahr}-12-31`;
  delete kopie.briefDatum;
  for (const pos of [...kopie.kosten, ...kopie.sonstige]) {
    pos.id = neueId();
    if (pos.verbrauch?.art === 'zaehler') {
      pos.verbrauch.anfang = pos.verbrauch.ende;
    }
  }
  return kopie;
}

/** Fiktive Beispielabrechnung zum Ausprobieren. Ändert die echten Stammdaten nicht. */
export function beispielJahr() {
  const j = neuesJahr(2025);
  j.beispiel = true;
  j.stammdatenBeispiel = {
    vermieter: { name: 'Max Mustermann', adresse: 'Musterweg 12\n12345 Musterstadt' },
    mieterin: { name: 'Erika Beispiel', adresse: 'Musterweg 12 (Einliegerwohnung)\n12345 Musterstadt' },
    flaechen: { haupt: 187.69, einlieger: 77.01 },
  };
  j.vorauszahlungen = 1800;
  const setze = (name, betrag, intervall = 'jahr') => {
    const pos = j.kosten.find((p) => p.name.startsWith(name));
    pos.betrag = betrag;
    pos.intervall = intervall;
    return pos;
  };
  setze('Grundsteuer', 412.36);
  setze('Gebäudeversicherung', 684.5);
  setze('Strom Wärmepumpe', 215, 'monat');
  setze('Frischwasser', 398.2);
  setze('Abwasser', 516.75);
  setze('Müllabfuhr', 27.5, 'monat');
  setze('Allgemeinstrom', 96.4);
  const strom = j.kosten.find((p) => p.verbrauch.art === 'zaehler');
  Object.assign(strom.verbrauch, { anfang: 18240, ende: 20615, preis: 0.3214, grundpreis: 6.5, grundpreisIntervall: 'monat' });

  const garten = neuePosition('Gartenpflege', 'flaeche', { betrag: 480 });
  garten.p35a = { aktiv: true, art: 'euro', wert: 300 };
  const schornstein = neuePosition('Schornsteinfeger', 'flaeche', { betrag: 86.4 });
  schornstein.p35a = { aktiv: true, art: 'prozent', wert: 80 };
  j.kosten.push(garten, schornstein);

  j.sonstige[0].betrag = 20;
  j.sonstige[0].intervall = 'monat';
  return j;
}

function istObjekt(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function normalisierePosition(p) {
  if (!istObjekt(p) || typeof p.name !== 'string') throw new Error('Eine Kostenart in der Sicherung ist unvollständig.');
  const basis = neuePosition(p.name, p.schluessel || 'flaeche');
  return {
    ...basis,
    ...p,
    id: p.id || basis.id,
    verbrauch: { ...basis.verbrauch, ...(p.verbrauch || {}) },
    p35a: { ...basis.p35a, ...(p.p35a || {}) },
  };
}

/** Prüft eine eingelesene Sicherung und liefert bereinigte Daten; wirft bei Fehlern. */
export function pruefeSicherung(daten) {
  if (!istObjekt(daten) || daten.app !== APP_KENNUNG) {
    throw new Error('Diese Datei ist keine Sicherung dieser App.');
  }
  if (typeof daten.version !== 'number' || daten.version > DATEN_VERSION) {
    throw new Error('Diese Sicherung stammt von einer neueren Version der App.');
  }
  if (!istObjekt(daten.stammdaten) || !Array.isArray(daten.jahre)) {
    throw new Error('Die Sicherung ist unvollständig.');
  }
  const leer = leereStammdaten();
  const s = daten.stammdaten;
  const stammdaten = {
    vermieter: { ...leer.vermieter, ...(s.vermieter || {}) },
    mieterin: { ...leer.mieterin, ...(s.mieterin || {}) },
    flaechen: { ...leer.flaechen, ...(s.flaechen || {}) },
  };
  const jahre = daten.jahre.map((j) => {
    if (!istObjekt(j) || !Number.isInteger(j.jahr) || !Array.isArray(j.kosten) || !Array.isArray(j.sonstige)) {
      throw new Error('Ein Abrechnungsjahr in der Sicherung ist unvollständig.');
    }
    return {
      ...neuesJahr(j.jahr),
      ...j,
      id: j.id || neueId(),
      personen: { haupt: 4, einlieger: 1, ...(j.personen || {}) },
      kosten: j.kosten.map(normalisierePosition),
      sonstige: j.sonstige.map(normalisierePosition),
    };
  });
  return { stammdaten, jahre };
}
