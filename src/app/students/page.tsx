'use client';
import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, UserX, UserCheck, X, Phone, MapPin, User, Calendar, Users, ChevronRight } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/LangContext';
import { Student, Class } from '@/types';
import { getStudents, createStudent, updateStudent, setStudentActive, getClasses } from '@/lib/supabase';

const emptyForm = { full_name:'', class_id:'', phone:'', address:'', birth_date:'', parent_name:'', parent_phone:'', notes:'' };

export default function StudentsPage() {
  const { user, isAdmin } = useAuth();
  const { lang, isRTL } = useLang();
  const L = (a:string,e:string)=>lang==='ar'?a:e;

  const [students,     setStudents]     = useState<Student[]>([]);
  const [classes,      setClasses]      = useState<Class[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filterClass,  setFilterClass]  = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [modal,        setModal]        = useState<'add'|'edit'|null>(null);
  const [profile,      setProfile]      = useState<Student|null>(null);
  const [editing,      setEditing]      = useState<Student|null>(null);
  const [saving,       setSaving]       = useState(false);
  const [toast,        setToast]        = useState<{type:string;msg:string}|null>(null);
  const [form,         setForm]         = useState(emptyForm);

  function showToast(type:string,msg:string){setToast({type,msg});setTimeout(()=>setToast(null),3000);}

  const scopedClass = isAdmin?(filterClass||undefined):(user?.assigned_class||undefined);

  async function load(){
    setLoading(true);
    try{
      const [studs,cls]=await Promise.all([getStudents(scopedClass,showInactive),getClasses()]);
      setStudents(studs as Student[]);
      setClasses(cls as Class[]);
    }finally{setLoading(false);}
  }

  useEffect(()=>{if(user)load();},[filterClass,showInactive,user]);

  const filtered  = students.filter(s=>s.full_name.toLowerCase().includes(search.toLowerCase()));
  const grouped   = filtered.reduce((acc,s)=>{(acc[s.class_id]=acc[s.class_id]||[]).push(s);return acc;},{} as Record<string,Student[]>);
  const getClass  = (id:string)=>classes.find(c=>c.id===id);
  const clsName   = (id:string)=>{const c=getClass(id);return c?(lang==='ar'?c.name_ar:c.name_en):id;};
  const availableClasses = isAdmin?classes:classes.filter(c=>c.id===user?.assigned_class);

  function openAdd(){
    setEditing(null);
    setForm({...emptyForm,class_id:isAdmin?(classes[0]?.id??''):(user?.assigned_class??'')});
    setModal('add');
  }
  function openEdit(s:Student,e?:React.MouseEvent){
    e?.stopPropagation();
    setEditing(s);
    setForm({
      full_name:s.full_name, class_id:s.class_id,
      phone:s.phone??'', address:s.address??'',
      birth_date:s.birth_date??'', parent_name:s.parent_name??'',
      parent_phone:s.parent_phone??'', notes:s.notes??'',
    });
    setModal('edit');
  }

  async function handleSave(){
    if(!form.full_name.trim()){showToast('error',L('الاسم مطلوب','Name is required'));return;}
    setSaving(true);
    try{
      if(editing){
        // ✅ FIX: pass null for empty birth_date, never pass empty string to Postgres DATE
        const updates:Record<string,unknown>={
          full_name:  form.full_name.trim(),
          phone:      form.phone||null,
          address:    form.address||null,
          birth_date: form.birth_date||null,
          parent_name:  form.parent_name||null,
          parent_phone: form.parent_phone||null,
          notes:      form.notes||null,
        };
        await updateStudent(editing.id,updates,user?.id);
        showToast('success',L('تم تعديل بيانات الطالب','Student updated'));
        // refresh profile if open
        if(profile?.id===editing.id) setProfile(prev=>prev?{...prev,...updates} as Student:null);
      }else{
        await createStudent({
          full_name:    form.full_name.trim(),
          class_id:     form.class_id,
          phone:        form.phone||undefined,
          address:      form.address||undefined,
          birth_date:   form.birth_date||undefined,
          parent_name:  form.parent_name||undefined,
          parent_phone: form.parent_phone||undefined,
          notes:        form.notes||undefined,
        },user?.id);
        showToast('success',L('تم إضافة الطالب','Student added'));
      }
      setModal(null);
      load();
    }catch(e){
      console.error('save error',e);
      showToast('error',L('حدث خطأ، تأكد من صحة البيانات','Error saving student'));
    }finally{setSaving(false);}
  }

  async function toggleActive(s:Student,e:React.MouseEvent){
    e.stopPropagation();
    try{
      await setStudentActive(s.id,!s.is_active,user?.id);
      showToast('success',s.is_active?L('تم إيقاف الطالب','Deactivated'):L('تم تفعيل الطالب','Activated'));
      load();
    }catch{showToast('error',L('حدث خطأ','Error'));}
  }

  return (
    <AppShell>
      <div className="stack" style={{gap:12}}>

        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
          <div>
            <h2 style={{fontSize:20,fontWeight:800}}>{L('الطلاب','Students')}</h2>
            <p style={{fontSize:12,color:'#64748b'}}>{students.filter(s=>s.is_active).length} {L('نشط','active')} · {students.length} {L('إجمالي','total')}</p>
          </div>
          <button className="btn btn-primary" onClick={openAdd} style={{gap:6}}><Plus size={15}/>{L('إضافة طالب','Add Student')}</button>
        </div>

        {/* Filters */}
        <div className="card" style={{padding:10,display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}>
          <div style={{position:'relative',flex:'1 1 160px',minWidth:120}}>
            <Search size={13} style={{position:'absolute',insetInlineStart:10,top:'50%',transform:'translateY(-50%)',color:'#94a3b8',pointerEvents:'none'}}/>
            <input className="form-input" style={{paddingInlineStart:30}} placeholder={L('بحث...','Search...')} value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          {isAdmin&&(
            <select className="form-input" style={{flex:'1 1 130px'}} value={filterClass} onChange={e=>setFilterClass(e.target.value)}>
              <option value="">{L('كل الفصول','All Classes')}</option>
              {classes.map(c=><option key={c.id} value={c.id}>{lang==='ar'?c.name_ar:c.name_en}</option>)}
            </select>
          )}
          <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#64748b',cursor:'pointer',whiteSpace:'nowrap'}}>
            <input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)} style={{accentColor:'#4338ca'}}/>
            {L('عرض غير النشطين','Show Inactive')}
          </label>
          {search&&<button className="btn btn-ghost btn-sm btn-icon" onClick={()=>setSearch('')}><X size={13}/></button>}
        </div>

        {/* List */}
        {loading?(
          <div className="card" style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{L('جارٍ التحميل...','Loading...')}</div>
        ):filtered.length===0?(
          <div className="card" style={{padding:48,textAlign:'center',color:'#94a3b8'}}>
            <Users size={36} style={{margin:'0 auto 10px',opacity:.3}}/>
            <p style={{fontSize:14,fontWeight:600,marginBottom:12}}>{L('لا يوجد طلاب','No students')}</p>
            <button className="btn btn-primary" onClick={openAdd}><Plus size={14}/>{L('إضافة طالب','Add Student')}</button>
          </div>
        ):Object.entries(grouped)
          .sort(([a],[b])=>(getClass(a)?.sort_order??0)-(getClass(b)?.sort_order??0))
          .map(([classId,rows])=>{
            const cls    = getClass(classId);
            const isBoys = cls?.gender==='boys';
            return(
              <div key={classId} style={{borderRadius:12,overflow:'hidden',border:'1px solid #e2e8f0',boxShadow:'0 1px 3px rgba(0,0,0,.06)'}}>
                <div style={{padding:'10px 14px',background:isBoys?'linear-gradient(135deg,#1e3a8a,#2563eb)':'linear-gradient(135deg,#831843,#db2777)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontSize:14,fontWeight:800,color:'white'}}>{clsName(classId)}</span>
                  <span style={{color:'rgba(255,255,255,.8)',fontSize:12}}>{rows.filter(s=>s.is_active).length}/{rows.length}</span>
                </div>
                {rows.map((s,i)=>(
                  <div key={s.id} onClick={()=>setProfile(s)}
                    style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderBottom:i<rows.length-1?'1px solid #f1f5f9':'none',background:'white',opacity:s.is_active?1:.55,cursor:'pointer',transition:'background .1s'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#f8faff'}
                    onMouseLeave={e=>e.currentTarget.style.background='white'}>
                    <div style={{width:36,height:36,borderRadius:'50%',flexShrink:0,background:isBoys?'#dbeafe':'#fce7f3',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:800,color:isBoys?'#1e40af':'#9d174d'}}>
                      {s.full_name.charAt(0)}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.full_name}</div>
                      <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:2}}>
                        {s.phone&&<span style={{fontSize:11,color:'#64748b',display:'flex',alignItems:'center',gap:3}}><Phone size={9}/><span dir="ltr">{s.phone}</span></span>}
                        {s.address&&<span style={{fontSize:11,color:'#64748b',display:'flex',alignItems:'center',gap:3}}><MapPin size={9}/><span className="truncate" style={{maxWidth:100}}>{s.address}</span></span>}
                      </div>
                    </div>
                    <div style={{display:'flex',gap:4,flexShrink:0,alignItems:'center'}}>
                      <span className={`badge ${s.is_active?'badge-green':'badge-gray'}`} style={{fontSize:10}}>{s.is_active?L('نشط','Active'):L('متوقف','Inactive')}</span>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={e=>openEdit(s,e)}><Edit2 size={13}/></button>
                      <button className={`btn btn-sm btn-icon ${s.is_active?'btn-danger':'btn-ghost'}`} onClick={e=>toggleActive(s,e)}>{s.is_active?<UserX size={13}/>:<UserCheck size={13}/>}</button>
                      <ChevronRight size={13} style={{color:'#cbd5e1',transform:isRTL?'rotate(180deg)':'none'}}/>
                    </div>
                  </div>
                ))}
              </div>
            );
          })
        }
      </div>

      {/* Profile Drawer */}
      {profile&&(
        <>
          <div onClick={()=>setProfile(null)} style={{position:'fixed',inset:0,background:'rgba(15,23,42,.4)',zIndex:800}}/>
          <div style={{position:'fixed',top:0,bottom:0,insetInlineEnd:0,width:'min(360px,100vw)',background:'white',zIndex:801,display:'flex',flexDirection:'column',boxShadow:'-4px 0 24px rgba(0,0,0,.15)',overflowY:'auto'}}>
            <div style={{background:'linear-gradient(135deg,#3730a3,#7c3aed)',padding:'20px 18px 18px',flexShrink:0}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                <button onClick={()=>setProfile(null)} style={{background:'rgba(255,255,255,.2)',border:'none',color:'white',borderRadius:'50%',width:32,height:32,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><X size={15}/></button>
                <button onClick={()=>openEdit(profile)} style={{background:'rgba(255,255,255,.2)',border:'none',color:'white',borderRadius:8,padding:'6px 12px',cursor:'pointer',display:'flex',alignItems:'center',gap:5,fontSize:13,fontFamily:'inherit',fontWeight:600}}><Edit2 size={13}/>{L('تعديل','Edit')}</button>
              </div>
              <div style={{display:'flex',gap:12,alignItems:'center'}}>
                <div style={{width:52,height:52,borderRadius:'50%',background:'rgba(255,255,255,.25)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:800,color:'white',flexShrink:0}}>{profile.full_name.charAt(0)}</div>
                <div>
                  <h3 style={{fontSize:17,fontWeight:800,color:'white',lineHeight:1.2}}>{profile.full_name}</h3>
                  <p style={{fontSize:12,color:'rgba(255,255,255,.75)',marginTop:3}}>{clsName(profile.class_id)}</p>
                  <span style={{display:'inline-block',marginTop:5,background:profile.is_active?'#4ade80':'rgba(255,255,255,.3)',borderRadius:99,padding:'2px 10px',fontSize:11,fontWeight:700,color:profile.is_active?'#14532d':'white'}}>
                    {profile.is_active?L('نشط','Active'):L('غير نشط','Inactive')}
                  </span>
                </div>
              </div>
            </div>
            <div style={{padding:16}}>
              {[
                {icon:<Phone size={14}/>,     label:L('الهاتف','Phone'),               val:profile.phone,        dir:'ltr' as const},
                {icon:<MapPin size={14}/>,    label:L('العنوان','Address'),             val:profile.address},
                {icon:<Calendar size={14}/>,  label:L('تاريخ الميلاد','Birthday'),      val:profile.birth_date,  dir:'ltr' as const},
                {icon:<User size={14}/>,      label:L('ولي الأمر','Parent Name'),       val:profile.parent_name},
                {icon:<Phone size={14}/>,     label:L('هاتف ولي الأمر','Parent Phone'), val:profile.parent_phone,dir:'ltr' as const},
                {icon:<User size={14}/>,      label:L('ملاحظات','Notes'),               val:profile.notes},
              ].filter(f=>f.val).map((f,i)=>(
                <div key={i} style={{display:'flex',gap:12,padding:'11px 0',borderBottom:'1px solid #f1f5f9',alignItems:'flex-start'}}>
                  <div style={{width:32,height:32,borderRadius:8,background:'#f0f4ff',display:'flex',alignItems:'center',justifyContent:'center',color:'#4338ca',flexShrink:0}}>{f.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,color:'#94a3b8',fontWeight:600,marginBottom:2}}>{f.label}</div>
                    <div style={{fontSize:14,fontWeight:600,color:'#1e293b',wordBreak:'break-word'}} dir={f.dir}>{f.val}</div>
                  </div>
                </div>
              ))}
              {!profile.phone&&!profile.address&&!profile.parent_name&&(
                <div style={{textAlign:'center',padding:'28px 0',color:'#94a3b8'}}>
                  <User size={32} style={{margin:'0 auto 10px',opacity:.3}}/>
                  <p style={{fontSize:13,marginBottom:12}}>{L('لا توجد تفاصيل إضافية','No additional details')}</p>
                  <button className="btn btn-secondary btn-sm" onClick={()=>openEdit(profile)}><Plus size={12}/>{L('إضافة تفاصيل','Add Details')}</button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Add/Edit Modal */}
      {modal&&(
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModal(null);}}>
          <div className="modal">
            <div className="modal-header" style={{background:'#f8fafc'}}>
              <div>
                <h3 style={{fontSize:16,fontWeight:800}}>{modal==='add'?L('إضافة طالب','Add Student'):L('تعديل بيانات الطالب','Edit Student')}</h3>
                <p style={{fontSize:11,color:'#64748b',marginTop:2}}>{L('أدخل بيانات الطالب','Enter student details')}</p>
              </div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>setModal(null)}><X size={17}/></button>
            </div>
            <div className="modal-body">

              {/* Basic */}
              <div style={{fontSize:10,fontWeight:800,color:'#4338ca',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10,display:'flex',alignItems:'center',gap:5}}>
                <User size={11}/>{L('البيانات الأساسية','Basic Info')}
              </div>
              <div className="form-group">
                <label className="form-label">{L('الاسم الكامل','Full Name')} *</label>
                <input className="form-input" style={{fontSize:16}} value={form.full_name} onChange={e=>setForm(f=>({...f,full_name:e.target.value}))} autoFocus/>
              </div>
              {isAdmin&&modal==='add'&&(
                <div className="form-group">
                  <label className="form-label">{L('الفصل','Class')} *</label>
                  <select className="form-input" value={form.class_id} onChange={e=>setForm(f=>({...f,class_id:e.target.value}))}>
                    {availableClasses.map(c=><option key={c.id} value={c.id}>{lang==='ar'?c.name_ar:c.name_en}</option>)}
                  </select>
                </div>
              )}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">{L('الهاتف','Phone')}</label>
                  <input className="form-input" type="tel" dir="ltr" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/>
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">{L('تاريخ الميلاد','Birthday')}</label>
                  <input className="form-input" type="date" dir="ltr" value={form.birth_date} onChange={e=>setForm(f=>({...f,birth_date:e.target.value}))}/>
                </div>
              </div>

              {/* Address */}
              <div style={{fontSize:10,fontWeight:800,color:'#0891b2',textTransform:'uppercase',letterSpacing:'.06em',margin:'14px 0 10px',display:'flex',alignItems:'center',gap:5}}>
                <MapPin size={11}/>{L('العنوان','Address')}
              </div>
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">{L('العنوان','Address')}</label>
                <input className="form-input" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/>
              </div>

              {/* Parent */}
              <div style={{fontSize:10,fontWeight:800,color:'#16a34a',textTransform:'uppercase',letterSpacing:'.06em',margin:'14px 0 10px',display:'flex',alignItems:'center',gap:5}}>
                <Users size={11}/>{L('ولي الأمر','Parent / Guardian')}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">{L('اسم ولي الأمر','Parent Name')}</label>
                  <input className="form-input" value={form.parent_name} onChange={e=>setForm(f=>({...f,parent_name:e.target.value}))}/>
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">{L('هاتف ولي الأمر','Parent Phone')}</label>
                  <input className="form-input" type="tel" dir="ltr" value={form.parent_phone} onChange={e=>setForm(f=>({...f,parent_phone:e.target.value}))}/>
                </div>
              </div>

              <div className="form-group" style={{marginTop:14,marginBottom:0}}>
                <label className="form-label">{L('ملاحظات','Notes')}</label>
                <textarea className="form-input" style={{fontSize:13,minHeight:56}} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2}/>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModal(null)}>{L('إلغاء','Cancel')}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{minWidth:80}}>
                {saving?L('جارٍ الحفظ...','Saving...'):L('حفظ','Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div className="toast-wrap"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}
    </AppShell>
  );
}
