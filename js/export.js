// Erzeugt PDF und Word aus dem Inhalt des Schreibens. Läuft vollständig im Browser.
const RECHTS_SPALTEN = [1, 3, 4, 5, 6];
const FARBE = [15, 92, 80];
const HELL = [232, 240, 237];

export function erzeugePdf(b, jsPDF) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const LINKS = 20;
  const BREITE = 170;
  const UNTEN = 280;
  let y = 20;

  const platz = (hoehe) => {
    if (y + hoehe > UNTEN) {
      doc.addPage();
      y = 20;
    }
  };

  const absatz = (text, { groesse = 10, fett = false, abstand = 3 } = {}) => {
    doc.setFont('helvetica', fett ? 'bold' : 'normal');
    doc.setFontSize(groesse);
    const zeilen = doc.splitTextToSize(text, BREITE);
    const hoehe = zeilen.length * groesse * 0.42;
    platz(hoehe);
    doc.text(zeilen, LINKS, y + groesse * 0.3);
    y += hoehe + abstand;
  };

  const ueberschrift = (text) => {
    platz(14);
    y += 2;
    absatz(text, { groesse: 11, fett: true, abstand: 2 });
  };

  const adresse = (a) => {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(a.name || '', LINKS, y);
    y += 4.6;
    doc.setFont('helvetica', 'normal');
    a.zeilen.forEach((z) => {
      doc.text(z, LINKS, y);
      y += 4.6;
    });
  };

  const kostenTabelle = (kopf, zeilen, summe) => {
    const spalten = {};
    const breiten = [37, 22, 27, 26, 20, 16, 22];
    breiten.forEach((b2, i) => {
      spalten[i] = { cellWidth: b2, halign: RECHTS_SPALTEN.includes(i) ? 'right' : 'left' };
    });
    doc.autoTable({
      startY: y,
      margin: { left: LINKS, right: 20, bottom: 18 },
      head: [kopf.map((k, i) => ({ content: k, styles: { halign: RECHTS_SPALTEN.includes(i) ? 'right' : 'left' } }))],
      body: zeilen,
      foot: [[
        { content: summe[0], colSpan: 6, styles: { halign: 'left' } },
        { content: summe[1], styles: { halign: 'right' } },
      ]],
      showFoot: 'lastPage',
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.4, lineColor: [190, 200, 196], lineWidth: 0.15, textColor: 30, overflow: 'linebreak' },
      headStyles: { fillColor: FARBE, textColor: 255, fontStyle: 'bold', valign: 'middle' },
      footStyles: { fillColor: HELL, textColor: 20, fontStyle: 'bold' },
      columnStyles: spalten,
    });
    y = doc.lastAutoTable.finalY + 5;
  };

  const betragsTabelle = (zeilen, ergebnis) => {
    doc.autoTable({
      startY: y,
      margin: { left: LINKS + 60, right: 20, bottom: 18 },
      body: [...zeilen, ergebnis],
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 10, cellPadding: 1.4, textColor: 30 },
      columnStyles: { 0: { cellWidth: 75 }, 1: { cellWidth: 35, halign: 'right' } },
      didParseCell: (d) => {
        if (d.row.index === zeilen.length) {
          d.cell.styles.fontStyle = 'bold';
          d.cell.styles.fillColor = HELL;
        }
      },
      rowPageBreak: 'avoid',
    });
    y = doc.lastAutoTable.finalY + 4;
  };

  adresse(b.absender);
  y = Math.max(y + 8, 50);
  adresse(b.empfaenger);
  y = Math.max(y + 6, 78);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(b.datum, LINKS + BREITE, y, { align: 'right' });
  y += 8;
  absatz(b.betreff, { groesse: 12, fett: true, abstand: 5 });
  absatz(b.anrede);
  absatz(b.einleitung, { abstand: 4 });
  kostenTabelle(b.kopf, b.tabelle, b.summe);

  ueberschrift('Ergebnis');
  betragsTabelle(b.ergebnis.zeilen, b.ergebnis.ergebnis);
  absatz(b.ergebnis.satz);

  ueberschrift('Erläuterung der Umlageschlüssel');
  b.erklaerungen.forEach((t) => absatz(t, { groesse: 9, abstand: 1.6 }));

  if (b.sonstige) {
    ueberschrift(b.sonstige.ueberschrift);
    absatz(b.sonstige.hinweis, { groesse: 9 });
    kostenTabelle(b.sonstige.kopf, b.sonstige.zeilen, b.sonstige.summe);
  }
  if (b.gesamt) {
    ueberschrift('Gesamtbetrag');
    betragsTabelle(b.gesamt.zeilen, b.gesamt.ergebnis);
  }
  if (b.zahlung) absatz(b.zahlung);

  ueberschrift('Belegeinsicht');
  absatz(b.belege);
  ueberschrift('Neue Vorauszahlung');
  absatz(b.vorauszahlung, { abstand: 6 });

  platz(24);
  absatz(b.gruss, { abstand: 14 });
  absatz(b.unterschrift);

  if (b.p35a) {
    doc.addPage();
    y = 20;
    absatz(b.p35a.ueberschrift, { groesse: 12, fett: true, abstand: 4 });
    absatz(b.p35a.text, { abstand: 4 });
    const rechts = [1, 2, 3];
    doc.autoTable({
      startY: y,
      margin: { left: LINKS, right: 20, bottom: 18 },
      head: [b.p35a.kopf.map((k, i) => ({ content: k, styles: { halign: rechts.includes(i) ? 'right' : 'left' } }))],
      body: b.p35a.zeilen,
      foot: [[
        { content: b.p35a.summe[0], colSpan: 3, styles: { halign: 'left' } },
        { content: b.p35a.summe[1], styles: { halign: 'right' } },
      ]],
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.8, lineColor: [190, 200, 196], lineWidth: 0.15, textColor: 30 },
      headStyles: { fillColor: FARBE, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: HELL, textColor: 20, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });
  }

  const seiten = doc.getNumberOfPages();
  for (let i = 1; i <= seiten; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(`Seite ${i} von ${seiten}`, LINKS + BREITE, 290, { align: 'right' });
  }
  doc.setProperties({ title: b.betreff });
  return doc;
}

export function erzeugeDocx(b, d) {
  const SCHRIFT_KLEIN = 16;

  const absatz = (text, { fett = false, groesse, danach = 120, ausrichtung } = {}) => new d.Paragraph({
    alignment: ausrichtung,
    spacing: { after: danach },
    children: [new d.TextRun({ text, bold: fett, size: groesse })],
  });
  const ueberschrift = (text) => new d.Paragraph({
    keepNext: true,
    spacing: { before: 200, after: 80 },
    children: [new d.TextRun({ text, bold: true, size: 22 })],
  });
  const adresse = (a, danach) => [
    absatz(a.name, { fett: true, danach: 0 }),
    ...a.zeilen.map((z, i) => absatz(z, { danach: i === a.zeilen.length - 1 ? danach : 0 })),
  ];

  const zelle = (text, breite, { rechts = false, fett = false, fuellung, farbe, groesse = SCHRIFT_KLEIN, spannweite } = {}) => new d.TableCell({
    width: { size: breite, type: d.WidthType.DXA },
    columnSpan: spannweite,
    verticalAlign: d.VerticalAlign.CENTER,
    shading: fuellung ? { type: d.ShadingType.CLEAR, fill: fuellung, color: 'auto' } : undefined,
    margins: { top: 40, bottom: 40, left: 60, right: 60 },
    children: [new d.Paragraph({
      alignment: rechts ? d.AlignmentType.RIGHT : d.AlignmentType.LEFT,
      children: [new d.TextRun({ text, bold: fett, size: groesse, color: farbe })],
    })],
  });

  const raster = (kopf, zeilen, summe, breiten, rechtsSpalten, groesse) => new d.Table({
    width: { size: breiten.reduce((s, x) => s + x, 0), type: d.WidthType.DXA },
    columnWidths: breiten,
    layout: d.TableLayoutType.FIXED,
    rows: [
      new d.TableRow({
        tableHeader: true,
        children: kopf.map((k, i) => zelle(k, breiten[i], { rechts: rechtsSpalten.includes(i), fett: true, fuellung: '0F5C50', farbe: 'FFFFFF', groesse })),
      }),
      ...zeilen.map((z) => new d.TableRow({
        cantSplit: true,
        children: z.map((t, i) => zelle(t, breiten[i], { rechts: rechtsSpalten.includes(i), groesse })),
      })),
      new d.TableRow({
        cantSplit: true,
        children: [
          zelle(summe[0], breiten.slice(0, -1).reduce((s, x) => s + x, 0), { fett: true, fuellung: 'E8F0ED', spannweite: breiten.length - 1, groesse }),
          zelle(summe[1], breiten[breiten.length - 1], { rechts: true, fett: true, fuellung: 'E8F0ED', groesse }),
        ],
      }),
    ],
  });

  const KOSTEN_BREITEN = [2100, 1250, 1530, 1480, 1130, 908, 1240];
  const kostenTabelle = (kopf, zeilen, summe) => raster(kopf, zeilen, summe, KOSTEN_BREITEN, RECHTS_SPALTEN);

  const betragsTabelle = (zeilen, ergebnis) => {
    const b1 = 4300;
    const b2 = 2000;
    return new d.Table({
      width: { size: b1 + b2, type: d.WidthType.DXA },
      columnWidths: [b1, b2],
      layout: d.TableLayoutType.FIXED,
      alignment: d.AlignmentType.RIGHT,
      rows: [
        ...zeilen.map((z) => new d.TableRow({ children: [zelle(z[0], b1, { groesse: 20 }), zelle(z[1], b2, { rechts: true, groesse: 20 })] })),
        new d.TableRow({ children: [
          zelle(ergebnis[0], b1, { fett: true, fuellung: 'E8F0ED', groesse: 20 }),
          zelle(ergebnis[1], b2, { rechts: true, fett: true, fuellung: 'E8F0ED', groesse: 20 }),
        ] }),
      ],
    });
  };

  const abstand = () => new d.Paragraph({ spacing: { after: 80 }, children: [] });

  const inhalt = [
    ...adresse(b.absender, 480),
    ...adresse(b.empfaenger, 240),
    absatz(b.datum, { ausrichtung: d.AlignmentType.RIGHT, danach: 240 }),
    absatz(b.betreff, { fett: true, groesse: 24, danach: 200 }),
    absatz(b.anrede),
    absatz(b.einleitung, { danach: 160 }),
    kostenTabelle(b.kopf, b.tabelle, b.summe),
    ueberschrift('Ergebnis'),
    betragsTabelle(b.ergebnis.zeilen, b.ergebnis.ergebnis),
    abstand(),
    absatz(b.ergebnis.satz),
    ueberschrift('Erläuterung der Umlageschlüssel'),
    ...b.erklaerungen.map((t) => absatz(t, { groesse: 18, danach: 60 })),
  ];

  if (b.sonstige) {
    inhalt.push(
      ueberschrift(b.sonstige.ueberschrift),
      absatz(b.sonstige.hinweis, { groesse: 18 }),
      kostenTabelle(b.sonstige.kopf, b.sonstige.zeilen, b.sonstige.summe),
    );
  }
  if (b.gesamt) {
    inhalt.push(ueberschrift('Gesamtbetrag'), betragsTabelle(b.gesamt.zeilen, b.gesamt.ergebnis), abstand());
  }
  if (b.zahlung) inhalt.push(absatz(b.zahlung));
  inhalt.push(
    ueberschrift('Belegeinsicht'),
    absatz(b.belege),
    ueberschrift('Neue Vorauszahlung'),
    absatz(b.vorauszahlung, { danach: 280 }),
    absatz(b.gruss, { danach: 560 }),
    absatz(b.unterschrift),
  );

  if (b.p35a) {
    inhalt.push(
      new d.Paragraph({ pageBreakBefore: true, spacing: { after: 120 }, children: [new d.TextRun({ text: b.p35a.ueberschrift, bold: true, size: 24 })] }),
      absatz(b.p35a.text, { danach: 160 }),
      raster(b.p35a.kopf, b.p35a.zeilen, b.p35a.summe, [4438, 1900, 1400, 1900], [1, 2, 3], 18),
    );
  }

  return new d.Document({
    title: b.betreff,
    styles: { default: { document: { run: { font: 'Arial', size: 20 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
      footers: {
        default: new d.Footer({
          children: [new d.Paragraph({
            alignment: d.AlignmentType.RIGHT,
            children: [new d.TextRun({ size: 16, children: ['Seite ', d.PageNumber.CURRENT, ' von ', d.PageNumber.TOTAL_PAGES] })],
          })],
        }),
      },
      children: inhalt.filter(Boolean),
    }],
  });
}
