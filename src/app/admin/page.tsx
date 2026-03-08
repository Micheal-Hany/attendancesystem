'use client';
import { useState, useEffect } from 'react';
import { Plus, Edit2, X, Users, Activity, Shield, Eye, EyeOff } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/LangContext';
import { useRouter } from 'next/navigation';
import { Class } from '@/types';
import { getAllUsers, createUser, updateUser, getClasses, getActivityLog } from '@/lib/supabase';

interface Toast { type:'success'|'error'; msg:string; }

export default function AdminPage() {
  const { user, isAdmin } = useAuth();
  const { t, lang } = useLang();
  const router = useRouter();
  const [tab, setTab] = useState<'servants'|'log'>('servants');
  const [users, setUsers] = useState<any[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'add'|'edit'|null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [toast, setToast] = useState<Toast|null>(null);
  const [form, setForm] = useState({ username:'', password:'', full_name:'', role:'servant', assigned_class:'' });

  function showToast(type:'success'|'error', msg:string){ setToast({type,msg}); setTimeout(()=>setToast(null),3500); }

  useEffect(() => {
    if (!isAdmin) { router.replace('/dashboard'); return; }
    load();
  }, [isAdmin]);

  async function load() {
    setLoading(true);
    try {
      const [u,c,l] = await Promise.all([getAllUsers(), getClasses(), getActivityLog(40)]);
      setUsers(u as any[]);
      setClasses(c as Class[]);
      setLogs(l as any[]);
    } finally { setLoading(false); }
  }

  function openAdd() {
    setEditing(null);
    setForm({ username:'', password:'', full_name:'', role:'servant', assigned_class:classes[0]?.id??'' });
    setModal('add');
  }
  function openEdit(u:any) {
    setEditing(u);
    setForm({ username:u.username, password:'', full_name:u.full_name, role:u.role, assigned_class:u.assigned_class??'' });
    setModal('edit');
  }

  async function handleSave() {
    if (!form.full_name.trim()) { showToast('error', t('required')); return; }
    setSaving(true);
    try {
      if (editing) {
        const updates: any = { full_name:form.full_name, role:form.role, assigned_class:form.role==='servant'?form.assigned_class:null };
        if (form.password.trim()) {
          updates.password_hash = form.password;
        }
        await updateUser(editing.id, updates);
        showToast('success', t('servant_updated'));
      } else {
        if (!form.username.trim() || !form.password.trim()) { showToast('error', t('required')); return; }
        await createUser({
          username: form.username.toLowerCase().trim(),
          password_hash: form.password,
          full_name: form.full_name,
          role: form.role,
          assigned_class: form.role==='servant'?form.assigned_class:null,
        });
        showToast('success', t('servant_added'));
      }
      setModal(null); load();
    } catch (e:any) {
      showToast('error', e.message?.includes('unique')?`${t('username')} ${lang==='ar'?'مستخدم بالفعل':'already taken'}`:t('error'));
    } finally { setSaving(false); }
  }

  const getClassName = (id:string|null) => {
    if (!id) return lang==='ar'?'كل الفصول':'All Classes';
    const c = classes.find(cl=>cl.id===id);
    return c ? (lang==='ar'?c.name_ar:c.name_en) : id;
  };

  if (!isAdmin) return null;

  return (
    <AppShell>
      <div className="stack" style={{ gap:12 }}>
        <div>
          <h2 style={{ fontSize:18, fontWeight:800 }}>{t('admin_panel')}</h2>
          <p style={{ fontSize:12, color:'#64748b' }}>{lang==='ar'?'إدارة الخدام وسجل النشاط':'Manage servants and view activity'}</p>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:6, background:'#f1f5f9', padding:4, borderRadius:10, alignSelf:'flex-start' }}>
          {(['servants','log'] as const).map(k => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding:'7px 16px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'inherit',
              fontWeight:700, fontSize:13,
              background: tab===k ? 'white' : 'transparent',
              color: tab===k ? '#1e293b' : '#64748b',
              boxShadow: tab===k ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
              transition:'all .15s',
            }}>
              {k==='servants' ? t('servants') : t('activity_log')}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="card" style={{ padding:48, textAlign:'center', color:'#94a3b8' }}>{t('loading')}</div>
        ) : tab === 'servants' ? (
          <>
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <button className="btn btn-primary" onClick={openAdd}><Plus size={14}/> {t('add_servant')}</button>
            </div>

            {users.length === 0 ? (
              <div className="card" style={{ padding:48, textAlign:'center', color:'#94a3b8' }}>
                <Users size={32} style={{ margin:'0 auto 10px', opacity:.3 }}/>
                <p style={{ fontSize:14 }}>{t('no_servants')}</p>
              </div>
            ) : (
              <div className="card" style={{ overflow:'hidden' }}>
                {users.map((u,i) => (
                  <div key={u.id} style={{
                    display:'flex', alignItems:'center', gap:10, padding:'12px 14px',
                    borderBottom: i<users.length-1?'1px solid #f1f5f9':'none',
                  }}>
                    <div style={{
                      width:36, height:36, borderRadius:'50%', flexShrink:0,
                      background:u.role==='admin'?'linear-gradient(135deg,#7c3aed,#4338ca)':'linear-gradient(135deg,#0891b2,#0e7490)',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:14, fontWeight:800, color:'white',
                    }}>{u.full_name.charAt(0)}</div>

                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:700 }} className="truncate">{u.full_name}</div>
                      <div style={{ fontSize:11, color:'#94a3b8' }}>@{u.username}</div>
                      {u.assigned_class && (
                        <div style={{ fontSize:11, color:'#4338ca', fontWeight:600 }}>{getClassName(u.assigned_class)}</div>
                      )}
                    </div>

                    <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                      <div style={{ display:'flex', gap:4 }}>
                        {u.role==='admin' && <Shield size={12} color="#7c3aed"/>}
                        <span className={`badge ${u.role==='admin'?'badge-purple':'badge-blue'}`}>
                          {u.role==='admin'?t('admin'):t('servant')}
                        </span>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)} style={{ padding:'3px 8px', fontSize:11 }}>
                        <Edit2 size={11}/> {t('edit')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Activity log */
          <div className="card" style={{ overflow:'hidden' }}>
            {logs.length === 0 ? (
              <div style={{ padding:48, textAlign:'center', color:'#94a3b8' }}>
                <Activity size={32} style={{ margin:'0 auto 10px', opacity:.3 }}/>
                <p style={{ fontSize:14 }}>{t('no_activity')}</p>
              </div>
            ) : logs.map((log,i)=>(
              <div key={i} style={{ display:'flex', gap:10, padding:'11px 14px', borderBottom:i<logs.length-1?'1px solid #f1f5f9':'none', alignItems:'flex-start' }}>
                <div style={{
                  width:32, height:32, borderRadius:'50%', flexShrink:0,
                  background:log.action==='CREATE'?'#dcfce7':log.action==='ATTENDANCE'?'#e0e7ff':log.action==='DEACTIVATE'?'#fee2e2':'#fef3c7',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  <Activity size={13} color={log.action==='CREATE'?'#16a34a':log.action==='ATTENDANCE'?'#4338ca':log.action==='DEACTIVATE'?'#dc2626':'#d97706'}/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:12, fontWeight:600 }} className="truncate">
                    {log.action} {log.entity_type}{log.details?.name?' — '+log.details.name:''}
                  </p>
                  <p style={{ fontSize:10, color:'#94a3b8' }}>
                    {log.app_users?.full_name} · {new Date(log.created_at).toLocaleString(lang==='ar'?'ar-EG':'en-GB')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget) setModal(null); }}>
          <div className="modal">
            <div className="modal-header">
              <h3 style={{ fontSize:16, fontWeight:800 }}>{modal==='add'?t('add_servant'):(lang==='ar'?'تعديل المستخدم':'Edit User')}</h3>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setModal(null)}><X size={17}/></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('full_name')} *</label>
                <input className="form-input" style={{ fontSize:16 }} value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} autoFocus/>
              </div>
              {modal==='add' && (
                <div className="form-group">
                  <label className="form-label">{t('username')} *</label>
                  <input className="form-input" style={{ fontSize:16 }} value={form.username} onChange={e=>setForm({...form,username:e.target.value})} dir="ltr" autoCapitalize="none" autoCorrect="off"/>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">
                  {modal==='edit'?t('new_password'):t('password')} {modal==='edit'&&<span style={{ color:'#94a3b8', fontWeight:400 }}>({t('leave_blank')})</span>}
                </label>
                <div style={{ position:'relative' }}>
                  <input
                    type={showPw?'text':'password'} className="form-input"
                    style={{ paddingInlineEnd:40, fontSize:16 }}
                    value={form.password} onChange={e=>setForm({...form,password:e.target.value})}
                    dir="ltr" required={modal==='add'}
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} style={{ position:'absolute', insetInlineEnd:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding:4 }}>
                    {showPw?<EyeOff size={16}/>:<Eye size={16}/>}
                  </button>
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">{lang==='ar'?'الدور':'Role'}</label>
                  <select className="form-input" style={{ fontSize:14 }} value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
                    <option value="servant">{t('servant')}</option>
                    <option value="admin">{t('admin')}</option>
                  </select>
                </div>
                {form.role==='servant' && (
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">{t('assign_class')}</label>
                    <select className="form-input" style={{ fontSize:14 }} value={form.assigned_class} onChange={e=>setForm({...form,assigned_class:e.target.value})}>
                      {classes.map(c=><option key={c.id} value={c.id}>{lang==='ar'?c.name_ar:c.name_en}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {modal==='add' && (
                <div style={{ marginTop:12, padding:'9px 12px', background:'#fef3c7', border:'1px solid #fde68a', borderRadius:8, fontSize:12, color:'#92400e' }}>
                  {lang==='ar'?'ستُنشأ بيانات دخول جديدة. أخبر الخادم بـ username وكلمة المرور.':'New login credentials will be created. Share them with the servant.'}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>{t('cancel')}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving?t('saving'):t('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast-wrap"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}
    </AppShell>
  );
}
