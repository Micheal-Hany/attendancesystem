'use client';
import { useState, useEffect, useCallback } from 'react';
import { Home, X, CheckCircle, XCircle, Phone, MapPin, Calendar, Plus, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/LangContext';
import { getStudents, getClasses, getVisitations, upsertVisitation, classLabel } from '@/lib/supabase';

interface Student { id:string; full_name:string; class_id:string; phone?:string; address?:string; parent_phone?:string; is_active:boolean; }
interface Visit { id:string; student_id:string; visit_date:string; visited_by:string; was_home:boolean; notes?:string; }

export default function VisitationPage() {
  const { user, isAdmin } = useAuth();
  const { lang, isRTL } = useLang();
  const L = (a:string, e:string) => lang==='ar'?a:e;

  const [students,  setStudents]  = useState<Student[]>([]);
  const [classes,   setClasses]   = useState<any[]>([]);
  const [visits,    setVisits]    = useState<Visit[]>([]);
  const [weekStart, setWeekStart] = useState<Date>(getThisWeekStart());
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState<string|null>(null);
  const [noteModal, setNoteModal] = useState<{studentId:string;note:string}|null>(null);
  const [toast,     setToast]     = useState<string|null>(null);

  function getThisWeekStart() {
    const d = new Date(); d.setHours(0,0,0,0);
    const day = d.getDay(); // 0=Sun
    d.setDate(d.getDate() - day); // go back to Sunday
    return d;
  }
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+6);
  const dateKey = weekStart.toISOString().split('T')[0];
  const weekLabel = `${weekStart.toLocaleDateString(lang==='ar'?'ar-EG':'en-GB',{day:'numeric',month:'short'})} — ${weekEnd.toLocaleDateString(lang==='ar'?'ar-EG':'en-GB',{day:'numeric',month:'short',year:'numeric'})}`;

  function prevWeek() { const d=new Date(weekStart); d.setDate(d.getDate()-7); setWeekStart(d); }
  function nextWeek() { const d=new Date(weekStart); d.setDate(d.getDate()+7); setWeekStart(d); }
  function thisWeek() { setWeekStart(getThisWeekStart()); }

  function showToast(msg:string) { setToast(msg); setTimeout(()=>setToast(null),2500); }

  useEffect(() => {
    if (!user) return;
    const scope = isAdmin ? undefined : (user.assigned_class??undefined);
    Promise.all([ getStudents(scope,false), getClasses() ]).then(([s,c]) => { setStudents(s as any); setClasses(c as any); });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const scope = isAdmin ? undefined : (user.assigned_class??undefined);
    getVisitations(scope, 200).then(data => {
      setVisits(data as Visit[]);
      setLoading(false);
    });
  }, [user, weekStart]);

  const getVisit = useCallback((studentId:string): Visit|undefined =>
    visits.find(v => v.student_id===studentId && v.visit_date===dateKey),
    [visits, dateKey]
  );

  async function toggleVisit(student: Student, wasHome: boolean) {
    if (!user) return;
    setSaving(student.id);
    const existing = getVisit(student.id);
    // Toggle: if same value clicked again, remove; else set new value
    const willRemove = existing && existing.was_home === wasHome;
    try {
      if (willRemove) {
        // Optimistic: mark as not visited
        setVisits(v => v.filter(x => !(x.student_id===student.id && x.visit_date===dateKey)));
      } else {
        const payload = { student_id:student.id, visit_date:dateKey, visited_by:user.id, was_home:wasHome };
        const result = await upsertVisitation(payload, user.id);
        setVisits(v => {
          const filtered = v.filter(x => !(x.student_id===student.id && x.visit_date===dateKey));
          return [...filtered, result as Visit];
        });
        showToast(wasHome ? L(`✅ ${student.full_name} — كان موجوداً`,`✅ ${student.full_name} — was home`) : L(`📵 ${student.full_name} — لم يكن موجوداً`,`📵 ${student.full_name} — not home`));
      }
    } catch { showToast(L('حدث خطأ','Error')); }
    finally { setSaving(null); }
  }

  async function saveNote() {
    if (!noteModal || !user) return;
    const existing = getVisit(noteModal.studentId);
    if (existing) {
      await upsertVisitation({ ...existing, notes:noteModal.note }, user.id);
      setVisits(v => v.map(x => x.student_id===noteModal.studentId&&x.visit_date===dateKey ? {...x,notes:noteModal.note} : x));
    }
    setNoteModal(null);
    showToast(L('تم حفظ الملاحظة','Note saved'));
  }

  // Group students by class
  const grouped = students.reduce((acc,s) => { (acc[s.class_id]=acc[s.class_id]||[]).push(s); return acc; }, {} as Record<string,Student[]>);

  // Stats for this week
  const weekVisits  = visits.filter(v=>v.visit_date===dateKey);
  const visitedHome = weekVisits.filter(v=>v.was_home).length;
  const notHome     = weekVisits.filter(v=>!v.was_home).length;
  const notVisited  = students.length - weekVisits.length;

  return (
    <AppShell>
      <div className="stack" style={{gap:14}}>

        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:10}}>
          <div>
            <h2 style={{fontSize:20,fontWeight:800,letterSpacing:'-.02em',display:'flex',alignItems:'center',gap:8}}>
              <Home size={20} style={{color:'#4338ca'}}/>{L('الافتقاد الأسبوعي','Weekly Visitation')}
            </h2>
            <p style={{fontSize:12,color:'#64748b',marginTop:3}}>{weekLabel}</p>
          </div>
        </div>

        {/* Week navigator */}
        <div style={{display:'flex',alignItems:'center',gap:8,background:'white',borderRadius:12,padding:'8px 12px',border:'1px solid #e2e8f0',boxShadow:'0 1px 3px rgba(0,0,0,.06)'}}>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={prevWeek}><ChevronLeft size={16} style={{transform:isRTL?'rotate(180deg)':'none'}}/></button>
          <div style={{flex:1,textAlign:'center',fontSize:14,fontWeight:700,color:'#1e293b'}}>{weekLabel}</div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={nextWeek}><ChevronRight size={16} style={{transform:isRTL?'rotate(180deg)':'none'}}/></button>
          <button className="btn btn-secondary btn-sm" onClick={thisWeek} style={{fontSize:12}}>{L('هذا الأسبوع','This Week')}</button>
        </div>

        {/* Stats */}
        <div className="grid-3">
          {[
            {label:L('كان موجوداً','Was Home'),    value:visitedHome, color:'#16a34a', bg:'#f0fdf4', icon:'✅'},
            {label:L('لم يكن موجوداً','Not Home'), value:notHome,     color:'#d97706', bg:'#fef3c7', icon:'📵'},
            {label:L('لم يُزَر','Not Visited'),     value:notVisited,  color:'#6366f1', bg:'#eef2ff', icon:'🏠'},
          ].map(s=>(
            <div key={s.label} style={{background:s.bg,border:`1px solid`,borderColor:s.bg,borderRadius:12,padding:'14px',textAlign:'center'}}>
              <div style={{fontSize:24,marginBottom:4}}>{s.icon}</div>
              <div style={{fontSize:26,fontWeight:800,color:s.color}}>{s.value}</div>
              <div style={{fontSize:11,color:'#64748b',fontWeight:600,marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Per-class visit list */}
        {loading ? (
          <div className="card" style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{L('جارٍ التحميل...','Loading...')}</div>
        ) : Object.entries(grouped)
            .sort(([a],[b])=>(classes.find((c:any)=>c.id===a)?.sort_order??0)-(classes.find((c:any)=>c.id===b)?.sort_order??0))
            .map(([cid, studs]) => {
              const cls     = classes.find((c:any)=>c.id===cid);
              const isBoys  = cls?.gender==='boys';
              const visited = studs.filter(s=>visits.some(v=>v.student_id===s.id&&v.visit_date===dateKey)).length;
              return (
                <div key={cid} style={{borderRadius:14,overflow:'hidden',boxShadow:'0 1px 4px rgba(0,0,0,.07)',border:'1px solid #e2e8f0'}}>
                  <div style={{padding:'10px 16px',background:isBoys?'linear-gradient(135deg,#1e3a8a,#2563eb)':'linear-gradient(135deg,#831843,#db2777)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span style={{fontSize:14,fontWeight:800,color:'white'}}>{classLabel(cid,lang,classes)}</span>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{background:'rgba(255,255,255,.22)',color:'white',borderRadius:99,padding:'2px 10px',fontSize:12,fontWeight:700}}>{visited}/{studs.length}</span>
                    </div>
                  </div>
                  {studs.map((s,i) => {
                    const visit = getVisit(s.id);
                    const isSaving = saving===s.id;
                    const statusColor = visit?.was_home?'#16a34a':visit?'#d97706':'#94a3b8';
                    const statusBg    = visit?.was_home?'#f0fdf4':visit?'#fef3c7':'white';
                    return (
                      <div key={s.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderBottom:i<studs.length-1?'1px solid #f1f5f9':'none',background:statusBg,transition:'background .15s'}}>
                        {/* Avatar */}
                        <div style={{width:36,height:36,borderRadius:'50%',flexShrink:0,background:isBoys?'#dbeafe':'#fce7f3',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:800,color:isBoys?'#1e40af':'#9d174d'}}>
                          {s.full_name.charAt(0)}
                        </div>
                        {/* Name + info */}
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.full_name}</div>
                          <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:2}}>
                            {s.phone && (
                              <a href={`tel:${s.phone}`} onClick={e=>e.stopPropagation()} style={{fontSize:11,color:'#4338ca',display:'flex',alignItems:'center',gap:3,textDecoration:'none'}} dir="ltr">
                                <Phone size={9}/>{s.phone}
                              </a>
                            )}
                            {s.address && <span style={{fontSize:11,color:'#64748b',display:'flex',alignItems:'center',gap:3}}><MapPin size={9}/><span className="truncate" style={{maxWidth:90}}>{s.address}</span></span>}
                          </div>
                          {visit?.notes && <div style={{fontSize:11,color:'#64748b',marginTop:3,fontStyle:'italic'}}>💬 {visit.notes}</div>}
                        </div>
                        {/* Action buttons */}
                        <div style={{display:'flex',gap:6,flexShrink:0,alignItems:'center'}}>
                          {isSaving ? (
                            <div style={{width:24,height:24,border:'2px solid #e2e8f0',borderTopColor:'#4338ca',borderRadius:'50%'}} className="spin"/>
                          ) : <>
                            {/* Was home */}
                            <button onClick={()=>toggleVisit(s,true)} style={{
                              width:38,height:38,borderRadius:10,border:'2px solid',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
                              background:visit?.was_home?'#16a34a':'white',
                              borderColor:visit?.was_home?'#16a34a':'#e2e8f0',
                              color:visit?.was_home?'white':'#94a3b8',
                              transition:'all .15s', touchAction:'manipulation',
                              flexShrink:0,
                            }} title={L('كان موجوداً','Was home')}>
                              <CheckCircle size={18}/>
                            </button>
                            {/* Not home */}
                            <button onClick={()=>toggleVisit(s,false)} style={{
                              width:38,height:38,borderRadius:10,border:'2px solid',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
                              background:visit&&!visit.was_home?'#d97706':'white',
                              borderColor:visit&&!visit.was_home?'#d97706':'#e2e8f0',
                              color:visit&&!visit.was_home?'white':'#94a3b8',
                              transition:'all .15s', touchAction:'manipulation',
                              flexShrink:0,
                            }} title={L('لم يكن موجوداً','Not home')}>
                              <XCircle size={18}/>
                            </button>
                            {/* Note */}
                            {visit && (
                              <button onClick={()=>setNoteModal({studentId:s.id,note:visit.notes??''})} style={{width:38,height:38,borderRadius:10,border:'2px solid #e2e8f0',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',background:'white',color:'#94a3b8',flexShrink:0}} title={L('ملاحظة','Note')}>
                                <MessageCircle size={15}/>
                              </button>
                            )}
                            {/* WhatsApp if phone */}
                            {s.parent_phone && (
                              <a href={`https://wa.me/${s.parent_phone.replace(/\D/g,'')}`} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{width:38,height:38,borderRadius:10,border:'2px solid #e2e8f0',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',background:'white',color:'#16a34a',textDecoration:'none',fontSize:16,flexShrink:0}} title="WhatsApp">
                                💬
                              </a>
                            )}
                          </>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
        }
      </div>

      {/* Note modal */}
      {noteModal && (
        <div className="modal-overlay" style={{alignItems:'flex-start',paddingTop:16}} onClick={e=>{if(e.target===e.currentTarget)setNoteModal(null);}}>
          <div className="modal" style={{marginTop:12}}>
            <div className="modal-header">
              <h3 style={{fontSize:16,fontWeight:800}}>💬 {L('ملاحظة الزيارة','Visit Note')}</h3>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>setNoteModal(null)}><X size={17}/></button>
            </div>
            <div className="modal-body">
              <textarea className="form-input" style={{fontSize:15,minHeight:100}} value={noteModal.note} onChange={e=>setNoteModal(n=>n?{...n,note:e.target.value}:null)} placeholder={L('أضف ملاحظة عن الزيارة...','Add a visit note...')} autoFocus/>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setNoteModal(null)}>{L('إلغاء','Cancel')}</button>
              <button className="btn btn-primary" onClick={saveNote}>{L('حفظ','Save')}</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div className="toast-wrap"><div className={`toast toast-success`} style={{maxWidth:360}}>{toast}</div></div>}
    </AppShell>
  );
}
