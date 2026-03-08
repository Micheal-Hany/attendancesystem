/**
 * PDF Export — renders an off-screen HTML div with Cairo font,
 * captures via html2canvas (which handles Arabic/RTL correctly),
 * then slices into A4 pages in jsPDF.
 */
import jsPDF from 'jspdf';
import { Language, Class, Student, Attendance, SessionType } from '@/types';
import { t, monthName } from '@/i18n';

function pctCalc(p: number, total: number) { return total > 0 ? Math.round(p / total * 100) : 0; }
function badgeStyle(p: number) {
  if (p >= 75) return 'background:#dcfce7;color:#15803d';
  if (p >= 50) return 'background:#fef3c7;color:#92400e';
  if (p > 0)   return 'background:#fee2e2;color:#991b1b';
  return 'background:#f1f5f9;color:#94a3b8';
}
function barColor(p: number) { return p >= 75 ? '#16a34a' : p >= 50 ? '#d97706' : '#dc2626'; }

export async function exportPDF(opts: {
  classes: Class[];
  students: Student[];
  attendance: Attendance[];
  month: number;
  year: number;
  lang: Language;
  minAttendance?: number;
  maxAttendance?: number;
}) {
  const { classes, students, attendance, month, year, lang } = opts;
  const minAtt = opts.minAttendance ?? 0;
  const maxAtt = opts.maxAttendance ?? 999;
  const isRTL = lang === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';
  const font = "'Cairo', 'Segoe UI', Arial, sans-serif";

  const sessions: SessionType[] = ['mass', 'sunday_school', 'tasbeha'];
  const sessInfo: Record<string, { ar: string; en: string; color: string }> = {
    mass:          { ar: 'قداس',         en: 'Liturgy',       color: '#7c3aed' },
    sunday_school: { ar: 'مدارس الاحد',  en: 'Sunday School', color: '#0284c7' },
    tasbeha:       { ar: 'تسبحه',         en: 'Tasbeha',       color: '#b45309' },
  };

  const title = `${t(lang, 'monthly_report')} — ${monthName(lang, month)} ${year}`;
  const activeStudents = students.filter(s => s.is_active);

  // ── Build per-class rows ──────────────────────────────────
  let tablesHTML = '';
  const sortedClasses = [...classes]
    .filter(c => activeStudents.some(s => s.class_id === c.id))
    .sort((a, b) => a.sort_order - b.sort_order);

  let grandPresent = 0, grandTotal = 0, grandStudents = 0;

  for (const cls of sortedClasses) {
    const clsStudents = activeStudents.filter(s => s.class_id === cls.id);
    if (!clsStudents.length) continue;

    const clsName = lang === 'ar' ? cls.name_ar : cls.name_en;
    const isBoys  = cls.gender === 'boys';
    const hdrBg   = isBoys ? '#1d4ed8' : '#be185d';

    const rows = clsStudents.map(st => {
      const sa     = attendance.filter(a => a.student_id === st.id);
      const counts = sessions.map(s => sa.filter(a => a.session_type === s && a.is_present).length);
      const tot    = counts.reduce((a, b) => a + b, 0);
      const poss   = sa.length;
      const p      = pctCalc(tot, poss);
      return { st, counts, tot, poss, pct: p };
    }).filter(r => r.tot >= minAtt && r.tot <= maxAtt);

    if (!rows.length) continue;

    grandStudents += rows.length;
    grandPresent  += rows.reduce((s, r) => s + r.tot, 0);
    grandTotal    += rows.reduce((s, r) => s + r.poss, 0);

    const totQ   = rows.reduce((s, r) => s + r.counts[0], 0);
    const totSS  = rows.reduce((s, r) => s + r.counts[1], 0);
    const totTb  = rows.reduce((s, r) => s + r.counts[2], 0);
    const totT   = rows.reduce((s, r) => s + r.tot, 0);
    const totP   = rows.reduce((s, r) => s + r.poss, 0);
    const totPct = pctCalc(totT, totP);

    const rowsHTML = rows.map((r, i) => `
      <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'}">
        <td style="text-align:center;color:#94a3b8;font-size:11px;padding:7px 5px">${i + 1}</td>
        <td style="padding:7px 10px;font-weight:600;font-size:13px">${r.st.full_name}</td>
        ${r.counts.map((c, ci) => `<td style="text-align:center;font-weight:700;color:${sessInfo[sessions[ci]].color};padding:7px">${c || '—'}</td>`).join('')}
        <td style="text-align:center;font-weight:700;padding:7px">
          ${r.tot}<span style="font-size:10px;color:#94a3b8">/${r.poss}</span>
        </td>
        <td style="text-align:center;padding:7px">
          <span style="${badgeStyle(r.pct)};padding:2px 9px;border-radius:99px;font-size:11px;font-weight:700">
            ${r.poss > 0 ? `${r.pct}%` : '—'}
          </span>
        </td>
      </tr>`).join('');

    const barsHTML = rows.map(r => `
      <div style="display:flex;align-items:center;gap:10px;padding:6px 12px;border-bottom:1px solid #f1f5f9">
        <div style="width:150px;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0">${r.st.full_name}</div>
        <div style="flex:1;height:10px;background:#e2e8f0;border-radius:99px;overflow:hidden">
          <div style="width:${r.pct}%;height:10px;background:${barColor(r.pct)};border-radius:99px;transition:width .3s"></div>
        </div>
        <div style="width:40px;text-align:end;font-size:12px;font-weight:800;color:${barColor(r.pct)};flex-shrink:0">${r.tot > 0 ? `${r.pct}%` : '—'}</div>
        <div style="width:36px;text-align:end;font-size:10px;color:#94a3b8;flex-shrink:0">${r.tot}/${r.poss}</div>
      </div>`).join('');

    tablesHTML += `
      <div style="margin-bottom:24px;page-break-inside:avoid">
        <div style="background:${hdrBg};color:white;padding:10px 16px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:15px;font-weight:800">${clsName}</span>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:12px;opacity:.8">${rows.length} ${lang === 'ar' ? 'طالب' : 'students'}</span>
            <span style="font-size:14px;font-weight:800;background:rgba(255,255,255,.22);padding:3px 12px;border-radius:99px">${totPct}%</span>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-family:${font}">
          <thead>
            <tr style="background:#4338ca">
              <th style="color:white;padding:8px 5px;font-size:11px;text-align:center;width:28px">#</th>
              <th style="color:white;padding:8px 10px;font-size:11px;text-align:${isRTL ? 'right' : 'left'}">${t(lang, 'full_name')}</th>
              ${sessions.map(s => `<th style="color:white;padding:8px;font-size:11px;text-align:center">${lang === 'ar' ? sessInfo[s].ar : sessInfo[s].en}</th>`).join('')}
              <th style="color:white;padding:8px;font-size:11px;text-align:center">${t(lang, 'total')}</th>
              <th style="color:white;padding:8px;font-size:11px;text-align:center">%</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHTML}
            <tr style="background:#eef2ff">
              <td colspan="2" style="padding:8px 10px;font-weight:800;font-size:13px;color:#374151">
                ${t(lang, 'class_total')}
              </td>
              <td style="text-align:center;font-weight:800;color:#7c3aed">${totQ}</td>
              <td style="text-align:center;font-weight:800;color:#0284c7">${totSS}</td>
              <td style="text-align:center;font-weight:800;color:#b45309">${totTb}</td>
              <td style="text-align:center;font-weight:800;color:#3730a3">${totT}</td>
              <td style="text-align:center">
                <span style="${badgeStyle(totPct)};padding:2px 9px;border-radius:99px;font-size:11px;font-weight:700">
                  ${totP > 0 ? `${totPct}%` : '—'}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Visual attendance bars -->
        <div style="border:1px solid #e2e8f0;border-top:2px solid #4338ca;background:#fff;border-radius:0 0 10px 10px">
          <div style="padding:8px 12px 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #f1f5f9">
            ${lang === 'ar' ? 'مستوى الحضور البصري' : 'Visual Attendance Level'}
          </div>
          ${barsHTML}
        </div>
      </div>`;
  }

  const overallPct = pctCalc(grandPresent, grandTotal);

  const filterBanner = (minAtt > 0 || maxAtt < 999)
    ? `<div style="background:#fef3c7;border:1.5px solid #fde68a;border-radius:10px;padding:10px 16px;margin-bottom:20px;font-size:13px;color:#92400e;font-weight:700;display:flex;align-items:center;gap:8px">
        <span>🔍</span>
        <span>${lang === 'ar' ? `فلتر الحضور: من ${minAtt} إلى ${maxAtt === 999 ? '∞' : maxAtt} جلسة` : `Attendance filter: ${minAtt}–${maxAtt === 999 ? '∞' : maxAtt} sessions`}</span>
       </div>`
    : '';

  const htmlDoc = `<!DOCTYPE html>
<html dir="${dir}" lang="${lang}">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ${font}; direction: ${dir}; color: #1e293b; background: #fff; width: 860px; padding: 28px; }
  table { font-family: ${font}; }
  td, th { font-family: ${font}; }
</style>
</head>
<body>

  <!-- Header banner -->
  <div style="background:linear-gradient(135deg,#3730a3,#7c3aed);color:white;border-radius:16px;padding:20px 28px;margin-bottom:22px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="font-size:22px;font-weight:800;line-height:1.3">${title}</div>
      <div style="opacity:.75;font-size:13px;margin-top:5px">${t(lang, 'app_name')}</div>
    </div>
    <div style="text-align:${isRTL ? 'left' : 'right'}">
      <div style="font-size:32px;font-weight:800;line-height:1">${overallPct}%</div>
      <div style="opacity:.7;font-size:12px;margin-top:3px">${lang === 'ar' ? 'إجمالي الحضور' : 'Overall Attendance'}</div>
    </div>
  </div>

  <!-- Summary cards -->
  <div style="display:flex;gap:12px;margin-bottom:22px">
    ${[
      { label: lang === 'ar' ? 'الطلاب' : 'Students',        value: String(grandStudents), color: '#4338ca' },
      { label: lang === 'ar' ? 'حضور' : 'Attendances',       value: String(grandPresent), color: '#16a34a' },
      { label: lang === 'ar' ? 'جلسات' : 'Sessions',         value: String(grandTotal),   color: '#0891b2' },
      { label: lang === 'ar' ? 'متوسط' : 'Average',          value: `${overallPct}%`,     color: barColor(overallPct) },
    ].map(s => `<div style="flex:1;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:14px;text-align:center">
      <div style="font-size:24px;font-weight:800;color:${s.color}">${s.value}</div>
      <div style="font-size:11px;color:#64748b;margin-top:3px;font-weight:600">${s.label}</div>
    </div>`).join('')}
  </div>

  ${filterBanner}
  ${tablesHTML}

  <div style="margin-top:20px;padding-top:14px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px">
    ${lang === 'ar'
      ? `تم الإنشاء بتاريخ ${new Date().toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' })}`
      : `Generated on ${new Date().toLocaleDateString('en-GB', { year:'numeric', month:'long', day:'numeric' })}`
    }
  </div>
</body>
</html>`;

  // ── Render off-screen ────────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:860px;z-index:-999;background:#fff;overflow:hidden;';
  wrapper.innerHTML = htmlDoc;
  document.body.appendChild(wrapper);

  // Wait for Cairo font to load from Google Fonts
  try { await document.fonts.ready; } catch {}
  await new Promise(r => setTimeout(r, 800));

  try {
    const h2c = (await import('html2canvas')).default;
    const canvas = await h2c(wrapper.querySelector('body') as HTMLElement, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: 860,
      logging: false,
    });

    // Slice canvas into A4 pages
    const PDF_W_PX = canvas.width;
    const A4_RATIO = 297 / 210; // height/width for A4 portrait
    const pageHeightPx = Math.round(PDF_W_PX * A4_RATIO);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const margin = 6;
    const drawW = pdfW - margin * 2;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = PDF_W_PX;
    const ctx = offCanvas.getContext('2d')!;
    let sliceY = 0;
    let pageIdx = 0;

    while (sliceY < canvas.height) {
      const sliceH = Math.min(pageHeightPx, canvas.height - sliceY);
      offCanvas.height = sliceH;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, PDF_W_PX, sliceH);
      ctx.drawImage(canvas, 0, sliceY, PDF_W_PX, sliceH, 0, 0, PDF_W_PX, sliceH);
      const sliceData = offCanvas.toDataURL('image/jpeg', 0.93);
      const drawH = (sliceH / PDF_W_PX) * drawW;
      if (pageIdx > 0) pdf.addPage();
      pdf.addImage(sliceData, 'JPEG', margin, margin, drawW, drawH);
      sliceY += sliceH;
      pageIdx++;
    }

    const fileName = `${t(lang, 'monthly_report')}-${monthName(lang, month)}-${year}.pdf`;
    pdf.save(fileName);
  } finally {
    document.body.removeChild(wrapper);
  }
}
