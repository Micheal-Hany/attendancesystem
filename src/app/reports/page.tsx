'use client';
import { useState, useEffect } from 'react';
import { Download, Filter } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/LangContext';
import { Class, Student, Attendance } from '@/types';
import { getClasses, getStudents, getMonthlyAttendance } from '@/lib/supabase';

export default function ReportsPage() {
  const { user, isAdmin } = useAuth();
  const { t, lang, monthName } = useLang();
  const now = new Date();
  const [month, setMonth]           = useState(now.getMonth()+1);
  const [year,  setYear]            = useState(now.getFullYear());
  const [filterClass, setFilterClass] = useState(isAdmin ? '' : (user?.assigned_class ?? ''));
  const [minAtt, setMinAtt]         = useState(0);
  const [maxAtt, setMaxAtt]         = useState(99);
  const [classes, setClasses]       = useState<Class[]>([]);
  const [students, setStudents]     = useState<Student[]>([]);
  const [att, setAtt]               = useState<Attendance[]>([]);
  const [loading, setLoading]       = useState(false);
  const [exporting, setExporting]   = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [toast, setToast]           = useState<{type:string;msg:string}|null>(null);

  function showToast(type:string, msg:string) { setToast({type,msg}); setTimeout(()=>setToast(null),3500); }

  useEffect(() => { getClasses().then(setClasses as any); }, []);
  useEffect(() => { load(); }, [month, year, filterClass]);

  async function load() {
    setLoading(true);
    try {
      const scopeClass = isAdmin ? (filterClass||undefined) : (user?.assigned_class||undefined);
      const [studs, attData] = await Promise.all([
        getStudents(scopeClass),
        getMonthlyAttendance(month, year, scopeClass),
      ]);
      setStudents(studs as Student[]);
      setAtt(attData as Attendance[]);
    } finally { setLoading(false); }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { exportPDF } = await import('@/lib/pdf');
      const scopeClass = isAdmin ? (filterClass||undefined) : (user?.assigned_class||undefined);
      const exportClasses = scopeClass ? classes.filter(c=>c.id===scopeClass) : classes;
      await exportPDF({
        classes: exportClasses, students, attendance: att,
        month, year, lang,
        minAttendance: minAtt,
        maxAttendance: maxAtt >= 99 ? 999 : maxAtt,
      });
      showToast('success', t('export_pdf'));
    } catch (e) {
      console.error(e);
      showToast('error', t('error'));
    } finally { setExporting(false); }
  }

  const MONTHS = Array.from({length:12},(_,i)=>monthName(i+1));
  const getClass = (id:string) => classes.find(c=>c.id===id);

  // Compute per-student stats
  const stats = students.map(s => {
    const sa  = att.filter(a => a.student_id === s.id);
    const q   = sa.filter(a => a.session_type==='mass'        && a.is_present).length;
    const ss  = sa.filter(a => a.session_type==='sunday_school'&& a.is_present).length;
    const tb  = sa.filter(a => a.session_type==='tasbeha'      && a.is_present).length;
    const tot = q + ss + tb;
    const poss = sa.length;
    return { student:s, q, ss, tb, tot, poss, pct: poss>0?Math.round(tot/poss*100):0 };
  });

  // Apply min/max attendance filter
  const filtered = stats.filter(r => r.tot >= minAtt && r.tot <= (maxAtt >= 99 ? 999 : maxAtt));

  const grouped = filtered.reduce((acc, s) => {
    (acc[s.student.class_id] = acc[s.student.class_id] || []).push(s);
    return acc;
  }, {} as Record<string,typeof filtered>);

  const totalPresent = att.filter(a=>a.is_present).length;
  const totalRec     = att.length;
  const overallPct   = totalRec>0 ? Math.round(totalPresent/totalRec*100) : 0;

  const availableClasses = isAdmin ? classes : classes.filter(c=>c.id===user?.assigned_class);

  // Max possible sessions this month (for range slider label)
  const maxPossible = Math.max(0, ...stats.map(r => r.poss), 1);
  const isFiltered  = minAtt > 0 || maxAtt < 99;

  return (
    <AppShell>
      <div className="stack" style={{gap:12}}>

        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
          <div>
            <h2 style={{fontSize:18,fontWeight:800}}>{t('monthly_report')}</h2>
            <p style={{fontSize:12,color:'#64748b'}}>{monthName(month)} {year}</p>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className={`btn btn-sm ${showFilter||isFiltered?'btn-secondary':'btn-ghost'}`} onClick={()=>setShowFilter(v=>!v)} style={{gap:5}}>
              <Filter size={13}/>
              {lang==='ar'?'فلتر':'Filter'}
              {isFiltered && <span style={{background:'#4338ca',color:'white',borderRadius:99,fontSize:10,fontWeight:700,padding:'1px 5px'}}>!</span>}
            </button>
            <button className="btn btn-primary" onClick={handleExport} disabled={exporting||loading} style={{gap:5}}>
              <Download size={14}/>
              {exporting ? t('exporting') : t('export_pdf')}
            </button>
          </div>
        </div>

        {/* Main filters */}
        <div className="card" style={{padding:12,display:'flex',flexWrap:'wrap',gap:8}}>
          <select className="form-input" style={{flex:'1 1 110px',fontSize:14}} value={month} onChange={e=>setMonth(Number(e.target.value))}>
            {MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
          </select>
          <select className="form-input" style={{flex:'1 1 70px',fontSize:14}} value={year} onChange={e=>setYear(Number(e.target.value))}>
            {[now.getFullYear()-1,now.getFullYear()].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          {isAdmin && (
            <select className="form-input" style={{flex:'1 1 160px',fontSize:14}} value={filterClass} onChange={e=>setFilterClass(e.target.value)}>
              <option value="">{t('all_classes')}</option>
              {availableClasses.map(c=><option key={c.id} value={c.id}>{lang==='ar'?c.name_ar:c.name_en}</option>)}
            </select>
          )}
        </div>

        {/* Attendance range filter */}
        {showFilter && (
          <div className="card" style={{padding:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <h3 style={{fontSize:14,fontWeight:700}}>
                {lang==='ar'?'فلتر عدد الجلسات':'Attendance Range Filter'}
              </h3>
              {isFiltered && (
                <button className="btn btn-ghost btn-sm" onClick={()=>{setMinAtt(0);setMaxAtt(99);}}>
                  {lang==='ar'?'إعادة تعيين':'Reset'}
                </button>
              )}
            </div>
            <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'flex-end'}}>
              <div className="form-group" style={{flex:'1 1 100px',marginBottom:0}}>
                <label className="form-label">{lang==='ar'?'الحد الأدنى':'Min sessions'}</label>
                <input type="number" className="form-input" style={{fontSize:16}} min={0} max={maxAtt}
                  value={minAtt} onChange={e=>setMinAtt(Math.max(0,Number(e.target.value)))} dir="ltr"/>
              </div>
              <div className="form-group" style={{flex:'1 1 100px',marginBottom:0}}>
                <label className="form-label">{lang==='ar'?'الحد الأقصى':'Max sessions'}</label>
                <input type="number" className="form-input" style={{fontSize:16}} min={minAtt}
                  value={maxAtt >= 99 ? '' : maxAtt}
                  placeholder={lang==='ar'?'بلا حد':'No limit'}
                  onChange={e=>setMaxAtt(e.target.value===''?99:Math.max(minAtt,Number(e.target.value)))} dir="ltr"/>
              </div>
              <div style={{flex:'2 1 200px',padding:'10px 14px',background:'#eef2ff',borderRadius:9,fontSize:13,fontWeight:600,color:'#4338ca'}}>
                {lang==='ar'
                  ? `يعرض الطلاب الذين حضروا من ${minAtt} إلى ${maxAtt>=99?'∞':maxAtt} جلسة`
                  : `Showing students with ${minAtt}–${maxAtt>=99?'∞':maxAtt} sessions attended`
                }
                {' '}→ <strong>{filtered.length}</strong> {lang==='ar'?'طالب':'students'}
              </div>
            </div>
            {/* Quick presets */}
            <div style={{marginTop:10,display:'flex',gap:6,flexWrap:'wrap'}}>
              {[
                {label:lang==='ar'?'الكل':'All',         min:0, max:99},
                {label:lang==='ar'?'غائب كلياً':'Never', min:0, max:0},
                {label:lang==='ar'?'ضعيف (<50%)':'Weak', min:1, max:Math.floor(maxPossible*0.49)},
                {label:lang==='ar'?'متوسط':'Average',    min:Math.ceil(maxPossible*0.5), max:Math.floor(maxPossible*0.74)},
                {label:lang==='ar'?'ممتاز (≥75%)':'Good',min:Math.ceil(maxPossible*0.75), max:99},
              ].map(p=>(
                <button key={p.label} onClick={()=>{setMinAtt(p.min);setMaxAtt(p.max);}}
                  className="btn btn-ghost btn-sm"
                  style={{fontSize:12,borderColor:minAtt===p.min&&maxAtt===p.max?'#4338ca':'#e2e8f0',color:minAtt===p.min&&maxAtt===p.max?'#4338ca':'#64748b',background:minAtt===p.min&&maxAtt===p.max?'#eef2ff':'white'}}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid-4">
          {[
            {label:lang==='ar'?'الطلاب المعروضون':'Shown', value:filtered.length,     color:'#3730a3'},
            {label:t('sessions_recorded'),                  value:totalRec,            color:'#0891b2'},
            {label:t('present'),                            value:totalPresent,        color:'#16a34a'},
            {label:t('percentage'),                         value:`${overallPct}%`,    color:overallPct>=75?'#16a34a':overallPct>=50?'#d97706':'#dc2626'},
          ].map(s=>(
            <div key={s.label} className="card" style={{padding:12,textAlign:'center'}}>
              <div style={{fontSize:22,fontWeight:800,color:s.color}}>{loading?'—':s.value}</div>
              <div style={{fontSize:11,color:'#64748b',marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tables per class */}
        {loading ? (
          <div className="card" style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{t('loading')}</div>
        ) : Object.keys(grouped).length===0 ? (
          <div className="card" style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{t('no_data')}</div>
        ) : (
          Object.entries(grouped)
            .sort(([a],[b])=>(getClass(a)?.sort_order??0)-(getClass(b)?.sort_order??0))
            .map(([cid, rows]) => {
              const cls   = getClass(cid);
              const isBoys = cls?.gender==='boys';
              const totQ  = rows.reduce((s,r)=>s+r.q,0);
              const totSS = rows.reduce((s,r)=>s+r.ss,0);
              const totTb = rows.reduce((s,r)=>s+r.tb,0);
              const totT  = rows.reduce((s,r)=>s+r.tot,0);
              const totP  = rows.reduce((s,r)=>s+r.poss,0);
              const totPct = totP>0 ? Math.round(totT/totP*100) : 0;
              return (
                <div key={cid}>
                  <div style={{padding:'9px 14px',borderRadius:'10px 10px 0 0',background:isBoys?'linear-gradient(90deg,#1e3a8a,#1d4ed8)':'linear-gradient(90deg,#831843,#be185d)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:13,fontWeight:800,color:'white'}}>{cls?(lang==='ar'?cls.name_ar:cls.name_en):cid}</span>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:11,color:'rgba(255,255,255,.7)'}}>{rows.length} {lang==='ar'?'طالب':'students'}</span>
                      <span style={{fontSize:12,fontWeight:800,color:'white',background:'rgba(255,255,255,.2)',padding:'2px 10px',borderRadius:99}}>{totPct}%</span>
                    </div>
                  </div>
                  <div className="table-wrap" style={{borderRadius:'0 0 10px 10px',border:'1px solid #e2e8f0',borderTop:'none'}}>
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>{t('full_name')}</th>
                          <th style={{textAlign:'center'}}><span className="sess-mass">{t('mass')}</span></th>
                          <th style={{textAlign:'center'}}><span className="sess-sunday_school">{t('sunday_school')}</span></th>
                          <th style={{textAlign:'center'}}><span className="sess-tasbeha">{t('tasbeha')}</span></th>
                          <th style={{textAlign:'center'}}>{t('total')}</th>
                          <th style={{textAlign:'center'}}>%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r,i)=>(
                          <tr key={r.student.id}>
                            <td style={{color:'#94a3b8',fontSize:11}}>{i+1}</td>
                            <td style={{fontWeight:600}}>{r.student.full_name}</td>
                            <td style={{textAlign:'center',fontWeight:700,color:'#7c3aed'}}>{r.q||'—'}</td>
                            <td style={{textAlign:'center',fontWeight:700,color:'#0284c7'}}>{r.ss||'—'}</td>
                            <td style={{textAlign:'center',fontWeight:700,color:'#b45309'}}>{r.tb||'—'}</td>
                            <td style={{textAlign:'center',fontWeight:700}}>{r.tot}<span style={{fontSize:10,color:'#94a3b8'}}>/{r.poss}</span></td>
                            <td style={{textAlign:'center'}}>
                              <span className={`badge ${r.pct>=75?'badge-green':r.pct>=50?'badge-amber':r.poss>0?'badge-red':'badge-gray'}`}>
                                {r.poss>0?`${r.pct}%`:'—'}
                              </span>
                            </td>
                          </tr>
                        ))}
                        <tr style={{background:'#f8fafc',fontWeight:700}}>
                          <td colSpan={2} style={{fontWeight:800,color:'#374151'}}>{t('class_total')}</td>
                          <td style={{textAlign:'center',color:'#7c3aed',fontWeight:800}}>{totQ}</td>
                          <td style={{textAlign:'center',color:'#0284c7',fontWeight:800}}>{totSS}</td>
                          <td style={{textAlign:'center',color:'#b45309',fontWeight:800}}>{totTb}</td>
                          <td style={{textAlign:'center',fontWeight:800,color:'#3730a3'}}>{totT}</td>
                          <td style={{textAlign:'center'}}>
                            <span className={`badge ${totPct>=75?'badge-green':totPct>=50?'badge-amber':totP>0?'badge-red':'badge-gray'}`}>
                              {totP>0?`${totPct}%`:'—'}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
        )}
      </div>
      {toast&&<div className="toast-wrap"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}
    </AppShell>
  );
}
