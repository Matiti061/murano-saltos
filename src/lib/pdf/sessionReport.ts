import { jsPDF } from 'jspdf';
import autoTable, { type CellHookData } from 'jspdf-autotable';
import { complaintLabel } from '../../db/complaints';
import { ATTENDANCE_LABEL, SESSION_TYPE_LABEL } from '../../db/types';
import { fmtDateLong, fmtNum, fmtTime, slug } from '../format';
import type { AcwrStatus, LimitState } from '../metrics';
import { playerLabel, type SessionReportData } from '../report';

type RGB = [number, number, number];

// Naranjo del club; el oscuro se usa para texto y cabeceras de tabla (mejor contraste).
const BRAND: RGB = [234, 88, 12];
const BRAND_DARK: RGB = [194, 65, 12];
const TEXT: RGB = [30, 41, 59];
const MUTED: RGB = [100, 116, 139];
const BORDER: RGB = [226, 232, 240];

const ACWR_FILL: Record<AcwrStatus, RGB> = {
  insuficiente: [241, 245, 249],
  bajo: [219, 234, 254],
  optimo: [220, 252, 231],
  alto: [254, 243, 199],
  muy_alto: [254, 202, 202],
};

const LIMIT_FILL: Record<LimitState, RGB | null> = {
  none: null,
  ok: [220, 252, 231],
  warn: [254, 243, 199],
  over: [254, 202, 202],
};

const BAR_FILL: Record<LimitState, RGB> = {
  none: [71, 85, 105],
  ok: [34, 197, 94],
  warn: [245, 158, 11],
  over: [220, 38, 38],
};

const MARGIN = 14;

const fmtRatio = (r: number | null) => (r == null ? '–' : fmtNum(r, 2));
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function lastY(doc: jsPDF, fallback: number): number {
  return (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fallback;
}

export function sessionPdfFilename(data: SessionReportData): string {
  const team = data.team ? slug(data.team.name) : 'Equipo';
  const kind = data.session.type === 'entrenamiento' ? 'Entreno' : capital(data.session.type);
  return `${kind}_${team}_${data.session.date}.pdf`;
}

/** `defaultLogo`: escudo del club en data URL, si no se ha subido uno propio en Ajustes. */
export function createSessionPdf(data: SessionReportData, defaultLogo?: string): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  const { session, settings } = data;

  /** Salta de página si no caben `needed` mm desde `y`. */
  const ensureSpace = (y: number, needed: number) => {
    if (y + needed > pageH - 18) {
      doc.addPage();
      return MARGIN + 4;
    }
    return y;
  };

  /** Título de sección; `needed` evita dejar el título (y pocas filas) solo al pie de página. */
  const sectionTitle = (title: string, y: number, needed = 16) => {
    y = ensureSpace(y, needed);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...BRAND_DARK);
    doc.text(title, MARGIN, y);
    doc.setDrawColor(...BRAND);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y + 1.5, MARGIN + contentW, y + 1.5);
    return y + 6;
  };

  // ---- Cabecera: fondo blanco (mejor para imprimir) con el logo y una franja naranja ----
  let textX = MARGIN;
  const logo = settings.logoDataUrl ?? defaultLogo;
  if (logo) {
    try {
      const props = doc.getImageProperties(logo);
      const h = 22;
      const w = Math.min(40, (props.width / props.height) * h);
      doc.addImage(logo, props.fileType, MARGIN, 7, w, h);
      textX = MARGIN + w + 6;
    } catch {
      // Logo no válido: se omite.
    }
  }
  doc.setTextColor(...TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(settings.clubName || 'Informe', textX, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...BRAND_DARK);
  const title = `Informe de ${SESSION_TYPE_LABEL[session.type].toLowerCase()}${data.team ? ` · ${data.team.name}` : ''}`;
  doc.text(title, textX, 22);
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(capital(fmtDateLong(session.date)), textX, 28);
  doc.setFillColor(...BRAND);
  doc.rect(0, 33, pageW, 1.6, 'F');

  // ---- Datos de la sesión ----
  let y = 43;
  const timeRange =
    session.mode === 'manual'
      ? 'Registro manual'
      : `${fmtTime(session.startedAt)}${session.endedAt ? ` – ${fmtTime(session.endedAt)}` : ' (en curso)'}`;
  const info: [string, string][] = [
    ['Horario', timeRange],
    ['Duración', session.durationMin != null ? `${session.durationMin} min` : '–'],
    ['Tipo', SESSION_TYPE_LABEL[session.type]],
    ['Asistencia', `${data.totals.present} de ${data.totals.convened}`],
  ];
  doc.setFontSize(9);
  const colW = contentW / info.length;
  info.forEach(([k, v], i) => {
    const x = MARGIN + i * colW;
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.text(k.toUpperCase(), x, y);
    doc.setTextColor(...TEXT);
    doc.setFont('helvetica', 'bold');
    doc.text(v, x, y + 5);
  });
  y += 12;

  // ---- Resumen en tarjetas ----
  const tiles: [string, string][] = [
    ['Saltos totales', fmtNum(data.totals.jumps)],
    ['Media por jugadora', fmtNum(data.totals.avg, 1)],
    ['Máximo', data.totals.max ? `${data.totals.max.jumps}` : '–'],
    ['Ejercicios', String(data.blocks.length)],
  ];
  const tileGap = 4;
  const tileW = (contentW - tileGap * (tiles.length - 1)) / tiles.length;
  tiles.forEach(([label, value], i) => {
    const x = MARGIN + i * (tileW + tileGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(x, y, tileW, 18, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(label, x + 3, y + 5.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...TEXT);
    doc.text(value, x + 3, y + 14);
  });
  if (data.totals.max) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    const maxX = MARGIN + 2 * (tileW + tileGap);
    const name = doc.splitTextToSize(data.totals.max.name, tileW - 16)[0] as string;
    doc.text(name, maxX + tileW - 3, y + 14, { align: 'right' });
  }
  y += 26;

  // ---- Gráfica de barras ----
  if (data.rows.length > 0) {
    y = sectionTitle('Saltos por jugadora', y);
    const barH = 4.6;
    const gap = 1.6;
    const labelW = 44;
    const valueW = 16;
    const chartW = contentW - labelW - valueW;
    const maxValue = Math.max(1, ...data.rows.map((r) => Math.max(r.jumps, r.limit ?? 0)));
    for (const r of data.rows) {
      y = ensureSpace(y, barH + gap);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...TEXT);
      const label = doc.splitTextToSize(playerLabel(r.player), labelW - 2)[0] as string;
      doc.text(label, MARGIN, y + barH - 1.2);
      const x0 = MARGIN + labelW;
      doc.setFillColor(241, 245, 249);
      doc.rect(x0, y, chartW, barH, 'F');
      const w = (Math.max(0, r.jumps) / maxValue) * chartW;
      if (w > 0) {
        doc.setFillColor(...BAR_FILL[r.limitState]);
        doc.rect(x0, y, w, barH, 'F');
      }
      if (r.limit) {
        const lx = x0 + (r.limit / maxValue) * chartW;
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.5);
        doc.line(lx, y - 0.6, lx, y + barH + 0.6);
      }
      doc.setFont('helvetica', 'bold');
      doc.text(String(r.jumps), x0 + chartW + 2, y + barH - 1.2);
      y += barH + gap;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(
      `La línea vertical marca el límite individual. Gris: sin límite · Verde < ${settings.limitWarnPct}% · Ámbar ${settings.limitWarnPct}–99% · Rojo: límite alcanzado.`,
      MARGIN,
      y + 2,
    );
    y += 8;
  }

  // ---- Tabla por jugadora ----
  if (data.rows.length > 0) {
    y = sectionTitle('Detalle por jugadora', y, 50);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Jugadora', 'Posición', 'Saltos', 'Límite', '%', 'Min', 'RPE', 'sRPE', 'Wellness', 'ACWR saltos', 'ACWR sRPE']],
      body: data.rows.map((r) => [
        r.player.name + (r.attendance.status === 'parcial' ? ' (parcial)' : ''),
        r.player.position,
        r.jumps,
        r.limit ?? '–',
        r.limitPct != null ? `${r.limitPct}%` : '–',
        r.minutes ?? '–',
        r.rpe ?? '–',
        r.srpe ?? '–',
        r.wellnessTotal != null ? `${r.wellnessTotal}/20` : '–',
        fmtRatio(r.acwrJumps.ratio),
        fmtRatio(r.acwrSrpe.ratio),
      ]),
      styles: { fontSize: 8, cellPadding: 1.6, textColor: TEXT, lineColor: BORDER, lineWidth: 0.1 },
      headStyles: { fillColor: BRAND_DARK, textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: {
        2: { halign: 'right', fontStyle: 'bold' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'center' },
        9: { halign: 'center' },
        10: { halign: 'center' },
      },
      didParseCell: (hook: CellHookData) => {
        if (hook.section !== 'body') return;
        const r = data.rows[hook.row.index];
        if (hook.column.index === 4) {
          const fill = LIMIT_FILL[r.limitState];
          if (fill) hook.cell.styles.fillColor = fill;
        }
        if (hook.column.index === 8 && (r.wellnessLow.length > 0 || r.wellnessDrop)) {
          hook.cell.styles.fillColor = ACWR_FILL.alto;
        }
        if (hook.column.index === 9) hook.cell.styles.fillColor = ACWR_FILL[r.acwrJumps.status];
        if (hook.column.index === 10) hook.cell.styles.fillColor = ACWR_FILL[r.acwrSrpe.status];
      },
    });
    y = lastY(doc, y) + 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    const legend = doc.splitTextToSize(
      `ACWR = carga de los últimos 7 días / media semanal de los últimos 28 días (necesita al menos 3 semanas de datos). ` +
        `Azul < ${fmtNum(settings.acwrLow, 1)} carga baja · Verde ${fmtNum(settings.acwrLow, 1)}–${fmtNum(settings.acwrHigh, 1)} óptimo · ` +
        `Ámbar hasta ${fmtNum(settings.acwrVeryHigh, 1)} pico de carga · Rojo > ${fmtNum(settings.acwrVeryHigh, 1)} pico alto. ` +
        `sRPE = RPE × minutos. Wellness: suma de sueño, fatiga, dolor muscular y estrés (1-5 cada uno, 20 = óptimo).`,
      contentW,
    ) as string[];
    doc.text(legend, MARGIN, y);
    y += legend.length * 3 + 6;
  }

  // ---- Saltos por ejercicio (matriz) ----
  if (data.blocks.length > 0 && data.rows.length > 0) {
    y = sectionTitle('Saltos por ejercicio y jugadora', y, Math.min(90, 20 + (data.rows.length + 2) * 6));
    const head = ['Jugadora', ...data.blocks.map((b) => `${b.block.order}. ${b.block.name}`)];
    if (data.showNoBlock) head.push('Sin ejercicio / ajuste');
    head.push('Total');
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [head],
      body: [
        ...data.rows.map((r) => {
          const row: (string | number)[] = [playerLabel(r.player), ...data.blocks.map((b) => r.perBlock[b.block.id!] ?? 0)];
          if (data.showNoBlock) row.push(r.noBlock);
          row.push(r.jumps);
          return row;
        }),
        (() => {
          const row: (string | number)[] = ['Total equipo', ...data.blocks.map((b) => b.jumps)];
          if (data.showNoBlock) row.push(data.rows.reduce((a, r) => a + r.noBlock, 0));
          row.push(data.totals.jumps);
          return row;
        })(),
      ],
      horizontalPageBreak: true,
      horizontalPageBreakRepeat: 0,
      styles: { fontSize: 7.5, cellPadding: 1.4, textColor: TEXT, lineColor: BORDER, lineWidth: 0.1, halign: 'right' },
      headStyles: { fillColor: BRAND_DARK, textColor: 255, fontSize: 7, halign: 'center' },
      columnStyles: { 0: { halign: 'left', cellWidth: 40 } },
      didParseCell: (hook: CellHookData) => {
        if (hook.section === 'body' && hook.row.index === data.rows.length) {
          hook.cell.styles.fontStyle = 'bold';
          hook.cell.styles.fillColor = [241, 245, 249];
        }
        if (hook.section === 'body' && hook.column.index === head.length - 1) hook.cell.styles.fontStyle = 'bold';
      },
    });
    y = lastY(doc, y) + 8;

    y = sectionTitle('Resumen por ejercicio', y, 30);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['#', 'Ejercicio', 'Inicio', 'Duración (min)', 'Saltos', 'Saltos/min', 'Media por jugadora']],
      body: data.blocks.map((b) => [
        b.block.order,
        b.block.name,
        fmtTime(b.block.startedAt),
        fmtNum(b.durationMin, 0),
        b.jumps,
        fmtNum(b.perMin, 1),
        fmtNum(data.rows.length ? b.jumps / data.rows.length : null, 1),
      ]),
      styles: { fontSize: 8, cellPadding: 1.6, textColor: TEXT, lineColor: BORDER, lineWidth: 0.1 },
      headStyles: { fillColor: BRAND_DARK, textColor: 255, fontSize: 7.5 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
    });
    y = lastY(doc, y) + 8;
  }

  // ---- Alertas ----
  y = sectionTitle('Alertas', y);
  doc.setFontSize(8.5);
  if (data.alerts.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text('Sin alertas en este entrenamiento.', MARGIN, y + 1);
    y += 7;
  } else {
    for (const a of data.alerts) {
      const lines = doc.splitTextToSize(a.text, contentW - 8) as string[];
      y = ensureSpace(y, lines.length * 4 + 2);
      doc.setFillColor(...(a.level === 'alta' ? ([220, 38, 38] as RGB) : ([245, 158, 11] as RGB)));
      doc.circle(MARGIN + 1.5, y - 0.2, 1.3, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...TEXT);
      doc.text(lines, MARGIN + 5, y + 0.8);
      y += lines.length * 4 + 1.5;
    }
    y += 4;
  }

  // ---- Molestias ----
  if (data.complaints.length > 0) {
    y = sectionTitle('Molestias y lesiones registradas', y);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Jugadora', 'Tipo', 'Zona', 'Intensidad', 'Descripción']],
      body: data.complaints.map(({ complaint: c, player }) => [
        player ? playerLabel(player) : '–',
        c.kind === 'lesion' ? 'Lesión' : 'Molestia',
        complaintLabel(c).replace(/ \(\d+\/10\)$/, ''),
        `${c.intensity}/10`,
        [c.description, c.physioNotes ? `Fisio: ${c.physioNotes}` : ''].filter(Boolean).join(' · ') || '–',
      ]),
      styles: { fontSize: 8, cellPadding: 1.6, textColor: TEXT, lineColor: BORDER, lineWidth: 0.1 },
      headStyles: { fillColor: BRAND_DARK, textColor: 255, fontSize: 7.5 },
      columnStyles: { 3: { halign: 'center' }, 4: { cellWidth: 70 } },
    });
    y = lastY(doc, y) + 8;
  }

  // ---- Ausencias ----
  if (data.absent.length > 0) {
    y = sectionTitle('No entrenan', y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT);
    const text = data.absent.map((a) => `${playerLabel(a.player)}: ${ATTENDANCE_LABEL[a.status].toLowerCase()}`).join(' · ');
    const lines = doc.splitTextToSize(text, contentW) as string[];
    y = ensureSpace(y, lines.length * 4);
    doc.text(lines, MARGIN, y + 1);
    y += lines.length * 4 + 6;
  }

  // ---- Notas ----
  if (session.notes) {
    y = sectionTitle('Notas', y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT);
    const lines = doc.splitTextToSize(session.notes, contentW) as string[];
    for (const line of lines) {
      y = ensureSpace(y, 5);
      doc.text(line, MARGIN, y + 1);
      y += 4.5;
    }
  }

  // ---- Pie de página ----
  const pages = doc.getNumberOfPages();
  const generated = new Date();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, pageH - 12, pageW - MARGIN, pageH - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(
      `Generado el ${generated.toLocaleDateString('es-ES')} a las ${fmtTime(generated.getTime())} · Herramienta de seguimiento orientativa; no sustituye la valoración médica.`,
      MARGIN,
      pageH - 7,
    );
    doc.text(`Página ${i} de ${pages}`, pageW - MARGIN, pageH - 7, { align: 'right' });
  }

  return doc;
}
