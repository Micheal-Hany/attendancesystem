/**
 * PDF Export — renders off-screen HTML with Cairo font,
 * captures via html2canvas, slices into A4 pages.
 * Always Arabic (RTL) output.
 */
import jsPDF from 'jspdf';
import { Class, Student, Attendance, SessionType } from '@/types';
import { monthName } from '@/i18n';

function pct(p:number,t:number){return t>0?Math.round(p/t*100):0;}
function barColor(p:number){return p>=75?'#16a34a':p>=50?'#d97706':'#dc2626';}
function badgeCss(p:number){
  if(p>=75)return'background:#dcfce7;color:#15803d';
  if(p>=50)return'background:#fef3c7;color:#92400e';
  if(p>0)  return'background:#fee2e2;color:#991b1b';
  return'background:#f1f5f9;color:#94a3b8';
}

export async function exportPDF(opts:{
  classes:Class[]; students:Student[]; attendance:Attendance[];
  month:number; year:number; lang?:string;
  minAttendance?:number; maxAttendance?:number;
}) {
  const { classes, students, attendance, month, year } = opts;
  const minAtt = opts.minAttendance??0;
  const maxAtt = opts.maxAttendance??9999;

  const sessions:SessionType[] = ['mass','sunday_school','tasbeha'];
  const sessAr:Record<string,string> = { mass:'قداس', sunday_school:'مدارس الأحد', tasbeha:'تسبحة' };
  const sessColor:Record<string,string> = { mass:'#7c3aed', sunday_school:'#0284c7', tasbeha:'#b45309' };
  const title = `التقرير الشهري — ${monthName('ar', month)} ${year}`;
  const activeStudents = students.filter(s=>s.is_active);

  // ── per-class HTML ───────────────────────────────────────────
  let tablesHTML = '';
  let grandPresent=0, grandTotal=0, grandStudents=0;

  const sorted = [...classes]
    .filter(c=>activeStudents.some(s=>s.class_id===c.id))
    .sort((a,b)=>a.sort_order-b.sort_order);

  for(const cls of sorted){
    const clsStudents = activeStudents.filter(s=>s.class_id===cls.id);
    if(!clsStudents.length) continue;

    const rows = clsStudents.map(st=>{
      const sa = attendance.filter(a=>a.student_id===st.id);
      const counts = sessions.map(s=>sa.filter(a=>a.session_type===s&&a.is_present).length);
      const tot = counts.reduce((a,b)=>a+b,0);
      const poss = sa.length;
      const p = pct(tot,poss);
      return {st,counts,tot,poss,pct:p};
    }).filter(r=>r.tot>=minAtt&&r.tot<=maxAtt);

    if(!rows.length) continue;

    grandStudents += rows.length;
    grandPresent  += rows.reduce((s,r)=>s+r.tot,0);
    grandTotal    += rows.reduce((s,r)=>s+r.poss,0);

    const totals = sessions.map((_,i)=>rows.reduce((s,r)=>s+r.counts[i],0));
    const totT   = rows.reduce((s,r)=>s+r.tot,0);
    const totP   = rows.reduce((s,r)=>s+r.poss,0);
    const totPct = pct(totT,totP);
    const hdrBg  = cls.gender==='boys'?'#1d4ed8':'#be185d';

    const rowsHTML = rows.map((r,i)=>`
      <tr style="background:${i%2===0?'#fff':'#f8fafc'}">
        <td style="text-align:center;color:#94a3b8;font-size:11px;padding:7px 5px">${i+1}</td>
        <td style="padding:7px 10px;font-weight:600;font-size:13px">${r.st.full_name}</td>
        ${r.counts.map((c,ci)=>`<td style="text-align:center;font-weight:700;color:${sessColor[sessions[ci]]};padding:7px 6px">${c||'—'}</td>`).join('')}
        <td style="text-align:center;font-weight:700;padding:7px">${r.tot}<span style="font-size:10px;color:#94a3b8">/${r.poss}</span></td>
        <td style="text-align:center;padding:7px"><span style="${badgeCss(r.pct)};padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">${r.poss>0?`${r.pct}%`:'—'}</span></td>
      </tr>`).join('');

    const barsHTML = rows.map(r=>`
      <div style="display:flex;align-items:center;gap:8px;padding:5px 10px;border-bottom:1px solid #f1f5f9">
        <div style="width:160px;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0">${r.st.full_name}</div>
        <div style="flex:1;height:9px;background:#e2e8f0;border-radius:99px;overflow:hidden">
          <div style="width:${r.pct}%;height:9px;background:${barColor(r.pct)};border-radius:99px"></div>
        </div>
        <div style="width:36px;text-align:left;font-size:12px;font-weight:800;color:${barColor(r.pct)};flex-shrink:0">${r.tot>0?`${r.pct}%`:'—'}</div>
        <div style="width:32px;text-align:left;font-size:10px;color:#94a3b8;flex-shrink:0">${r.tot}/${r.poss}</div>
      </div>`).join('');

    tablesHTML += `
      <div style="margin-bottom:22px">
        <div style="background:${hdrBg};color:white;padding:10px 14px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:15px;font-weight:800">${cls.name_ar}</span>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:12px;opacity:.8">${rows.length} طالب</span>
            <span style="font-size:14px;font-weight:800;background:rgba(255,255,255,.2);padding:3px 12px;border-radius:99px">${totPct}%</span>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#4338ca">
              <th style="color:white;padding:8px 5px;font-size:11px;text-align:center;width:28px">#</th>
              <th style="color:white;padding:8px 10px;font-size:11px;text-align:right">اسم الطالب</th>
              ${sessions.map(s=>`<th style="color:white;padding:8px 6px;font-size:11px;text-align:center">${sessAr[s]}</th>`).join('')}
              <th style="color:white;padding:8px 6px;font-size:11px;text-align:center">المجموع</th>
              <th style="color:white;padding:8px 6px;font-size:11px;text-align:center">%</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHTML}
            <tr style="background:#eef2ff">
              <td colspan="2" style="padding:8px 10px;font-weight:800;font-size:13px;color:#374151">المجموع الكلي</td>
              ${totals.map((v,i)=>`<td style="text-align:center;font-weight:800;color:${sessColor[sessions[i]]}">${v}</td>`).join('')}
              <td style="text-align:center;font-weight:800;color:#3730a3">${totT}</td>
              <td style="text-align:center"><span style="${badgeCss(totPct)};padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">${totP>0?`${totPct}%`:'—'}</span></td>
            </tr>
          </tbody>
        </table>
        <div style="border:1px solid #e2e8f0;border-top:2px solid #4338ca;background:#fff;border-radius:0 0 10px 10px">
          <div style="padding:7px 10px 3px;font-size:11px;font-weight:700;color:#64748b;border-bottom:1px solid #f1f5f9">مستوى الحضور البصري</div>
          ${barsHTML}
        </div>
      </div>`;
  }

  const ovPct = pct(grandPresent,grandTotal);

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Cairo',sans-serif;direction:rtl;color:#1e293b;background:#fff;width:840px;padding:24px}
table{width:100%;border-collapse:collapse;font-family:'Cairo',sans-serif}
td,th{font-family:'Cairo',sans-serif}
</style>
</head>
<body>
  <div style="background:linear-gradient(135deg,#3730a3,#7c3aed);color:white;border-radius:14px;padding:20px 24px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="font-size:20px;font-weight:800">${title}</div>
      <div style="opacity:.75;font-size:13px;margin-top:4px">نظام الكنيسة الموحد</div>
    </div>
    <div style="text-align:left">
      <div style="font-size:32px;font-weight:800">${ovPct}%</div>
      <div style="opacity:.7;font-size:12px;margin-top:3px">إجمالي الحضور</div>
    </div>
  </div>
  <div style="display:flex;gap:12px;margin-bottom:20px">
    ${[['الطلاب',grandStudents,'#4338ca'],['حضور',grandPresent,'#16a34a'],['جلسات',grandTotal,'#0891b2'],['متوسط',`${ovPct}%`,barColor(ovPct)]].map(([l,v,c])=>`
    <div style="flex:1;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:12px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:${c}">${v}</div>
      <div style="font-size:11px;color:#64748b;margin-top:3px;font-weight:600">${l}</div>
    </div>`).join('')}
  </div>
  ${tablesHTML}
  <div style="margin-top:18px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px">
    تم الإنشاء بتاريخ ${new Date().toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric'})}
  </div>
</body>
</html>`;

  // ── Render off-screen ────────────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:840px;background:#fff;';
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);

  // Wait for Cairo font
  try { await document.fonts.ready; } catch {}
  await new Promise(r=>setTimeout(r,900));

  try {
    const h2c = (await import('html2canvas')).default;
    // ✅ FIX: capture wrapper itself, not wrapper.querySelector('body') which returns null
    const canvas = await h2c(wrapper, {
      scale:2, useCORS:true, allowTaint:true,
      backgroundColor:'#ffffff', width:840, logging:false,
    });

    // Slice into A4 pages
    const pdfW    = canvas.width;
    const pdfPageH = Math.round(pdfW * (297/210)); // A4 ratio at 2× scale

    const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 5;
    const drawW  = pageW - margin*2;

    const slice = document.createElement('canvas');
    slice.width = pdfW;
    const ctx = slice.getContext('2d')!;
    let y=0, page=0;

    while(y < canvas.height){
      const h = Math.min(pdfPageH, canvas.height-y);
      slice.height = h;
      ctx.fillStyle='#fff';
      ctx.fillRect(0,0,pdfW,h);
      ctx.drawImage(canvas,0,y,pdfW,h,0,0,pdfW,h);
      const imgData = slice.toDataURL('image/jpeg',0.92);
      const drawH   = (h/pdfW)*drawW;
      if(page>0) pdf.addPage();
      pdf.addImage(imgData,'JPEG',margin,margin,drawW,drawH);
      y+=h; page++;
    }

    pdf.save(`تقرير-${monthName('ar',month)}-${year}.pdf`);
  } finally {
    document.body.removeChild(wrapper);
  }
}
