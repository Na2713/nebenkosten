// Deutsche Zahlen-, Geld- und Datumsformate sowie das Einlesen von Eingaben.

function gruppiere(ganzzahl) {
  return String(ganzzahl).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Cent (Ganzzahl) → „1.234,56 €“ */
export function euro(cent) {
  const c = Math.abs(Math.round(cent));
  const text = `${gruppiere(Math.floor(c / 100))},${String(c % 100).padStart(2, '0')} €`;
  return cent < 0 && c !== 0 ? `-${text}` : text;
}

/** Zahl mit festen Nachkommastellen im deutschen Format */
export function zahl(wert, stellen = 2) {
  const fest = Math.abs(wert).toFixed(stellen);
  const [ganz, nachkomma] = fest.split('.');
  const istNull = Number(fest) === 0;
  const vorzeichen = wert < 0 && !istNull ? '-' : '';
  return vorzeichen + gruppiere(ganz) + (nachkomma ? `,${nachkomma}` : '');
}

/** Zahl ohne überflüssige Nullen, höchstens `max` Nachkommastellen */
export function zahlKurz(wert, max = 4) {
  const [ganz, nachkomma = ''] = zahl(wert, max).split(',');
  const rest = nachkomma.replace(/0+$/, '');
  return rest ? `${ganz},${rest}` : ganz;
}

export function prozent(wert) {
  return `${zahl(wert, 2)} %`;
}

/** „2025-03-07“ → „07.03.2025“ */
export function datum(iso) {
  if (!iso) return '';
  const [j, m, t] = iso.split('-');
  return `${t}.${m}.${j}`;
}

/**
 * Liest eine Eingabe wie „1.234,56“, „1234,56“, „1234.56“ oder „0.325“.
 * Leere Eingabe ergibt 0, ungültige Eingabe ergibt null.
 */
export function leseZahl(text) {
  let s = String(text ?? '').trim().replace(/\s|€|%/g, '');
  if (s === '') return 0;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** ISO-Datum von heute in Ortszeit */
export function heuteISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
