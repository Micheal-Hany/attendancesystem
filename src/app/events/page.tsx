'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Edit2, Trash2, Calendar, MapPin, Clock, Tag } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/LangContext';
import { getEvents, createEvent, updateEvent, deleteEvent, createNotification } from '@/lib/supabase';

const EVENT_TYPES = ['general','service','meeting','trip','other'];
const TYPE_COLORS: Record<string,{bg:string;color:string}> = {
  general:  { bg:'#e0e7ff', color:'#4338ca' },
  service:  { bg:'#ede9fe', color:'#7c3aed' },
  meeting:  { bg:'#e0f2fe', color:'#0284c7' },
  trip:     { bg:'#dcfce7', color:'#16a34a' },
  other:    { bg:'#f1f5f9', color:'#475569' },
};

interface Toast { type:'success'|'error'; msg:string; }
const emptyForm = { title:'', description:'', event_date:'', event_time:'', location:'', type:'general' };

export default function EventsPage() {
  const { user, isAdmin } = useAuth();
  const { t, lang, monthName } = useLang();
  const router = useRouter();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'upcoming'|'past'>('upcoming');
  const [modal, setModal] = useState<'add'|'edit'|null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast|null>(null);
  const [deleting, setDeleting] = useState<string|null>(null);

  useEffect(() => { if (!isAdmin) { router.replace('/dashboard'); return; } load(); }, [isAdmin]);

  function showToast(type:'success'|'error', msg:string) { setToast({type,msg}); setTimeout(()=>setToast(null),3000); }

  async function load() {
    setLoading(true);
    try { setEvents(await getEvents()); } finally { setLoading(false); }
  }

  const now = new Date().toISOString().split('T')[0];
  const upcoming = events.filter(e => e.event_date >= now).sort((a,b)=>a.event_date.localeCompare(b.event_date));
  const past     = events.filter(e => e.event_date <  now).sort((a,b)=>b.event_date.localeCompare(a.event_date));
  const displayed = tab === 'upcoming' ? upcoming : past;

  function openAdd() { setEditing(null); setForm({ ...emptyForm, event_date: now }); setModal('add'); }
  function openEdit(e:any) { setEditing(e); setForm({ title:e.title, description:e.description??'', event_date:e.event_date, event_time:e.event_time??'', location:e.location??'', type:e.type }); setModal('edit'); }

  async function handleSave() {
    if (!form.title.trim() || !form.event_date) { showToast('error', t('required')); return; }
    setSaving(true);
    try {
      const payload = { title:form.title, description:form.description||null, event_date:form.event_date, event_time:form.event_time||null, location:form.location||null, type:form.type };
      if (editing) { await updateEvent(editing.id, payload, user?.id); showToast('success', t('event_updated')); }
      else {
        await createEvent(payload, user?.id);
        showToast('success', t('event_added'));
        await createNotification({ title_ar:'فعالية جديدة', title_en:'New Event', body_ar:`تم إضافة فعالية: ${form.title}`, body_en:`New event added: ${form.title}`, type:'event', link:'/events', created_by:user?.id });
      }
      setModal(null); load();
    } catch { showToast('error', t('error')); }
    finally { setSaving(false); }
  }

  async function handleDelete(id:string) {
    setDeleting(id);
    try { await deleteEvent(id, user?.id); showToast('success', t('event_deleted')); load(); }
    catch { showToast('error', t('error')); }
    finally { setDeleting(null); }
  }

  function formatDate(d:string) {
    const dt = new Date(d+'T12:00:00');
    return `${dt.getDate()} ${monthName(dt.getMonth()+1)} ${dt.getFullYear()}`;
  }

  if (!isAdmin) return null;

  return (
    <AppShell>
      <div className="stack" style={{gap:12}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
          <div>
            <h2 style={{fontSize:18,fontWeight:800}}>{t('events')}</h2>
            <p style={{fontSize:12,color:'#64748b'}}>{upcoming.length} {lang==='ar'?'فعالية قادمة':'upcoming'}</p>
          </div>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={14}/> {t('add_event')}</button>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:6,background:'#f1f5f9',padding:4,borderRadius:10,alignSelf:'flex-start'}}>
          {(['upcoming','past'] as const).map(k=>(
            <button key={k} onClick={()=>setTab(k)} style={{
              padding:'7px 18px',borderRadius:8,border:'none',cursor:'pointer',fontFamily:'inherit',
              fontWeight:700,fontSize:13,
              background:tab===k?'white':'transparent', color:tab===k?'#1e293b':'#64748b',
              boxShadow:tab===k?'0 1px 3px rgba(0,0,0,.1)':'none', transition:'all .15s',
            }}>
              {k==='upcoming'?t('upcoming_events'):t('past_events')}
              <span style={{marginInlineStart:6,fontSize:11,background:tab===k?'#eef2ff':'#e2e8f0',color:tab===k?'#4338ca':'#64748b',borderRadius:99,padding:'1px 6px'}}>
                {k==='upcoming'?upcoming.length:past.length}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="card" style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{t('loading')}</div>
        ) : displayed.length===0 ? (
          <div className="card" style={{padding:48,textAlign:'center',color:'#94a3b8'}}>
            <Calendar size={36} style={{margin:'0 auto 10px',opacity:.3}}/>
            <p style={{fontSize:14}}>{t('no_events')}</p>
            {tab==='upcoming' && <button className="btn btn-primary" onClick={openAdd} style={{marginTop:12}}><Plus size={14}/> {t('add_event')}</button>}
          </div>
        ) : (
          <div className="stack" style={{gap:8}}>
            {displayed.map(ev=>{
              const tc = TYPE_COLORS[ev.type]??TYPE_COLORS.other;
              const isToday = ev.event_date === now;
              return (
                <div key={ev.id} className="card" style={{padding:0,overflow:'hidden',border:isToday?'2px solid #4338ca':'1px solid #e2e8f0'}}>
                  <div style={{display:'flex',alignItems:'stretch'}}>
                    {/* Date column */}
                    <div style={{
                      width:60,flexShrink:0,background:isToday?'#4338ca':'#f8fafc',
                      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                      padding:'12px 6px',borderInlineEnd:'1px solid #e2e8f0',
                    }}>
                      <div style={{fontSize:22,fontWeight:800,color:isToday?'white':'#1e293b',lineHeight:1}}>
                        {new Date(ev.event_date+'T12:00:00').getDate()}
                      </div>
                      <div style={{fontSize:10,fontWeight:700,color:isToday?'rgba(255,255,255,.8)':'#64748b',marginTop:2}}>
                        {monthName(new Date(ev.event_date+'T12:00:00').getMonth()+1).slice(0,3)}
                      </div>
                    </div>

                    {/* Content */}
                    <div style={{flex:1,padding:'12px 14px',minWidth:0}}>
                      <div style={{display:'flex',gap:8,alignItems:'flex-start',flexWrap:'wrap'}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:700,marginBottom:4}} className="truncate">{ev.title}</div>
                          {ev.description && <div style={{fontSize:12,color:'#64748b',marginBottom:6,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{ev.description}</div>}
                          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                            {ev.event_time && <div style={{display:'flex',alignItems:'center',gap:3,fontSize:11,color:'#64748b'}}><Clock size={11}/>{ev.event_time}</div>}
                            {ev.location   && <div style={{display:'flex',alignItems:'center',gap:3,fontSize:11,color:'#64748b'}}><MapPin size={11}/>{ev.location}</div>}
                            <div style={{display:'flex',alignItems:'center',gap:3}}>
                              <span style={{background:tc.bg,color:tc.color,borderRadius:99,padding:'2px 8px',fontSize:11,fontWeight:700}}>
                                {t('type_'+ev.type)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div style={{display:'flex',gap:4,flexShrink:0}}>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>openEdit(ev)}><Edit2 size={13}/></button>
                          <button className="btn btn-danger btn-sm btn-icon" onClick={()=>handleDelete(ev.id)} disabled={deleting===ev.id}><Trash2 size={13}/></button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModal(null);}}>
          <div className="modal">
            <div className="modal-header">
              <h3 style={{fontSize:16,fontWeight:800}}>{modal==='add'?t('add_event'):t('edit_event')}</h3>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>setModal(null)}><X size={17}/></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('event_title')} *</label>
                <input className="form-input" style={{fontSize:16}} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} autoFocus/>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">{t('event_date')} *</label>
                  <input type="date" className="form-input" style={{fontSize:14}} value={form.event_date} onChange={e=>setForm({...form,event_date:e.target.value})} dir="ltr"/>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('event_time')}</label>
                  <input type="time" className="form-input" style={{fontSize:14}} value={form.event_time} onChange={e=>setForm({...form,event_time:e.target.value})} dir="ltr"/>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('event_location')}</label>
                <input className="form-input" style={{fontSize:16}} value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/>
              </div>
              <div className="form-group">
                <label className="form-label">{t('event_type')}</label>
                <select className="form-input" style={{fontSize:14}} value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
                  {EVENT_TYPES.map(tp=><option key={tp} value={tp}>{t('type_'+tp)}</option>)}
                </select>
              </div>
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">{t('event_desc')}</label>
                <textarea className="form-input" style={{fontSize:14}} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={3}/>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModal(null)}>{t('cancel')}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?t('saving'):t('save')}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast-wrap"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}
    </AppShell>
  );
}
