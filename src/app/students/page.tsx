'use client';
import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, UserX, UserCheck, X, Phone } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/LangContext';
import { Student, Class } from '@/types';
import { getStudents, createStudent, updateStudent, setStudentActive, getClasses } from '@/lib/supabase';

interface Toast { type:'success'|'error'; msg:string; }

export default function StudentsPage() {
  const { user, isAdmin } = useAuth();
  const { t, lang } = useLang();
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<'add'|'edit'|null>(null);
  const [editing, setEditing] = useState<Student|null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast|null>(null);
  const [form, setForm] = useState({ full_name:'', class_id:'', phone:'', notes:'' });

  function showToast(type:'success'|'error', msg:string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  // Determine which class to scope to
  const scopedClass = isAdmin ? (filterClass || undefined) : (user?.assigned_class || undefined);

  async function load() {
    setLoading(true);
    try {
      const [studs, cls] = await Promise.all([
        getStudents(scopedClass, showInactive),
        getClasses(),
      ]);
      setStudents(studs as Student[]);
      setClasses(cls as Class[]);
    } finally { setLoading(false); }
  }

  useEffect(() => { if (user) load(); }, [filterClass, showInactive, user]);

  const filtered = students.filter(s => s.full_name.toLowerCase().includes(search.toLowerCase()));

  // Group by class
  const grouped = filtered.reduce((acc, s) => {
    (acc[s.class_id] = acc[s.class_id] || []).push(s);
    return acc;
  }, {} as Record<string, Student[]>);

  const getClass = (id:string) => classes.find(c => c.id === id);
  const className = (id:string) => { const c=getClass(id); return c ? (lang==='ar'?c.name_ar:c.name_en) : id; };

  function openAdd() {
    const defaultClass = isAdmin ? (classes[0]?.id ?? '') : (user?.assigned_class ?? '');
    setEditing(null);
    setForm({ full_name:'', class_id:defaultClass, phone:'', notes:'' });
    setModal('add');
  }
  function openEdit(s:Student) {
    setEditing(s);
    setForm({ full_name:s.full_name, class_id:s.class_id, phone:s.phone??'', notes:s.notes??'' });
    setModal('edit');
  }

  async function handleSave() {
    if (!form.full_name.trim()) { showToast('error', t('required')); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateStudent(editing.id, { full_name:form.full_name, phone:form.phone, notes:form.notes }, user?.id);
        showToast('success', t('student_updated'));
      } else {
        await createStudent({ full_name:form.full_name, class_id:form.class_id, phone:form.phone, notes:form.notes }, user?.id);
        showToast('success', t('student_added'));
      }
      setModal(null); load();
    } catch { showToast('error', t('error')); }
    finally { setSaving(false); }
  }

  async function toggleActive(s:Student) {
    try {
      await setStudentActive(s.id, !s.is_active, user?.id);
      showToast('success', s.is_active ? t('student_deactivated') : t('student_restored'));
      load();
    } catch { showToast('error', t('error')); }
  }

  // Available classes for filter (admin: all, servant: own only)
  const availableClasses = isAdmin ? classes : classes.filter(c => c.id === user?.assigned_class);

  return (
    <AppShell>
      <div className="stack" style={{ gap:12 }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
          <div>
            <h2 style={{ fontSize:18, fontWeight:800 }}>{t('students')}</h2>
            <p style={{ fontSize:12, color:'#64748b' }}>{filtered.filter(s=>s.is_active).length} {t('active')}</p>
          </div>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={15} /> {t('add_student')}
          </button>
        </div>

        {/* Filters */}
        <div className="card" style={{ padding:12, display:'flex', flexWrap:'wrap', gap:8 }}>
          <div style={{ position:'relative', flex:'1 1 160px', minWidth:0 }}>
            <Search size={13} style={{ position:'absolute', insetInlineStart:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }} />
            <input className="form-input" style={{ paddingInlineStart:30, fontSize:14 }} placeholder={t('search_placeholder')} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {isAdmin && (
            <select className="form-input" style={{ flex:'1 1 140px' }} value={filterClass} onChange={e => setFilterClass(e.target.value)}>
              <option value="">{t('all_classes')}</option>
              {classes.map(c => <option key={c.id} value={c.id}>{lang==='ar'?c.name_ar:c.name_en}</option>)}
            </select>
          )}
          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#64748b', cursor:'pointer', whiteSpace:'nowrap' }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            {t('show_inactive')}
          </label>
          {search && (
            <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')}><X size={13}/></button>
          )}
        </div>

        {/* Student list */}
        {loading ? (
          <div className="card" style={{ padding:48, textAlign:'center', color:'#94a3b8' }}>{t('loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ padding:48, textAlign:'center', color:'#94a3b8' }}>
            <UserCheck size={36} style={{ margin:'0 auto 10px', opacity:.3 }} />
            <p style={{ fontSize:14 }}>{t('no_students')}</p>
            <button className="btn btn-primary" onClick={openAdd} style={{ marginTop:12 }}>
              <Plus size={14}/> {t('add_first_student')}
            </button>
          </div>
        ) : (
          Object.entries(grouped)
            .sort(([a],[b]) => (getClass(a)?.sort_order??0) - (getClass(b)?.sort_order??0))
            .map(([classId, rows]) => {
              const cls = getClass(classId);
              const isBoys = cls?.gender === 'boys';
              return (
                <div key={classId}>
                  <div style={{
                    padding:'9px 14px', borderRadius:'10px 10px 0 0',
                    background: isBoys ? 'linear-gradient(90deg,#1e3a8a,#1d4ed8)' : 'linear-gradient(90deg,#831843,#be185d)',
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                  }}>
                    <span style={{ fontSize:13, fontWeight:800, color:'white' }}>{className(classId)}</span>
                    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                      <span className={`badge ${isBoys?'badge-blue':'badge-pink'}`}>{isBoys?t('boys'):t('girls')}</span>
                      <span style={{ fontSize:11, color:'rgba(255,255,255,.7)' }}>{rows.length} {t('student')}</span>
                    </div>
                  </div>

                  {/* Mobile: card list */}
                  <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderTop:'none', borderRadius:'0 0 10px 10px', overflow:'hidden' }}>
                    {rows.map((s, i) => (
                      <div key={s.id} style={{
                        display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                        borderBottom: i < rows.length-1 ? '1px solid #f1f5f9':'none',
                        opacity: s.is_active ? 1 : .55,
                      }}>
                        {/* Avatar */}
                        <div style={{
                          width:34, height:34, borderRadius:'50%', flexShrink:0,
                          background: isBoys ? '#dbeafe' : '#fce7f3',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:13, fontWeight:800, color: isBoys?'#1e40af':'#9d174d',
                        }}>
                          {s.full_name.charAt(0)}
                        </div>
                        {/* Name */}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:600 }} className="truncate">{s.full_name}</div>
                          {s.phone && (
                            <div style={{ fontSize:11, color:'#94a3b8', display:'flex', alignItems:'center', gap:3 }}>
                              <Phone size={10}/> <span dir="ltr">{s.phone}</span>
                            </div>
                          )}
                        </div>
                        {/* Status */}
                        <span className={`badge ${s.is_active?'badge-green':'badge-gray'}`} style={{ flexShrink:0 }}>
                          {s.is_active ? t('active') : t('inactive')}
                        </span>
                        {/* Actions */}
                        <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(s)}><Edit2 size={13}/></button>
                          <button
                            className={`btn btn-sm btn-icon ${s.is_active?'btn-danger':'btn-ghost'}`}
                            onClick={() => toggleActive(s)}
                          >
                            {s.is_active ? <UserX size={13}/> : <UserCheck size={13}/>}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget) setModal(null); }}>
          <div className="modal">
            <div className="modal-header">
              <h3 style={{ fontSize:16, fontWeight:800 }}>{modal==='add'?t('add_student'):t('edit_student')}</h3>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setModal(null)}><X size={17}/></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('full_name')} *</label>
                <input className="form-input" style={{ fontSize:16 }} value={form.full_name} onChange={e => setForm({...form,full_name:e.target.value})} autoFocus />
              </div>
              {isAdmin && modal==='add' && (
                <div className="form-group">
                  <label className="form-label">{t('class')} *</label>
                  <select className="form-input" value={form.class_id} onChange={e => setForm({...form,class_id:e.target.value})}>
                    {availableClasses.map(c => <option key={c.id} value={c.id}>{lang==='ar'?c.name_ar:c.name_en}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">{t('phone')} <span style={{ color:'#94a3b8', fontWeight:400 }}>({t('optional')})</span></label>
                <input className="form-input" style={{ fontSize:16 }} type="tel" value={form.phone} onChange={e => setForm({...form,phone:e.target.value})} dir="ltr" />
              </div>
              <div className="form-group">
                <label className="form-label">{t('notes')} <span style={{ color:'#94a3b8', fontWeight:400 }}>({t('optional')})</span></label>
                <textarea className="form-input" style={{ fontSize:14 }} value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>{t('cancel')}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? t('saving') : t('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast-wrap"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}
    </AppShell>
  );
}
