'use client';
import { useState, useEffect, useRef } from 'react';
import { Plus, X, Check, Download, Users, DollarSign, MapPin, Calendar, Trash2, Edit2 } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/LangContext';
import { supabase, getClasses, getStudents, classLabel } from '@/lib/supabase';

interface Trip { id: string; name: string; description?: string; trip_date?: string; location?: string; price?: number; class_ids: string[]; created_at: string; }
interface TripEntry { id: string; trip_id: string; student_id: string; is_coming: boolean; is_paid: boolean; notes?: string; }
interface Toast { type:'success'|'error'; msg:string; }

export default function TripsPage() {
  const { user, isAdmin } = useAuth();
  const { lang, isRTL } = useLang();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip|null>(null);
  const [entries, setEntries] = useState<TripEntry[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string|null>(null); // student id being saved
  const [tripModal, setTripModal] = useState(false);
  const [tripForm, setTripForm] = useState({ name:'', description:'', trip_date:'', location:'', price:'', class_ids:[] as string[] });
  const [toast, setToast] = useState<Toast|null>(null);
  const saveTimers = useRef<Record<string,ReturnType<typeof setTimeout>>>({});

  const T = (k:string) => ({
    trips: lang==='ar'?'الرحلات':'Trips',
    add_trip: lang==='ar'?'إضافة رحلة':'New Trip',
    trip_name: lang==='ar'?'اسم الرحلة':'Trip Name',
    trip_date: lang==='ar'?'تاريخ الرحلة':'Trip Date',
    location: lang==='ar'?'المكان':'Location',
    price: lang==='ar'?'السعر (ج.م)':'Price (EGP)',
    description: lang==='ar'?'وصف':'Description',
    classes: lang==='ar'?'الفصول المشاركة':'Participating Classes',
    no_trips: lang==='ar'?'لا توجد رحلات':'No trips yet',
    coming: lang==='ar'?'سيحضر':'Coming',
    paid: lang==='ar'?'دفع':'Paid',
    student: lang==='ar'?'الطالب':'Student',
    notes: lang==='ar'?'ملاحظات':'Notes',
    total_coming: lang==='ar'?'إجمالي الحضور':'Total Coming',
    total_paid: lang==='ar'?'إجمالي الدفع':'Total Paid',
    back: lang==='ar'?'رجوع':'Back',
    save: lang==='ar'?'حفظ':'Save',
    cancel: lang==='ar'?'إلغاء':'Cancel',
    loading: lang==='ar'?'جارٍ التحميل...':'Loading...',
    no_data: lang==='ar'?'لا توجد بيانات':'No data',
    saved: lang==='ar'?'تم الحفظ':'Saved',
    error: lang==='ar'?'حدث خطأ':'Error',
    required: lang==='ar'?'مطلوب':'Required',
    delete_trip: lang==='ar'?'حذف الرحلة؟':'Delete trip?',
    all_classes: lang==='ar'?'كل الفصول':'All classes',
  })[k] ?? k;

  function showToast(type:Toast['type'], msg:string) { setToast({type,msg}); setTimeout(()=>setToast(null),2500); }

  useEffect(() => {
    getClasses().then(setClasses as any);
    loadTrips();
  }, []);

  async function loadTrips() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('trips').select('*').order('created_at', {ascending:false});
      if (error) throw error;
      setTrips(data ?? []);
    } catch { setTrips([]); }
    finally { setLoading(false); }
  }

  async function openTrip(trip: Trip) {
    setActiveTrip(trip);
    // Load students for this trip's classes
    const scopeClass = isAdmin ? undefined : (user?.assigned_class ?? undefined);
    const studs = await getStudents(scopeClass) as any[];
    const tripStudents = trip.class_ids?.length
      ? studs.filter(s => trip.class_ids.includes(s.class_id))
      : studs;
    setStudents(tripStudents);
    // Load existing entries
    const { data } = await supabase.from('trip_entries').select('*').eq('trip_id', trip.id);
    setEntries(data ?? []);
  }

  function getEntry(studentId: string): TripEntry|undefined {
    return entries.find(e => e.student_id === studentId);
  }

  async function toggleField(studentId: string, field: 'is_coming'|'is_paid') {
    const existing = getEntry(studentId);
    const newVal = !(existing?.[field] ?? false);

    // Optimistic update
    if (existing) {
      setEntries(prev => prev.map(e => e.student_id===studentId ? {...e,[field]:newVal} : e));
    } else {
      const optimistic: TripEntry = { id:'temp-'+studentId, trip_id:activeTrip!.id, student_id:studentId, is_coming:false, is_paid:false, [field]:newVal };
      setEntries(prev => [...prev, optimistic]);
    }

    // Debounce save
    clearTimeout(saveTimers.current[studentId+field]);
    saveTimers.current[studentId+field] = setTimeout(async () => {
      setSaving(studentId);
      try {
        const current = entries.find(e => e.student_id===studentId);
        const payload = { trip_id:activeTrip!.id, student_id:studentId, [field]:newVal, ...(current && current.id!.startsWith('temp') ? {} : {}) };
        if (existing && !existing.id.startsWith('temp')) {
          await supabase.from('trip_entries').update({[field]:newVal}).eq('id', existing.id);
        } else {
          const { data, error } = await supabase.from('trip_entries').upsert({
            trip_id: activeTrip!.id, student_id: studentId,
            is_coming: field==='is_coming'?newVal:(getEntry(studentId)?.is_coming??false),
            is_paid:   field==='is_paid'  ?newVal:(getEntry(studentId)?.is_paid??false),
          }, { onConflict:'trip_id,student_id' }).select().single();
          if (!error && data) setEntries(prev => prev.map(e => e.student_id===studentId ? data : e));
        }
      } catch { showToast('error', T('error')); }
      finally { setSaving(null); }
    }, 400);
  }

  async function updateNotes(studentId: string, notes: string) {
    const existing = getEntry(studentId);
    setEntries(prev => prev.map(e => e.student_id===studentId ? {...e,notes} : e));
    if (existing && !existing.id.startsWith('temp')) {
      await supabase.from('trip_entries').update({notes}).eq('id', existing.id);
    }
  }

  async function createTrip() {
    if (!tripForm.name.trim()) { showToast('error', T('required')); return; }
    try {
      const { data, error } = await supabase.from('trips').insert({
        name: tripForm.name, description: tripForm.description||null,
        trip_date: tripForm.trip_date||null, location: tripForm.location||null,
        price: tripForm.price ? parseFloat(tripForm.price) : null,
        class_ids: tripForm.class_ids,
        created_by: user?.id,
      }).select().single();
      if (error) throw error;
      setTripModal(false);
      setTripForm({ name:'', description:'', trip_date:'', location:'', price:'', class_ids:[] });
      loadTrips();
    } catch { showToast('error', T('error')); }
  }

  async function deleteTrip(trip: Trip, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(T('delete_trip'))) return;
    await supabase.from('trip_entries').delete().eq('trip_id', trip.id);
    await supabase.from('trips').delete().eq('id', trip.id);
    loadTrips();
  }

  function exportCSV() {
    if (!activeTrip || !students.length) return;
    const rows = students.map(s => {
      const e = getEntry(s.id);
      return [s.full_name, classLabel(s.class_id, lang, classes), e?.is_coming?'✓':'', e?.is_paid?'✓':'', e?.notes??''];
    });
    const header = [T('student'), lang==='ar'?'الفصل':'Class', T('coming'), T('paid'), T('notes')];
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`${activeTrip.name}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // Group students by class for the trip view
  const grouped = students.reduce((acc, s) => {
    const cid = s.class_id;
    if (!acc[cid]) acc[cid] = [];
    acc[cid].push(s);
    return acc;
  }, {} as Record<string,any[]>);

  const totalComing = entries.filter(e=>e.is_coming).length;
  const totalPaid   = entries.filter(e=>e.is_paid).length;

  if (activeTrip) return (
    <AppShell>
      <div className="stack" style={{gap:12}}>
        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:10}}>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>{setActiveTrip(null);setEntries([]);setStudents([]);}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transform:isRTL?'rotate(180deg)':'none'}}><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div>
              <h2 style={{fontSize:18,fontWeight:800}}>{activeTrip.name}</h2>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:3}}>
                {activeTrip.trip_date && <span style={{fontSize:12,color:'#64748b',display:'flex',alignItems:'center',gap:3}}><Calendar size={11}/>{activeTrip.trip_date}</span>}
                {activeTrip.location  && <span style={{fontSize:12,color:'#64748b',display:'flex',alignItems:'center',gap:3}}><MapPin size={11}/>{activeTrip.location}</span>}
                {activeTrip.price     && <span style={{fontSize:12,color:'#16a34a',fontWeight:700,display:'flex',alignItems:'center',gap:3}}><DollarSign size={11}/>{activeTrip.price} {lang==='ar'?'ج.م':'EGP'}</span>}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={exportCSV} style={{gap:5}}>
            <Download size={13}/>{lang==='ar'?'تصدير CSV':'Export CSV'}
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid-3">
          <div className="card stat-card stat-indigo">
            <p style={{fontSize:11,color:'#64748b',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',marginBottom:4}}>{lang==='ar'?'إجمالي الطلاب':'Total Students'}</p>
            <p style={{fontSize:26,fontWeight:800}}>{students.length}</p>
          </div>
          <div className="card stat-card stat-green">
            <p style={{fontSize:11,color:'#64748b',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',marginBottom:4}}>{T('total_coming')}</p>
            <p style={{fontSize:26,fontWeight:800,color:'#16a34a'}}>{totalComing}</p>
            <p style={{fontSize:11,color:'#94a3b8'}}>{students.length>0?`${Math.round(totalComing/students.length*100)}%`:''}</p>
          </div>
          <div className="card stat-card stat-amber">
            <p style={{fontSize:11,color:'#64748b',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',marginBottom:4}}>{T('total_paid')}</p>
            <p style={{fontSize:26,fontWeight:800,color:'#d97706'}}>{totalPaid}</p>
            {activeTrip.price && <p style={{fontSize:11,color:'#94a3b8'}}>{(totalPaid*(activeTrip.price||0)).toLocaleString()} {lang==='ar'?'ج.م':'EGP'}</p>}
          </div>
        </div>

        {/* Students per class */}
        {Object.entries(grouped)
          .sort(([a],[b])=>(classes.find(c=>c.id===a)?.sort_order??0)-(classes.find(c=>c.id===b)?.sort_order??0))
          .map(([cid, studs]) => {
            const cls = classes.find(c=>c.id===cid);
            const isBoys = cls?.gender==='boys';
            const clsComing = studs.filter(s=>getEntry(s.id)?.is_coming).length;
            const clsPaid   = studs.filter(s=>getEntry(s.id)?.is_paid).length;
            return (
              <div key={cid}>
                <div style={{padding:'9px 14px',borderRadius:'10px 10px 0 0',background:isBoys?'linear-gradient(90deg,#1e3a8a,#1d4ed8)':'linear-gradient(90deg,#831843,#be185d)',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:6}}>
                  <span style={{fontSize:13,fontWeight:800,color:'white'}}>{classLabel(cid,lang,classes)}</span>
                  <div style={{display:'flex',gap:10}}>
                    <span style={{fontSize:12,color:'rgba(255,255,255,.8)',display:'flex',alignItems:'center',gap:4}}><Users size={11}/>{clsComing}/{studs.length}</span>
                    <span style={{fontSize:12,color:'rgba(255,255,255,.8)',display:'flex',alignItems:'center',gap:4}}><DollarSign size={11}/>{clsPaid}</span>
                  </div>
                </div>
                <div className="table-wrap" style={{borderRadius:'0 0 10px 10px',borderTop:'none'}}>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{T('student')}</th>
                        <th style={{textAlign:'center',width:80}}>
                          <span style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4,color:'#16a34a'}}>
                            <Check size={12}/>{T('coming')}
                          </span>
                        </th>
                        <th style={{textAlign:'center',width:80}}>
                          <span style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4,color:'#d97706'}}>
                            <DollarSign size={12}/>{T('paid')}
                          </span>
                        </th>
                        <th style={{minWidth:100}}>{T('notes')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(studs as any[]).map((s,i)=>{
                        const entry = getEntry(s.id);
                        const isSaving = saving===s.id;
                        return (
                          <tr key={s.id} style={{background:entry?.is_coming?'#f0fdf4':i%2===0?'#fff':'#fafafa'}}>
                            <td style={{color:'#94a3b8',fontSize:11,width:30}}>{i+1}</td>
                            <td style={{fontWeight:600,fontSize:14}}>
                              {s.full_name}
                              {isSaving && <span style={{marginInlineStart:6,display:'inline-block',width:10,height:10,border:'1.5px solid #e2e8f0',borderTopColor:'#4338ca',borderRadius:'50%'}} className="spin"/>}
                            </td>
                            {/* COMING toggle */}
                            <td style={{textAlign:'center'}}>
                              <button onClick={()=>toggleField(s.id,'is_coming')} style={{
                                width:36,height:36,borderRadius:9,border:'2px solid',cursor:'pointer',
                                display:'inline-flex',alignItems:'center',justifyContent:'center',
                                background:entry?.is_coming?'#16a34a':'white',
                                borderColor:entry?.is_coming?'#16a34a':'#e2e8f0',
                                color:entry?.is_coming?'white':'#cbd5e1',
                                transition:'all .15s', touchAction:'manipulation',
                              }}>
                                <Check size={16} strokeWidth={3}/>
                              </button>
                            </td>
                            {/* PAID toggle */}
                            <td style={{textAlign:'center'}}>
                              <button onClick={()=>toggleField(s.id,'is_paid')} style={{
                                width:36,height:36,borderRadius:9,border:'2px solid',cursor:'pointer',
                                display:'inline-flex',alignItems:'center',justifyContent:'center',
                                background:entry?.is_paid?'#d97706':'white',
                                borderColor:entry?.is_paid?'#d97706':'#e2e8f0',
                                color:entry?.is_paid?'white':'#cbd5e1',
                                transition:'all .15s', touchAction:'manipulation',
                              }}>
                                <DollarSign size={15}/>
                              </button>
                            </td>
                            {/* Notes */}
                            <td>
                              <input className="form-input" style={{fontSize:13,padding:'5px 8px',minWidth:0}} value={entry?.notes??''} placeholder="..." onChange={e=>updateNotes(s.id,e.target.value)}/>
                            </td>
                          </tr>
                        );
                      })}
                      {/* Class totals row */}
                      <tr style={{background:'#f8fafc',fontWeight:700}}>
                        <td colSpan={2} style={{fontWeight:800,color:'#374151',fontSize:12}}>{lang==='ar'?'مجموع الفصل':'Class Total'}</td>
                        <td style={{textAlign:'center'}}>
                          <span className="badge badge-green">{clsComing}/{studs.length}</span>
                        </td>
                        <td style={{textAlign:'center'}}>
                          <span className="badge badge-amber">{clsPaid}</span>
                        </td>
                        <td style={{color:'#94a3b8',fontSize:11}}>
                          {activeTrip.price ? `${clsPaid*(activeTrip.price||0)} ${lang==='ar'?'ج.م':'EGP'}` : ''}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
      </div>
      {toast&&<div className="toast-wrap"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}
    </AppShell>
  );

  // ── TRIPS LIST ────────────────────────────────────────────
  return (
    <AppShell>
      <div className="stack" style={{gap:12}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
          <div>
            <h2 style={{fontSize:18,fontWeight:800}}>{T('trips')}</h2>
            <p style={{fontSize:12,color:'#64748b'}}>{trips.length} {lang==='ar'?'رحلة':'trips'}</p>
          </div>
          {isAdmin && (
            <button className="btn btn-primary" onClick={()=>setTripModal(true)}><Plus size={14}/> {T('add_trip')}</button>
          )}
        </div>

        {loading ? (
          <div className="card" style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{T('loading')}</div>
        ) : trips.length===0 ? (
          <div className="card" style={{padding:48,textAlign:'center',color:'#94a3b8'}}>
            <div style={{fontSize:36,marginBottom:12}}>🚌</div>
            <p style={{fontSize:14,fontWeight:600,marginBottom:4}}>{T('no_trips')}</p>
            {isAdmin && <button className="btn btn-primary" onClick={()=>setTripModal(true)} style={{marginTop:12}}><Plus size={14}/> {T('add_trip')}</button>}
          </div>
        ) : (
          <div className="stack" style={{gap:8}}>
            {trips.map(trip => (
              <div key={trip.id} className="card" style={{padding:0,overflow:'hidden',cursor:'pointer'}} onClick={()=>openTrip(trip)}>
                <div style={{display:'flex',alignItems:'stretch'}}>
                  {/* Date column */}
                  <div style={{width:60,flexShrink:0,background:'linear-gradient(135deg,#4338ca,#7c3aed)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'12px 6px',color:'white'}}>
                    {trip.trip_date ? <>
                      <div style={{fontSize:20,fontWeight:800,lineHeight:1}}>{new Date(trip.trip_date+'T12:00:00').getDate()}</div>
                      <div style={{fontSize:9,opacity:.8,marginTop:2}}>{new Date(trip.trip_date+'T12:00:00').toLocaleDateString(lang==='ar'?'ar-EG':'en-GB',{month:'short'})}</div>
                    </> : <div style={{fontSize:20}}>🚌</div>}
                  </div>
                  {/* Content */}
                  <div style={{flex:1,padding:'12px 14px',minWidth:0}}>
                    <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>{trip.name}</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:10}}>
                      {trip.location && <span style={{fontSize:11,color:'#64748b',display:'flex',alignItems:'center',gap:3}}><MapPin size={10}/>{trip.location}</span>}
                      {trip.price    && <span style={{fontSize:11,color:'#16a34a',fontWeight:700,display:'flex',alignItems:'center',gap:3}}><DollarSign size={10}/>{trip.price} {lang==='ar'?'ج.م':'EGP'}</span>}
                    </div>
                    {trip.description && <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>{trip.description}</div>}
                  </div>
                  {/* Delete */}
                  {isAdmin && (
                    <button className="btn btn-danger btn-sm btn-icon" style={{margin:'10px 10px',flexShrink:0}} onClick={e=>deleteTrip(trip,e)}><Trash2 size={13}/></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Trip Modal */}
      {tripModal && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setTripModal(false);}}>
          <div className="modal">
            <div className="modal-header">
              <h3 style={{fontSize:16,fontWeight:800}}>{T('add_trip')}</h3>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>setTripModal(false)}><X size={17}/></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{T('trip_name')} *</label>
                <input className="form-input" style={{fontSize:16}} value={tripForm.name} onChange={e=>setTripForm(f=>({...f,name:e.target.value}))} autoFocus/>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">{T('trip_date')}</label>
                  <input type="date" className="form-input" style={{fontSize:14}} value={tripForm.trip_date} onChange={e=>setTripForm(f=>({...f,trip_date:e.target.value}))} dir="ltr"/>
                </div>
                <div className="form-group">
                  <label className="form-label">{T('price')}</label>
                  <input type="number" className="form-input" style={{fontSize:16}} value={tripForm.price} onChange={e=>setTripForm(f=>({...f,price:e.target.value}))} dir="ltr" min="0"/>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{T('location')}</label>
                <input className="form-input" style={{fontSize:16}} value={tripForm.location} onChange={e=>setTripForm(f=>({...f,location:e.target.value}))}/>
              </div>
              <div className="form-group">
                <label className="form-label">{T('classes')}</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {classes.map(c=>{
                    const sel = tripForm.class_ids.includes(c.id);
                    return (
                      <button key={c.id} onClick={()=>setTripForm(f=>({...f,class_ids:sel?f.class_ids.filter(id=>id!==c.id):[...f.class_ids,c.id]}))}
                        style={{padding:'5px 12px',borderRadius:99,border:'1.5px solid',fontSize:12,cursor:'pointer',fontFamily:'inherit',fontWeight:600,
                          borderColor:sel?'#4338ca':'#e2e8f0',background:sel?'#eef2ff':'white',color:sel?'#4338ca':'#64748b'}}>
                        {lang==='ar'?c.name_ar:c.name_en}
                      </button>
                    );
                  })}
                </div>
                <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>{lang==='ar'?'اتركه فارغاً لعرض كل الفصول':'Leave empty to include all classes'}</div>
              </div>
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">{T('description')}</label>
                <textarea className="form-input" style={{fontSize:14}} value={tripForm.description} onChange={e=>setTripForm(f=>({...f,description:e.target.value}))} rows={2}/>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setTripModal(false)}>{T('cancel')}</button>
              <button className="btn btn-primary" onClick={createTrip}>{T('save')}</button>
            </div>
          </div>
        </div>
      )}
      {toast&&<div className="toast-wrap"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}
    </AppShell>
  );
}
