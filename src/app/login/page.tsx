'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/LangContext';
import { getUserByUsername } from '@/lib/supabase';
import { Cross, Globe, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { user, login } = useAuth();
  const { t, lang, setLang } = useLang();
  const router = useRouter();
  const [form, setForm] = useState({ username: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (user) router.replace('/dashboard'); }, [user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.username.trim() || !form.password.trim()) {
      setError(t('invalid_credentials')); return;
    }
    setLoading(true); setError('');
    try {
      // Get user record
      const dbUser = await getUserByUsername(form.username);
      if (!dbUser) { setError(t('invalid_credentials')); return; }

      // Compare plaintext password
      if (form.password !== dbUser.password_hash) { setError(t('invalid_credentials')); return; }

      // Strip password before storing in state
      const { password_hash: _, ...safeUser } = dbUser;
      login(safeUser as any);
      router.replace('/dashboard');
    } catch {
      setError(t('invalid_credentials'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(145deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px', position: 'relative',
    }}>
      {/* Decorative blobs */}
      <div style={{ position:'absolute', top:'8%', insetInlineEnd:'6%', width:180, height:180, borderRadius:'50%', background:'rgba(255,255,255,.05)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:'12%', insetInlineStart:'4%', width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,.07)', pointerEvents:'none' }} />

      {/* Language toggle */}
      <button
        onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
        style={{
          position:'absolute', top:16, insetInlineEnd:16,
          background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.2)',
          borderRadius:8, color:'white', cursor:'pointer', padding:'6px 14px',
          fontSize:13, fontWeight:700, backdropFilter:'blur(8px)',
          display:'flex', alignItems:'center', gap:5,
        }}
      >
        <Globe size={14} />
        {lang === 'ar' ? 'English' : 'العربية'}
      </button>

      <div style={{ width:'100%', maxWidth:400, animation:'fadeIn .4s ease' }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{
            width:64, height:64, borderRadius:20, margin:'0 auto 14px',
            background:'rgba(255,255,255,.15)', backdropFilter:'blur(10px)',
            border:'1px solid rgba(255,255,255,.25)',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 8px 32px rgba(0,0,0,.2)',
          }}>
            <Cross size={28} color="white" />
          </div>
          <h1 style={{ fontSize:24, fontWeight:800, color:'white', marginBottom:4 }}>{t('app_name')}</h1>
          <p style={{ color:'rgba(255,255,255,.6)', fontSize:13 }}>{t('app_subtitle')}</p>
        </div>

        {/* Card */}
        <div style={{ background:'rgba(255,255,255,.97)', borderRadius:20, padding:'28px 24px', boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
          <h2 style={{ fontSize:19, fontWeight:800, marginBottom:4 }}>{t('welcome_back')}</h2>
          <p style={{ fontSize:13, color:'#64748b', marginBottom:22 }}>{t('login_subtitle')}</p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">{t('username')}</label>
              <input
                className="form-input"
                type="text"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                style={{ fontSize:16 /* prevent iOS zoom */ }}
                dir="ltr"
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: 18 }}>
              <label className="form-label">{t('password')}</label>
              <div style={{ position:'relative' }}>
                <input
                  className="form-input"
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  autoComplete="current-password"
                  style={{ paddingInlineEnd:42, fontSize:16 }}
                  dir="ltr"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{ position:'absolute', insetInlineEnd:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding:4 }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:9, padding:'10px 12px', fontSize:13, color:'#dc2626', marginBottom:14 }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width:'100%', padding:12, fontSize:15 }} disabled={loading}>
              {loading ? t('logging_in') : t('login')}
            </button>
          </form>
        </div>

        <p style={{ textAlign:'center', color:'rgba(255,255,255,.3)', fontSize:11, marginTop:16 }}>
          {t('app_name')} © {new Date().getFullYear()}
        </p>
      </div>

      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
