'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Users, TrendingUp, AlertTriangle, ChevronRight, Calendar, Heart } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/LangContext';
import { supabase, getEvents, getDonations } from '@/lib/supabase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const { t, lang, monthName, isRTL } = useLang();
  const router = useRouter();
  const now = new Date();
  const month = now.getMonth()+1; const year = now.getFullYear();
  const hour = now.getHours();
  const greeting = hour<12?t('good_morning'):hour<17?t('good_afternoon'):t('good_evening');

  const [stats, setStats] = useState({activeStudents:0,avgPct:0,atRisk:0,perfect:0});
  const [trend, setTrend] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [monthDonations, setMonthDonations] = useState({total:0,count:0});
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    setLoading(true);
    try {
      const scopeClass = isAdmin ? undefined : (user?.assigned_class??undefined);
      let stuQ = supabase.from('students').select('id,class_id').eq('is_active',true);
      if (scopeClass) stuQ = stuQ.eq('class_id', scopeClass);
      const {data:students} = await stuQ; const studs = students??[];

      let attQ = supabase.from('attendance').select('student_id,is_present,week_number').eq('month',month).eq('year',year);
      if (scopeClass && studs.length) attQ = attQ.in('student_id', studs.map((s:any)=>s.id));
      const {data:att} = await attQ; const allAtt = att??[];

      const map = new Map<string,{p:number;t:number}>();
      allAtt.forEach((a:any)=>{const e=map.get(a.student_id)??{p:0,t:0};e.t++;if(a.is_present)e.p++;map.set(a.student_id,e);});
      const vals=[...map.values()];
      const avgPct = vals.length?Math.round(vals.reduce((s,v)=>s+v.p/v.t,0)/vals.length*100):0;

      setStats({ activeStudents:studs.length, avgPct, atRisk:vals.filter(v=>v.t>=2&&v.p/v.t<0.5).length, perfect:vals.filter(v=>v.t>=2&&v.p===v.t).length });

      const weekMap = new Map<number,number>();
      allAtt.filter((a:any)=>a.is_present).forEach((a:any)=>weekMap.set(a.week_number,(weekMap.get(a.week_number)??0)+1));
      setTrend([...weekMap.entries()].sort((a,b)=>a[0]-b[0]).slice(-5).map(([w,c])=>({label:`W${w}`,count:c})));

      const {data:logData} = await supabase.from('activity_log').select('action,entity_type,details,created_at').order('created_at',{ascending:false}).limit(5);
      setLogs((logData??[]).map((l:any)=>({label:`${l.action} ${l.entity_type}${l.details?.name?' — '+l.details.name:''}`,time:new Date(l.created_at).toLocaleDateString(isRTL?'ar-EG':'en-GB')})));

      if (isAdmin) {
        const evts = await getEvents();
        const todayStr = now.toISOString().split('T')[0];
        setUpcomingEvents(evts.filter((e:any)=>e.event_date>=todayStr).slice(0,3));
        const dons = await getDonations(month, year);
        const total = dons.reduce((s:number,d:any)=>s+(d.currency==='EGP'?Number(d.amount):0),0);
        setMonthDonations({total, count:dons.length});
      }
    } finally { setLoading(false); }
  }

  const statCards = [
    {key:'s',label:t('active_students'),value:stats.activeStudents,color:'stat-indigo',href:'/students'},
    {key:'a',label:t('avg_attendance'),  value:`${stats.avgPct}%`,  color:stats.avgPct>=75?'stat-green':stats.avgPct>=50?'stat-amber':'stat-red',href:'/reports'},
    {key:'r',label:t('at_risk_students'),value:stats.atRisk,        color:'stat-red',  href:'/analytics'},
    {key:'p',label:t('perfect_attendance'),value:stats.perfect,     color:'stat-green',href:'/analytics'},
  ];

  return (
    <AppShell>
      <div className="stack" style={{gap:14}}>
        {/* Banner */}
        <div style={{background:'linear-gradient(135deg,#3730a3 0%,#7c3aed 100%)',borderRadius:14,padding:'18px 20px',color:'white',position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',insetInlineEnd:-20,top:-20,width:120,height:120,borderRadius:'50%',background:'rgba(255,255,255,.07)'}}/>
          <h2 style={{fontSize:17,fontWeight:800,marginBottom:2}}>{greeting}، {user?.full_name} 👋</h2>
          <p style={{opacity:.7,fontSize:12}}>{monthName(month)} {year} · {now.toLocaleDateString(isRTL?'ar-EG':'en-GB',{weekday:'long'})}</p>
          {!isAdmin && user?.assigned_class && (
            <div style={{marginTop:10,background:'rgba(255,255,255,.15)',borderRadius:8,padding:'5px 12px',display:'inline-block',fontSize:12,fontWeight:700}}>
              {t('your_class')}: {user.assigned_class}
            </div>
          )}
          {stats.atRisk>0 && (
            <button onClick={()=>router.push('/analytics')} style={{marginTop:10,background:'rgba(255,255,255,.18)',border:'none',borderRadius:8,padding:'7px 12px',color:'white',cursor:'pointer',display:'flex',alignItems:'center',gap:6,fontSize:12,fontWeight:700}}>
              <AlertTriangle size={13}/>{stats.atRisk} {t('at_risk')}
              <ChevronRight size={13} style={{transform:isRTL?'rotate(180deg)':'none'}}/>
            </button>
          )}
        </div>

        {/* Stat cards */}
        <div className="grid-4">
          {statCards.map(c=>(
            <div key={c.key} className={`card stat-card ${c.color}`} onClick={()=>router.push(c.href)} style={{cursor:'pointer'}}>
              <p style={{fontSize:11,color:'#64748b',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',marginBottom:6}}>{c.label}</p>
              <p style={{fontSize:26,fontWeight:800,lineHeight:1}}>{loading?'—':c.value}</p>
              <p style={{fontSize:11,color:'#94a3b8',marginTop:4}}>{t('this_month')}</p>
            </div>
          ))}
        </div>

        {/* Admin extra cards */}
        {isAdmin && (
          <div className="grid-2">
            <div className="card stat-card stat-amber" onClick={()=>router.push('/donations')} style={{cursor:'pointer'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div>
                  <p style={{fontSize:11,color:'#64748b',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',marginBottom:6}}>{t('total_donations')} — {monthName(month)}</p>
                  <p style={{fontSize:24,fontWeight:800,lineHeight:1,color:'#16a34a'}}>{loading?'—':monthDonations.total.toLocaleString()} <span style={{fontSize:13}}>EGP</span></p>
                  <p style={{fontSize:11,color:'#94a3b8',marginTop:4}}>{monthDonations.count} {lang==='ar'?'تبرع':'donations'}</p>
                </div>
                <Heart size={24} color="#16a34a" style={{opacity:.4}}/>
              </div>
            </div>
            <div className="card stat-card stat-indigo" onClick={()=>router.push('/events')} style={{cursor:'pointer'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div>
                  <p style={{fontSize:11,color:'#64748b',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',marginBottom:6}}>{lang==='ar'?'الفعاليات القادمة':'Upcoming Events'}</p>
                  <p style={{fontSize:24,fontWeight:800,lineHeight:1}}>{loading?'—':upcomingEvents.length}</p>
                  <p style={{fontSize:11,color:'#94a3b8',marginTop:4}}>{lang==='ar'?'فعالية قادمة':'events upcoming'}</p>
                </div>
                <Calendar size={24} color="#4338ca" style={{opacity:.4}}/>
              </div>
            </div>
          </div>
        )}

        {/* Charts + quick actions */}
        <div className="grid-2">
          <div className="card" style={{padding:16}}>
            <h3 style={{fontSize:14,fontWeight:800,marginBottom:12}}>{t('months_trend')}</h3>
            {loading||trend.length===0 ? (
              <div style={{textAlign:'center',padding:'30px 0',color:'#94a3b8',fontSize:13}}>{loading?t('loading'):t('no_data')}</div>
            ) : (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={trend} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                  <XAxis dataKey="label" tick={{fontSize:10}}/>
                  <YAxis tick={{fontSize:10}}/>
                  <Tooltip contentStyle={{borderRadius:8,fontSize:12}}/>
                  <Bar dataKey="count" name={t('present')} fill="#4f46e5" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card" style={{padding:16}}>
            <h3 style={{fontSize:14,fontWeight:800,marginBottom:12}}>{t('quick_actions')}</h3>
            <div className="stack" style={{gap:7}}>
              {[
                {label:t('take_attendance'),href:'/attendance',color:'#4338ca'},
                {label:t('add_student'),    href:'/students',  color:'#0891b2'},
                {label:t('monthly_report'), href:'/reports',   color:'#15803d'},
                ...(isAdmin?[
                  {label:t('add_event'),    href:'/events',    color:'#7c3aed'},
                  {label:t('add_donation'), href:'/donations', color:'#16a34a'},
                ]:[]),
              ].map(a=>(
                <button key={a.href} onClick={()=>router.push(a.href)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 12px',borderRadius:9,border:'1.5px solid #e2e8f0',background:'white',cursor:'pointer',width:'100%',fontFamily:'inherit',transition:'border-color .15s'}}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.borderColor=a.color}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.borderColor='#e2e8f0'}>
                  <span style={{fontSize:13,fontWeight:600}}>{a.label}</span>
                  <ChevronRight size={14} color="#94a3b8" style={{transform:isRTL?'rotate(180deg)':'none'}}/>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Upcoming events (admin) + Activity */}
        <div className="grid-2">
          {isAdmin && upcomingEvents.length>0 && (
            <div className="card" style={{padding:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <h3 style={{fontSize:14,fontWeight:800}}>{lang==='ar'?'الفعاليات القادمة':'Upcoming Events'}</h3>
                <button onClick={()=>router.push('/events')} style={{background:'none',border:'none',color:'#4338ca',cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>
                  {lang==='ar'?'الكل':'All'}
                </button>
              </div>
              <div className="stack" style={{gap:8}}>
                {upcomingEvents.map(ev=>(
                  <div key={ev.id} style={{display:'flex',gap:10,alignItems:'center',padding:'8px 0',borderBottom:'1px solid #f1f5f9'}}>
                    <div style={{width:36,height:36,borderRadius:8,background:'#eef2ff',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <span style={{fontSize:14,fontWeight:800,color:'#4338ca',lineHeight:1}}>{new Date(ev.event_date+'T12:00:00').getDate()}</span>
                      <span style={{fontSize:9,color:'#94a3b8'}}>{monthName(new Date(ev.event_date+'T12:00:00').getMonth()+1).slice(0,3)}</span>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600}} className="truncate">{ev.title}</div>
                      {ev.location && <div style={{fontSize:11,color:'#94a3b8'}} className="truncate">{ev.location}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card" style={{padding:16}}>
            <h3 style={{fontSize:14,fontWeight:800,marginBottom:12}}>{t('recent_activity')}</h3>
            {logs.length===0 ? (
              <div style={{textAlign:'center',padding:'30px 0',color:'#94a3b8',fontSize:13}}>{t('no_activity')}</div>
            ) : (
              logs.map((log,i)=>(
                <div key={i} style={{display:'flex',gap:8,padding:'8px 0',borderBottom:i<logs.length-1?'1px solid #f1f5f9':'none'}}>
                  <div style={{width:7,height:7,borderRadius:'50%',background:'#4f46e5',flexShrink:0,marginTop:4}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:12,fontWeight:500,color:'#374151'}} className="truncate">{log.label}</p>
                    <p style={{fontSize:10,color:'#94a3b8'}}>{log.time}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
