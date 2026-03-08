'use client';
import { useState, useEffect } from 'react';
import { Check, X, ChevronLeft, ChevronRight, Save, AlertCircle, Calendar } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/LangContext';
import { Student, Class, SessionType, SESSIONS, FRIDAY_SESSIONS, SUNDAY_SESSIONS } from '@/types';
import { getStudents, getClasses, getExistingAttendance, attendanceExists, upsertAttendance, isoWeek, toDateStr } from '@/lib/supabase';

interface Entry { student: Student; present: boolean; }
interface Toast { type:'success'|'error'; msg:string; }

export default function AttendancePage() {
  const { user, isAdmin } = useAuth();
  const { t, lang, isRTL } = useLang();
  const now = new Date();

  const [date, setDate] = useState(toDateStr(now));
  const [session, setSession] = useState<SessionType>('mass');
  const [classId, setClassId] = useState(isAdmin ? '' : (user?.assigned_class ?? ''));
  const [classes, setClasses] = useState<Class[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [alreadyTaken, setAlreadyTaken] = useState(false);
  const [toast, setToast] = useState<Toast|null>(null);

  function showToast(t2:'success'|'error', msg:string) { setToast({type:t2,msg}); setTimeout(()=>setToast(null),3500); }

  const dateObj = new Date(date + 'T12:00:00');
  const dow = dateObj.getDay(); // 0=Sun, 5=Fri
  const isFriday = dow === 5;
  const isSunday = dow === 0;

  useEffect(() => { getClasses().then(setClasses as any); }, []);

  useEffect(() => {
    if (isFriday && SUNDAY_SESSIONS.includes(session)) setSession('mass');
    if (isSunday && FRIDAY_SESSIONS.includes(session)) setSession('tasbeha');
  }, [date]);

  useEffect(() => {
    if (!classId) { setEntries([]); return; }
    loadStudents();
  }, [classId, session, date]);

  async function loadStudents() {
    setLoading(true);
    try {
      const [studs, already, existing] = await Promise.all([
        getStudents(classId),
        attendanceExists(date, session, classId),
        getExistingAttendance(date, session, classId),
      ]);
      setAlreadyTaken(already);
      const presMap = new Map(existing.map((e:any) => [e.student_id, e.is_present]));
      setEntries((studs as Student[]).map(s => ({ student:s, present: already ? (presMap.get(s.id) ?? true) : true })));
    } finally { setLoading(false); }
  }

  function toggle(id:string) { setEntries(p => p.map(e => e.student.id===id ? {...e,present:!e.present} : e)); }
  function markAll(v:boolean) { setEntries(p => p.map(e => ({...e,present:v}))); }

  async function save() {
    if (!classId) { showToast('error', t('select_class_first')); return; }
    if (!entries.length) return;
    setSaving(true);
    try {
      const d = dateObj;
      await upsertAttendance(entries.map(e => ({
        student_id: e.student.id,
        session_type: session,
        day_of_week: d.getDay(),
        attendance_date: date,
        week_number: isoWeek(d),
        month: d.getMonth()+1,
        year: d.getFullYear(),
        is_present: e.present,
      })), user?.id);
      showToast('success', alreadyTaken ? t('attendance_updated') : t('attendance_saved'));
      setAlreadyTaken(true);
    } catch (err:any) {
      showToast('error', err?.message ?? t('error'));
    } finally { setSaving(false); }
  }

  function shiftDate(days:number) {
    const d = new Date(date+'T12:00:00');
    d.setDate(d.getDate()+days);
    setDate(toDateStr(d));
  }

  const presentCount = entries.filter(e=>e.present).length;
  const pct = entries.length > 0 ? Math.round(presentCount/entries.length*100) : 0;
  const sessCfg = SESSIONS.find(s=>s.type===session)!;
  const availableClasses = isAdmin ? classes : classes.filter(c => c.id === user?.assigned_class);
  const validSessions = isFriday ? FRIDAY_SESSIONS : isSunday ? SUNDAY_SESSIONS : [...FRIDAY_SESSIONS,...SUNDAY_SESSIONS];

  return (
    <AppShell>
      <div className="stack" style={{gap:12}}>
        <div>
          <h2 style={{fontSize:18,fontWeight:800}}>{t('take_attendance')}</h2>
          <p style={{fontSize:12,color:'#64748b'}}>{t('attendance_date')}</p>
        </div>

        <div className="card" style={{padding:14}}>
          {/* Session tabs */}
          <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
            {SESSIONS.map(sc=>(
              <button key={sc.type} onClick={()=>setSession(sc.type)} style={{
                display:'flex',flexDirection:'column',alignItems:'center',gap:2,
                padding:'8px 14px',borderRadius:9,border:`2px solid ${session===sc.type?sc.color:'#e2e8f0'}`,
                background:session===sc.type?sc.bg:'white',
                color:session===sc.type?sc.color:'#64748b',
                fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit',
                opacity:validSessions.includes(sc.type)?1:.45,
                flex:'1 1 auto',minWidth:80,transition:'all .15s',
              }}>
                <span>{lang==='ar'?sc.ar:sc.en}</span>
                <span style={{fontSize:10,fontWeight:500,opacity:.7}}>{lang==='ar'?(sc.dayOfWeek===5?'الجمعة':'الأحد'):(sc.dayOfWeek===5?'Friday':'Sunday')}</span>
              </button>
            ))}
          </div>

          <div className="grid-2">
            <div>
              <label className="form-label">{t('attendance_date')}</label>
              <div style={{display:'flex',gap:4,alignItems:'center'}}>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>shiftDate(-7)}>
                  <ChevronLeft size={15} style={{transform:isRTL?'rotate(180deg)':'none'}}/>
                </button>
                <input type="date" className="form-input" style={{flex:1,fontSize:14}} value={date} onChange={e=>setDate(e.target.value)} dir="ltr"/>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>shiftDate(7)}>
                  <ChevronRight size={15} style={{transform:isRTL?'rotate(180deg)':'none'}}/>
                </button>
              </div>
              <div style={{marginTop:4,fontSize:11,fontWeight:700,color:isFriday?'#7c3aed':isSunday?'#b45309':'#94a3b8',display:'flex',alignItems:'center',gap:4}}>
                <Calendar size={11}/>
                {isFriday?(lang==='ar'?'الجمعة':'Friday'):isSunday?(lang==='ar'?'الأحد':'Sunday'):(lang==='ar'?'يوم آخر':'Other Day')}
              </div>
            </div>
            <div>
              <label className="form-label">{t('class')}</label>
              <select className="form-input" style={{fontSize:14}} value={classId} onChange={e=>setClassId(e.target.value)} disabled={!isAdmin&&!!user?.assigned_class}>
                {isAdmin&&<option value="">{t('select_class')}</option>}
                {availableClasses.map(c=><option key={c.id} value={c.id}>{lang==='ar'?c.name_ar:c.name_en}</option>)}
              </select>
            </div>
          </div>

          {alreadyTaken&&entries.length>0&&(
            <div style={{marginTop:10,padding:'8px 12px',background:'#fefce8',border:'1px solid #fde68a',borderRadius:8,display:'flex',gap:7,alignItems:'center'}}>
              <AlertCircle size={14} color="#d97706"/>
              <span style={{fontSize:12,color:'#92400e'}}>{t('already_taken')}</span>
            </div>
          )}
        </div>

        {!classId?(
          <div className="card" style={{padding:48,textAlign:'center',color:'#94a3b8'}}>
            <Calendar size={32} style={{margin:'0 auto 10px',opacity:.3}}/>
            <p style={{fontSize:13}}>{t('select_class_first')}</p>
          </div>
        ):loading?(
          <div className="card" style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{t('loading')}</div>
        ):entries.length===0?(
          <div className="card" style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{t('no_students_class')}</div>
        ):(
          <div className="card" style={{padding:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:8}}>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                <span className={`sess-${session==='mass'?'qudas':session}`}>{lang==='ar'?sessCfg.ar:sessCfg.en}</span>
                <span className="badge badge-green"><Check size={10}/>{presentCount}</span>
                <span className="badge badge-red"><X size={10}/>{entries.length-presentCount}</span>
                <span className="badge badge-blue">{pct}%</span>
              </div>
              <div style={{display:'flex',gap:6}}>
                <button className="btn btn-secondary btn-sm" onClick={()=>markAll(true)}><Check size={12}/>{t('mark_all_present')}</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>markAll(false)}><X size={12}/>{t('mark_all_absent')}</button>
              </div>
            </div>

            <div className="progress" style={{marginBottom:12}}>
              <div className="progress-bar" style={{width:`${pct}%`,background:pct>=75?'#16a34a':pct>=50?'#d97706':'#dc2626'}}/>
            </div>

            <div className="stack" style={{gap:5}}>
              {entries.map((e,idx)=>(
                <div key={e.student.id} onClick={()=>toggle(e.student.id)} style={{
                  display:'flex',alignItems:'center',gap:10,padding:'10px 12px',
                  borderRadius:10,cursor:'pointer',transition:'all .12s',minHeight:52,
                  background:e.present?'#f0fdf4':'#fef2f2',
                  border:`1.5px solid ${e.present?'#bbf7d0':'#fecaca'}`,
                }}>
                  <span style={{fontSize:11,color:'#94a3b8',width:22,textAlign:'center',flexShrink:0}}>{idx+1}</span>
                  <button className={`att-btn ${e.present?'present':'absent'}`} onClick={ev=>{ev.stopPropagation();toggle(e.student.id);}}>
                    {e.present?<Check size={15} strokeWidth={3}/>:<X size={13} strokeWidth={3}/>}
                  </button>
                  <span style={{flex:1,fontSize:14,fontWeight:600}}>{e.student.full_name}</span>
                  <span style={{fontSize:12,fontWeight:700,flexShrink:0,color:e.present?'#16a34a':'#dc2626'}}>
                    {e.present?t('present'):t('absent')}
                  </span>
                </div>
              ))}
            </div>

            <div style={{marginTop:14,display:'flex',justifyContent:'flex-end'}}>
              <button className="btn btn-primary" onClick={save} disabled={saving} style={{minWidth:140}}>
                <Save size={14}/>
                {saving?t('saving'):alreadyTaken?t('update_attendance'):t('save_attendance')}
              </button>
            </div>
          </div>
        )}
      </div>
      {toast&&<div className="toast-wrap"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}
    </AppShell>
  );
}
