'use client';
import { useState, useEffect, useRef } from 'react';
import { Download, Filter } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/LangContext';
import { Class, Student, Attendance } from '@/types';
import { getClasses, getStudents, getMonthlyAttendance } from '@/lib/supabase';

export default function ReportsPage() {
  const { user, isAdmin } = useAuth();
  const { lang, monthName } = useLang();
  const now      = new Date();
  const L = (a:string,e:string)=>lang==='ar'?a:e;

  const [month,       setMonth]       = useState(now.getMonth()+1);
  const [year,        setYear]        = useState(now.getFullYear());
  const [filterClass, setFilterClass] = useState('__INIT__'); // sentinel
  const [minAtt,      setMinAtt]      = useState(0);
  const [maxAtt,      setMaxAtt]      = useState(99);
  const [classes,     setClasses]     = useState<Class[]>([]);
  const [students,    setStudents]    = useState<Student[]>([]);
  const [att,         setAtt]         = useState<Attendance[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const [showFilter,  setShowFilter]  = useState(false);
  const [toast,       setToast]       = useState<{type:string;msg:string}|null>(null);
  const initialized = useRef(false);

  function showToast(type:string,msg:string){setToast({type,msg});setTimeout(()=>setToast(null),3500);}

  // Load classes first
  useEffect(() => { getClasses().then(setClasses as any); }, []);

  // Once user + classes are both ready, initialize filterClass correctly
  useEffect(() => {
    if (!user || !classes.length || initialized.current) return;
    initialized.current = true;
    const init = (!isAdmin && user.assigned_class) ? user.assigned_class : '';
    setFilterClass(init); // this triggers the load effect below
  }, [user, classes.length]);

  // Load whenever filterClass is initialized (not sentinel) or month/year change
  useEffect(() => {
    if (filterClass === '__INIT__') return; // not ready yet
    if (!user) return;
    load(filterClass);
  }, [filterClass, month, year]);

  async function load(cls: string) {
    setLoading(true);
    try {
      const scope = cls || undefined;
      const [studs, attData] = await Promise.all([
        getStudents(scope, false),
        getMonthlyAttendance(month, year, scope),
      ]);
      setStudents(studs as Student[]);
      setAtt(attData as Attendance[]);
    } catch(e) {
      console.error('load error', e);
      showToast('error', L('حدث خطأ في تحميل البيانات','Failed to load data'));
    } finally { setLoading(false); }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { exportPDF } = await import('@/lib/pdf');
      const scope = filterClass||undefined;
      const exportClasses = scope ? classes.filter(c=>c.id===scope) : classes;
      await exportPDF({
        classes: exportClasses, students, attendance: att,
        month, year, lang: 'ar',
        minAttendance: minAtt,
        maxAttendance: maxAtt>=99?9999:maxAtt,
      });
      showToast('success', L('تم التصدير بنجاح','Exported successfully'));
    } catch(e) {
      console.error('export error', e);
      showToast('error', L('فشل التصدير','Export failed'));
    } finally { setExporting(false); }
  }

  const MONTHS = Array.from({length:12},(_,i)=>monthName(i+1));
  const getClass  = (id:string) => classes.find(c=>c.id===id);
  const clsName   = (id:string) => { const c=getClass(id); return c?(lang==='ar'?c.name_ar:c.name_en):id; };
  const isReady   = filterClass !== '__INIT__';
  const isFiltered = minAtt>0||maxAtt<99;

  const stats = students.map(s=>{
    const sa  = att.filter(a=>a.student_id===s.id);
    const q   = sa.filter(a=>a.session_type==='mass'&&a.is_present).length;
    const ss  = sa.filter(a=>a.session_type==='sunday_school'&&a.is_present).length;
    const tb  = sa.filter(a=>a.session_type==='tasbeha'&&a.is_present).length;
    const tot = q+ss+tb; const poss=sa.length;
    return {student:s,q,ss,tb,tot,poss,pct:poss>0?Math.round(tot/poss*100):0};
  });

  const filtered = stats.filter(r=>r.tot>=minAtt&&r.tot<=(maxAtt>=99?9999:maxAtt));
  const grouped  = filtered.reduce((acc,s)=>{
    (acc[s.student.class_id]=acc[s.student.class_id]||[]).push(s);
    return acc;
  }, {} as Record<string,typeof filtered>);

  const totalPresent = att.filter(a=>a.is_present).length;
  const totalRec     = att.length;
  const overallPct   = totalRec>0?Math.round(totalPresent/totalRec*100):0;
  const availableClasses = isAdmin ? classes : classes.filter(c=>c.id===user?.assigned_class);

  return (
    <AppShell>
      <div className="stack" style={{gap:12}}>

        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
          <div>
            <h2 style={{fontSize:20,fontWeight:800}}>{L('التقرير الشهري','Monthly Report')}</h2>
            <p style={{fontSize:12,color:'#64748b'}}>{monthName(month)} {year}</p>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button className={`btn btn-sm ${showFilter||isFiltered?'btn-secondary':'btn-ghost'}`} onClick={()=>setShowFilter(v=>!v)} style={{gap:5}}>
              <Filter size={13}/>{L('فلتر','Filter')}{isFiltered&&<span style={{background:'#4338ca',color:'white',borderRadius:99,fontSize:10,fontWeight:700,padding:'1px 5px'}}>!</span>}
            </button>
            <button className="btn btn-primary" onClick={handleExport} disabled={exporting||loading||!isReady} style={{gap:5}}>
              <Download size={14}/>{exporting?L('جارٍ التصدير...','Exporting...'):L('تصدير PDF','Export PDF')}
            </button>
          </div>
        </div>

        {/* Filters row */}
        <div className="card" style={{padding:10,display:'flex',flexWrap:'wrap',gap:8}}>
          <select className="form-input" style={{flex:'1 1 100px'}} value={month} onChange={e=>setMonth(Number(e.target.value))}>
            {MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
          </select>
          <select className="form-input" style={{flex:'0 0 80px'}} value={year} onChange={e=>setYear(Number(e.target.value))}>
            {[now.getFullYear()-1,now.getFullYear()].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          {isAdmin && (
            <select className="form-input" style={{flex:'1 1 140px'}} value={filterClass==='__INIT__'?'':filterClass} onChange={e=>setFilterClass(e.target.value)}>
              <option value="">{L('كل الفصول','All Classes')}</option>
              {availableClasses.map(c=><option key={c.id} value={c.id}>{lang==='ar'?c.name_ar:c.name_en}</option>)}
            </select>
          )}
        </div>

        {/* Range filter */}
        {showFilter&&(
          <div className="card" style={{padding:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <h3 style={{fontSize:14,fontWeight:700}}>{L('فلتر عدد الجلسات','Attendance Range')}</h3>
              {isFiltered&&<button className="btn btn-ghost btn-sm" onClick={()=>{setMinAtt(0);setMaxAtt(99);}}>{L('إعادة تعيين','Reset')}</button>}
            </div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}}>
              <div className="form-group" style={{flex:'1 1 80px',marginBottom:0}}>
                <label className="form-label">{L('من','From')}</label>
                <input type="number" className="form-input" min={0} value={minAtt} onChange={e=>setMinAtt(Math.max(0,Number(e.target.value)))} dir="ltr"/>
              </div>
              <div className="form-group" style={{flex:'1 1 80px',marginBottom:0}}>
                <label className="form-label">{L('إلى','To')}</label>
                <input type="number" className="form-input" min={minAtt} value={maxAtt>=99?'':maxAtt} placeholder={L('بلا حد','No limit')} onChange={e=>setMaxAtt(e.target.value===''?99:Math.max(minAtt,Number(e.target.value)))} dir="ltr"/>
              </div>
              <div style={{flex:'2 1 140px',padding:'10px 14px',background:'#eef2ff',borderRadius:9,fontSize:13,fontWeight:600,color:'#4338ca'}}>
                {filtered.length} {L('طالب','students')}
              </div>
            </div>
            <div style={{marginTop:10,display:'flex',gap:6,flexWrap:'wrap'}}>
              {[{l:L('الكل','All'),min:0,max:99},{l:L('غائب كلياً','Never'),min:0,max:0},{l:L('ضعيف','Weak'),min:1,max:3},{l:L('متوسط','Average'),min:4,max:6},{l:L('ممتاز','Good'),min:7,max:99}].map(p=>(
                <button key={p.l} onClick={()=>{setMinAtt(p.min);setMaxAtt(p.max);}} className="btn btn-ghost btn-sm" style={{fontSize:12,borderColor:minAtt===p.min&&maxAtt===p.max?'#4338ca':'#e2e8f0',color:minAtt===p.min&&maxAtt===p.max?'#4338ca':'#64748b',background:minAtt===p.min&&maxAtt===p.max?'#eef2ff':'white'}}>{p.l}</button>
              ))}
            </div>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid-4">
          {[
            {label:L('الطلاب','Students'),  value:loading?'—':filtered.length,  color:'#3730a3'},
            {label:L('جلسات','Sessions'),   value:loading?'—':totalRec,          color:'#0891b2'},
            {label:L('حاضر','Present'),     value:loading?'—':totalPresent,      color:'#16a34a'},
            {label:'%',                     value:loading?'—':`${overallPct}%`,  color:overallPct>=75?'#16a34a':overallPct>=50?'#d97706':'#dc2626'},
          ].map(s=>(
            <div key={s.label} className="card" style={{padding:12,textAlign:'center'}}>
              <div style={{fontSize:22,fontWeight:800,color:s.color}}>{s.value}</div>
              <div style={{fontSize:11,color:'#64748b',marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tables */}
        {(!isReady||loading)?(
          <div className="card" style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{L('جارٍ التحميل...','Loading...')}</div>
        ):Object.keys(grouped).length===0?(
          <div className="card" style={{padding:48,textAlign:'center',color:'#94a3b8'}}>
            <p style={{fontSize:14,fontWeight:600}}>{L('لا توجد بيانات','No data')}</p>
          </div>
        ):Object.entries(grouped)
          .sort(([a],[b])=>(getClass(a)?.sort_order??0)-(getClass(b)?.sort_order??0))
          .map(([cid,rows])=>{
            const cls   = getClass(cid);
            const isBoys= cls?.gender==='boys';
            const totQ  = rows.reduce((s,r)=>s+r.q,0);
            const totSS = rows.reduce((s,r)=>s+r.ss,0);
            const totTb = rows.reduce((s,r)=>s+r.tb,0);
            const totT  = rows.reduce((s,r)=>s+r.tot,0);
            const totP  = rows.reduce((s,r)=>s+r.poss,0);
            const totPct= totP>0?Math.round(totT/totP*100):0;
            return(
              <div key={cid} style={{borderRadius:12,overflow:'hidden',border:'1px solid #e2e8f0',boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
                <div style={{padding:'10px 14px',background:isBoys?'linear-gradient(135deg,#1e3a8a,#2563eb)':'linear-gradient(135deg,#831843,#db2777)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:14,fontWeight:800,color:'white'}}>{clsName(cid)}</span>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span style={{fontSize:11,color:'rgba(255,255,255,.75)'}}>{rows.length} {L('طالب','students')}</span>
                    <span style={{background:'rgba(255,255,255,.2)',color:'white',borderRadius:99,padding:'2px 10px',fontSize:12,fontWeight:800}}>{totPct}%</span>
                  </div>
                </div>
                <div className="table-wrap" style={{border:'none'}}>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{L('الاسم','Name')}</th>
                        <th style={{textAlign:'center'}}><span className="sess-mass">{L('قداس','Liturgy')}</span></th>
                        <th style={{textAlign:'center'}}><span className="sess-sunday_school">{L('مدارس الأحد','Sun.School')}</span></th>
                        <th style={{textAlign:'center'}}><span className="sess-tasbeha">{L('تسبحة','Tasbeha')}</span></th>
                        <th style={{textAlign:'center'}}>{L('المجموع','Total')}</th>
                        <th style={{textAlign:'center'}}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r,i)=>(
                        <tr key={r.student.id}>
                          <td style={{color:'#94a3b8',fontSize:11}}>{i+1}</td>
                          <td style={{fontWeight:600,fontSize:13}}>{r.student.full_name}</td>
                          <td style={{textAlign:'center',fontWeight:700,color:'#7c3aed'}}>{r.q||'—'}</td>
                          <td style={{textAlign:'center',fontWeight:700,color:'#0284c7'}}>{r.ss||'—'}</td>
                          <td style={{textAlign:'center',fontWeight:700,color:'#b45309'}}>{r.tb||'—'}</td>
                          <td style={{textAlign:'center',fontWeight:700}}>{r.tot}<span style={{fontSize:10,color:'#94a3b8'}}>/{r.poss}</span></td>
                          <td style={{textAlign:'center'}}>
                            <span className={`badge ${r.pct>=75?'badge-green':r.pct>=50?'badge-amber':r.poss>0?'badge-red':'badge-gray'}`}>{r.poss>0?`${r.pct}%`:'—'}</span>
                          </td>
                        </tr>
                      ))}
                      <tr style={{background:'#f8fafc',fontWeight:700}}>
                        <td colSpan={2} style={{fontWeight:800,color:'#374151'}}>{L('مجموع الفصل','Class Total')}</td>
                        <td style={{textAlign:'center',color:'#7c3aed',fontWeight:800}}>{totQ}</td>
                        <td style={{textAlign:'center',color:'#0284c7',fontWeight:800}}>{totSS}</td>
                        <td style={{textAlign:'center',color:'#b45309',fontWeight:800}}>{totTb}</td>
                        <td style={{textAlign:'center',fontWeight:800,color:'#3730a3'}}>{totT}</td>
                        <td style={{textAlign:'center'}}>
                          <span className={`badge ${totPct>=75?'badge-green':totPct>=50?'badge-amber':totP>0?'badge-red':'badge-gray'}`}>{totP>0?`${totPct}%`:'—'}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        }
      </div>
      {toast&&<div className="toast-wrap"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}
    </AppShell>
  );
}
