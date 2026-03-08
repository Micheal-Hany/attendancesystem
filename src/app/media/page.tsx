'use client';
import { useState, useEffect, useRef } from 'react';
import { Plus, X, Upload, Image as ImgIcon, Trash2, ChevronLeft, ChevronRight, FolderOpen, Camera } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/LangContext';
import { supabase, createNotification } from '@/lib/supabase';

interface Album { id: string; name: string; description?: string; cover_url?: string; created_at: string; photo_count?: number; }
interface Photo { id: string; album_id: string; url: string; caption?: string; created_at: string; }

const BUCKET = 'church-media';
const PRESET_ALBUMS = [
  { ar:'رحلة',          en:'Trip',           icon:'🚌' },
  { ar:'يوم الخدام',   en:'Servants Day',   icon:'🙏' },
  { ar:'أحداث الكنيسة',en:'Church Events',  icon:'⛪' },
  { ar:'تكريم',         en:'Appreciation',   icon:'🏆' },
  { ar:'معسكر',         en:'Camp',           icon:'⛺' },
  { ar:'أخرى',          en:'Other',          icon:'📷' },
];

export default function MediaPage() {
  const { user, isAdmin } = useAuth();
  const { lang, isRTL } = useLang();
  const L = (ar: string, en: string) => lang === 'ar' ? ar : en;

  const [view,        setView]        = useState<'albums'|'photos'>('albums');
  const [albums,      setAlbums]      = useState<Album[]>([]);
  const [photos,      setPhotos]      = useState<Photo[]>([]);
  const [activeAlbum, setActiveAlbum] = useState<Album|null>(null);
  const [loading,     setLoading]     = useState(true);
  const [uploading,   setUploading]   = useState(false);
  const [progress,    setProgress]    = useState(0); // 0-100
  const [albumModal,  setAlbumModal]  = useState(false);
  const [albumForm,   setAlbumForm]   = useState({ name:'', description:'' });
  const [lightbox,    setLightbox]    = useState<number|null>(null);
  const [toast,       setToast]       = useState<{type:string;msg:string}|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function showToast(type: string, msg: string) { setToast({type,msg}); setTimeout(()=>setToast(null), 3000); }

  useEffect(() => { loadAlbums(); }, []);

  async function loadAlbums() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('media_albums').select('*').order('created_at', { ascending:false });
      if (error) { setAlbums([]); return; }
      const withCount = await Promise.all((data??[]).map(async (a: Album) => {
        const { count } = await supabase.from('media_photos').select('id', { count:'exact', head:true }).eq('album_id', a.id);
        // Get first photo as cover
        const { data: firstPhoto } = await supabase.from('media_photos').select('url').eq('album_id', a.id).order('created_at').limit(1).single();
        return { ...a, photo_count: count ?? 0, cover_url: firstPhoto?.url ?? null };
      }));
      setAlbums(withCount);
    } catch { setAlbums([]); }
    finally { setLoading(false); }
  }

  async function loadPhotos(albumId: string) {
    const { data } = await supabase.from('media_photos').select('*').eq('album_id', albumId).order('created_at', { ascending:false });
    setPhotos(data ?? []);
  }

  async function openAlbum(album: Album) {
    setActiveAlbum(album);
    setView('photos');
    await loadPhotos(album.id);
  }

  async function createAlbum() {
    if (!albumForm.name.trim()) { showToast('error', L('مطلوب','Required')); return; }
    try {
      const { data, error } = await supabase.from('media_albums').insert({
        name: albumForm.name.trim(),
        description: albumForm.description || null,
        created_by: user?.id,
      }).select().single();
      if (error) throw error;
      setAlbumModal(false);
      setAlbumForm({ name:'', description:'' });
      showToast('success', L('تم إنشاء الألبوم','Album created'));
      // Notify all servants
      await createNotification({
        title_ar: 'ألبوم جديد', title_en: 'New Album',
        body_ar: `تم إضافة ألبوم جديد: ${albumForm.name}`,
        body_en: `New album added: ${albumForm.name}`,
        type: 'media', link: '/media', created_by: user?.id,
      });
      loadAlbums();
    } catch { showToast('error', L('حدث خطأ','Error')); }
  }

  async function deleteAlbum(album: Album, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(L('حذف الألبوم وكل صوره؟','Delete album and all photos?'))) return;
    try {
      const { data: ph } = await supabase.from('media_photos').select('url').eq('album_id', album.id);
      if (ph?.length) {
        // Extract storage path from full URL
        const paths = ph.map((p:any) => {
          const url: string = p.url;
          const marker = `/object/public/${BUCKET}/`;
          const idx = url.indexOf(marker);
          return idx >= 0 ? url.slice(idx + marker.length) : null;
        }).filter(Boolean) as string[];
        if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
      }
      await supabase.from('media_photos').delete().eq('album_id', album.id);
      await supabase.from('media_albums').delete().eq('id', album.id);
      loadAlbums();
    } catch { showToast('error', L('حدث خطأ','Error')); }
  }

  async function uploadPhotos(files: FileList) {
    if (!activeAlbum || !files.length) return;
    setUploading(true);
    setProgress(0);
    let uploaded = 0;
    const total = Array.from(files).filter(f => f.type.startsWith('image/')).length;
    if (total === 0) { setUploading(false); return; }

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const storagePath = `${activeAlbum.id}/${safeName}`;

        const { data: upData, error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, file, { cacheControl: '3600', upsert: false });

        if (upErr) {
          console.error('Upload error:', upErr.message);
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
        const publicUrl = urlData?.publicUrl;
        if (!publicUrl) continue;

        const { error: dbErr } = await supabase.from('media_photos').insert({
          album_id: activeAlbum.id,
          url: publicUrl,
          uploaded_by: user?.id,
        });

        if (!dbErr) {
          uploaded++;
          setProgress(Math.round(uploaded / total * 100));
        }
      } catch (e) { console.error('Photo error:', e); }
    }

    if (uploaded > 0) {
      showToast('success', L(`تم رفع ${uploaded} صورة`, `${uploaded} photo(s) uploaded`));
      await createNotification({
        title_ar: 'صور جديدة', title_en: 'New Photos',
        body_ar: `تم رفع ${uploaded} صورة في ألبوم "${activeAlbum.name}"`,
        body_en: `${uploaded} photo(s) uploaded to "${activeAlbum.name}"`,
        type: 'media', link: '/media', created_by: user?.id,
      });
      await loadPhotos(activeAlbum.id);
      await loadAlbums();
    } else {
      showToast('error', L(
        'فشل رفع الصور. تأكد من إنشاء bucket باسم "church-media" في Supabase Storage وأنه Public',
        'Upload failed. Make sure the "church-media" bucket exists in Supabase Storage and is set to Public'
      ));
    }
    setUploading(false);
    setProgress(0);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function deletePhoto(photo: Photo, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(L('حذف الصورة؟','Delete this photo?'))) return;
    try {
      const url: string = photo.url;
      const marker = `/object/public/${BUCKET}/`;
      const idx = url.indexOf(marker);
      if (idx >= 0) {
        const path = url.slice(idx + marker.length);
        await supabase.storage.from(BUCKET).remove([path]);
      }
      await supabase.from('media_photos').delete().eq('id', photo.id);
      setPhotos(p => p.filter(ph => ph.id !== photo.id));
      if (lightbox !== null) setLightbox(null);
      loadAlbums();
    } catch { showToast('error', L('حدث خطأ','Error')); }
  }

  // ── Lightbox ──────────────────────────────────────────────
  function Lightbox() {
    if (lightbox === null) return null;
    const photo = photos[lightbox];
    const prev = () => setLightbox(i => i !== null ? Math.max(0, i - 1) : null);
    const next = () => setLightbox(i => i !== null ? Math.min(photos.length - 1, i + 1) : null);
    return (
      <div onClick={() => setLightbox(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.93)',zIndex:2000,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
        <button onClick={() => setLightbox(null)} style={{position:'absolute',top:12,insetInlineEnd:12,background:'rgba(255,255,255,.15)',border:'none',color:'white',borderRadius:'50%',width:40,height:40,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>✕</button>
        <button onClick={e=>{e.stopPropagation();prev();}} style={{position:'absolute',insetInlineStart:8,top:'50%',transform:'translateY(-50%)',background:'rgba(255,255,255,.15)',border:'none',color:'white',borderRadius:'50%',width:44,height:44,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <ChevronLeft size={22} style={{transform:isRTL?'rotate(180deg)':'none'}}/>
        </button>
        <img src={photo.url} alt="" onClick={e=>e.stopPropagation()} style={{maxHeight:'78dvh',maxWidth:'90vw',objectFit:'contain',borderRadius:10,boxShadow:'0 20px 60px rgba(0,0,0,.5)'}}/>
        <div style={{color:'rgba(255,255,255,.6)',fontSize:13,marginTop:12}}>{lightbox+1} / {photos.length}</div>
        {isAdmin && (
          <button onClick={e=>{e.stopPropagation();deletePhoto(photo,e);}} style={{marginTop:10,background:'#dc2626',border:'none',color:'white',borderRadius:8,padding:'7px 18px',cursor:'pointer',display:'flex',alignItems:'center',gap:6,fontSize:13,fontFamily:'inherit',fontWeight:600}}>
            <Trash2 size={13}/>{L('حذف','Delete')}
          </button>
        )}
        <button onClick={e=>{e.stopPropagation();next();}} style={{position:'absolute',insetInlineEnd:8,top:'50%',transform:'translateY(-50%)',background:'rgba(255,255,255,.15)',border:'none',color:'white',borderRadius:'50%',width:44,height:44,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <ChevronRight size={22} style={{transform:isRTL?'rotate(180deg)':'none'}}/>
        </button>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="stack" style={{gap:12}}>

        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            {view==='photos' && (
              <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>{setView('albums');setActiveAlbum(null);}}>
                <ChevronLeft size={16} style={{transform:isRTL?'rotate(180deg)':'none'}}/>
              </button>
            )}
            <div>
              <h2 style={{fontSize:18,fontWeight:800}}>{view==='albums'?L('الألبومات','Albums'):activeAlbum?.name}</h2>
              <p style={{fontSize:12,color:'#64748b'}}>
                {view==='albums'?`${albums.length} ${L('ألبوم','albums')}`:`${photos.length} ${L('صورة','photos')}`}
              </p>
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            {view==='albums' && isAdmin && (
              <button className="btn btn-primary" onClick={()=>setAlbumModal(true)}><Plus size={14}/>{L('ألبوم جديد','New Album')}</button>
            )}
            {view==='photos' && isAdmin && (
              <>
                <input ref={fileRef} type="file" accept="image/*" multiple style={{display:'none'}} onChange={e=>e.target.files&&uploadPhotos(e.target.files)}/>
                <button className="btn btn-primary" onClick={()=>fileRef.current?.click()} disabled={uploading}>
                  <Upload size={14}/>{uploading?`${progress}%`:L('رفع صور','Upload')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Upload progress bar */}
        {uploading && (
          <div style={{background:'#eef2ff',borderRadius:10,padding:'10px 14px',display:'flex',alignItems:'center',gap:10}}>
            <div style={{flex:1}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:5,fontSize:12,fontWeight:600,color:'#4338ca'}}>
                <span>{L('جارٍ رفع الصور...','Uploading photos...')}</span>
                <span>{progress}%</span>
              </div>
              <div className="progress"><div className="progress-bar" style={{width:`${progress}%`,background:'#4338ca'}}/></div>
            </div>
          </div>
        )}

        {/* ── ALBUMS VIEW ── */}
        {view==='albums' && (
          loading ? (
            <div className="card" style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{L('جارٍ التحميل...','Loading...')}</div>
          ) : albums.length===0 ? (
            <div className="card" style={{padding:48,textAlign:'center',color:'#94a3b8'}}>
              <FolderOpen size={40} style={{margin:'0 auto 12px',opacity:.3}}/>
              <p style={{fontSize:14,fontWeight:600,marginBottom:4}}>{L('لا توجد ألبومات','No albums yet')}</p>
              {isAdmin && <button className="btn btn-primary" onClick={()=>setAlbumModal(true)} style={{marginTop:12}}><Plus size={14}/>{L('إنشاء ألبوم','Create Album')}</button>}
            </div>
          ) : (
            <div className="media-grid">
              {albums.map(album => (
                <div key={album.id} onClick={()=>openAlbum(album)} style={{borderRadius:12,overflow:'hidden',cursor:'pointer',position:'relative',border:'1px solid #e2e8f0',boxShadow:'0 1px 3px rgba(0,0,0,.08)'}}>
                  <div style={{aspectRatio:'1',position:'relative',background:'linear-gradient(135deg,#3730a3,#7c3aed)'}}>
                    {album.cover_url
                      ? <img src={album.cover_url} alt={album.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                      : <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',fontSize:40}}>{PRESET_ALBUMS.find(p=>p.ar===album.name||p.en===album.name)?.icon??'📁'}</div>
                    }
                    <div style={{position:'absolute',inset:0,background:'linear-gradient(to top,rgba(0,0,0,.65) 0%,transparent 55%)'}}/>
                    <div style={{position:'absolute',top:8,insetInlineEnd:8,background:'rgba(0,0,0,.55)',color:'white',borderRadius:99,padding:'2px 8px',fontSize:11,fontWeight:700,display:'flex',alignItems:'center',gap:3}}>
                      <Camera size={10}/>{album.photo_count??0}
                    </div>
                    {isAdmin && (
                      <button onClick={e=>deleteAlbum(album,e)} style={{position:'absolute',top:8,insetInlineStart:8,background:'rgba(220,38,38,.8)',border:'none',color:'white',borderRadius:'50%',width:28,height:28,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <Trash2 size={12}/>
                      </button>
                    )}
                    <div style={{position:'absolute',bottom:8,insetInlineStart:10,insetInlineEnd:10}}>
                      <div style={{fontSize:13,fontWeight:700,color:'white',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{album.name}</div>
                      {album.description && <div style={{fontSize:10,color:'rgba(255,255,255,.7)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{album.description}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── PHOTOS VIEW ── */}
        {view==='photos' && (
          photos.length===0 && !uploading ? (
            <div className="card" style={{padding:48,textAlign:'center',color:'#94a3b8'}}>
              <ImgIcon size={40} style={{margin:'0 auto 12px',opacity:.3}}/>
              <p style={{fontSize:14,fontWeight:600,marginBottom:4}}>{L('لا توجد صور','No photos yet')}</p>
              {isAdmin && <button className="btn btn-primary" onClick={()=>fileRef.current?.click()} style={{marginTop:12}}><Upload size={14}/>{L('رفع صور','Upload Photos')}</button>}
            </div>
          ) : (
            <div className="media-grid">
              {photos.map((photo,idx) => (
                <div key={photo.id} className="media-card" onClick={()=>setLightbox(idx)}>
                  <img src={photo.url} alt="" loading="lazy"/>
                  {isAdmin && (
                    <button onClick={e=>{e.stopPropagation();deletePhoto(photo,e);}} style={{position:'absolute',top:6,insetInlineEnd:6,background:'rgba(220,38,38,.8)',border:'none',color:'white',borderRadius:'50%',width:26,height:26,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',opacity:0}} className="photo-delete-btn">
                      <Trash2 size={11}/>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Album modal */}
      {albumModal && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setAlbumModal(false);}}>
          <div className="modal">
            <div className="modal-header">
              <h3 style={{fontSize:16,fontWeight:800}}>{L('ألبوم جديد','New Album')}</h3>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>setAlbumModal(false)}><X size={17}/></button>
            </div>
            <div className="modal-body">
              <div style={{marginBottom:14}}>
                <label className="form-label">{L('اختر نوع سريع','Quick Presets')}</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {PRESET_ALBUMS.map(p=>{
                    const name = lang==='ar'?p.ar:p.en;
                    const sel  = albumForm.name===name;
                    return (
                      <button key={p.ar} onClick={()=>setAlbumForm(f=>({...f,name:name}))} style={{padding:'6px 12px',borderRadius:99,border:'1.5px solid',fontSize:13,cursor:'pointer',fontFamily:'inherit',fontWeight:600,borderColor:sel?'#4338ca':'#e2e8f0',background:sel?'#eef2ff':'white',color:sel?'#4338ca':'#475569'}}>
                        {p.icon} {name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{L('اسم الألبوم','Album Name')} *</label>
                <input className="form-input" style={{fontSize:16}} value={albumForm.name} onChange={e=>setAlbumForm(f=>({...f,name:e.target.value}))} autoFocus/>
              </div>
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">{L('وصف','Description')} <span style={{color:'#94a3b8',fontWeight:400}}>({L('اختياري','optional')})</span></label>
                <input className="form-input" style={{fontSize:14}} value={albumForm.description} onChange={e=>setAlbumForm(f=>({...f,description:e.target.value}))}/>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setAlbumModal(false)}>{L('إلغاء','Cancel')}</button>
              <button className="btn btn-primary" onClick={createAlbum}>{L('إنشاء','Create')}</button>
            </div>
          </div>
        </div>
      )}

      <Lightbox/>
      {toast&&<div className="toast-wrap"><div className={`toast toast-${toast.type==='error'?'error':'success'}`}>{toast.msg}</div></div>}

      <style>{`.photo-delete-btn { opacity: 0 !important; } .media-card:hover .photo-delete-btn { opacity: 1 !important; }`}</style>
    </AppShell>
  );
}
