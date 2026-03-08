import { createClient } from '@supabase/supabase-js';
import { SessionType } from '@/types';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function isoWeek(date: Date): number {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const y = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - y.getTime()) / 86400000 + 1) / 7);
}
export function toDateStr(d: Date) { return d.toISOString().split('T')[0]; }

// ── CLASSES ───────────────────────────────────────────────────
let _classCache: any[] | null = null;
export async function getClasses() {
  if (_classCache) return _classCache;
  const { data, error } = await supabase.from('classes').select('*').order('sort_order');
  if (error) throw error;
  _classCache = data ?? [];
  return _classCache;
}

// ── STUDENTS ──────────────────────────────────────────────────
// Your students table has: id, full_name, gender, class_id, grade, class_gender, is_active
export async function getStudents(classId?: string, includeInactive = false) {
  let q = supabase.from('students').select('*').order('full_name');
  if (!includeInactive) q = q.eq('is_active', true);
  if (classId) q = q.eq('class_id', classId);
  const { data, error } = await q;
  if (error) throw error;

  const classes = await getClasses();
  const classMap = new Map(classes.map((c: any) => [c.id, c]));
  return (data ?? []).map((s: any) => ({ ...s, classes: classMap.get(s.class_id) ?? null }));
}

export async function createStudent(
  payload: { full_name: string; class_id: string; phone?: string; notes?: string },
  userId?: string
) {
  // Derive grade and class_gender from the class
  const classes = await getClasses();
  const cls = classes.find((c: any) => c.id === payload.class_id);
  const insertData: any = {
    full_name: payload.full_name,
    class_id: payload.class_id,
    grade: cls?.grade ?? 1,
    class_gender: cls?.gender ?? 'boys',
    gender: cls?.gender === 'girls' ? 'female' : 'male', // default from class
  };
  const { data, error } = await supabase.from('students').insert(insertData).select('*').single();
  if (error) throw error;
  await logActivity('CREATE', 'student', data.id, { name: payload.full_name }, userId);
  return { ...data, classes: cls ?? null };
}

export async function updateStudent(id: string, updates: Record<string, unknown>, userId?: string) {
  const { data, error } = await supabase.from('students').update(updates).eq('id', id).select('*').single();
  if (error) throw error;
  await logActivity('UPDATE', 'student', id, updates, userId);
  const classes = await getClasses();
  const classMap = new Map(classes.map((c: any) => [c.id, c]));
  return { ...data, classes: classMap.get(data.class_id) ?? null };
}

export async function setStudentActive(id: string, active: boolean, userId?: string) {
  const { error } = await supabase.from('students').update({ is_active: active }).eq('id', id);
  if (error) throw error;
  await logActivity(active ? 'RESTORE' : 'DEACTIVATE', 'student', id, {}, userId);
}

// ── ATTENDANCE ────────────────────────────────────────────────
// Your attendance table: session_type uses 'mass' | 'sunday_school' | 'tasbeha'
// has day_of_week (int) not day_type (text)
// NO unique constraint yet — we check manually and use update if exists

export async function getExistingAttendance(date: string, session: SessionType, classId: string) {
  const { data: ids } = await supabase
    .from('students').select('id').eq('class_id', classId).eq('is_active', true);
  if (!ids?.length) return [];
  const { data } = await supabase
    .from('attendance').select('student_id,is_present,id')
    .eq('attendance_date', date).eq('session_type', session)
    .in('student_id', ids.map((s: any) => s.id));
  return data ?? [];
}

export async function attendanceExists(date: string, session: SessionType, classId: string): Promise<boolean> {
  const { data: ids } = await supabase
    .from('students').select('id').eq('class_id', classId).eq('is_active', true).limit(1);
  if (!ids?.length) return false;
  const { data } = await supabase.from('attendance').select('id')
    .eq('attendance_date', date).eq('session_type', session)
    .eq('student_id', ids[0].id).limit(1);
  return (data?.length ?? 0) > 0;
}

export async function upsertAttendance(
  records: { student_id: string; session_type: SessionType; day_of_week: number;
    attendance_date: string; week_number: number; month: number; year: number; is_present: boolean }[],
  userId?: string
) {
  // Check existing records for this date+session
  if (!records.length) return;
  const date = records[0].attendance_date;
  const session = records[0].session_type;
  const studentIds = records.map(r => r.student_id);

  const { data: existing } = await supabase.from('attendance').select('id,student_id')
    .eq('attendance_date', date).eq('session_type', session)
    .in('student_id', studentIds);

  const existingMap = new Map((existing ?? []).map((e: any) => [e.student_id, e.id]));

  const toInsert: any[] = [];
  const toUpdate: { id: string; is_present: boolean }[] = [];

  for (const r of records) {
    const existingId = existingMap.get(r.student_id);
    const row = { ...r, marked_by: userId ?? 'admin' };
    if (existingId) {
      toUpdate.push({ id: existingId, is_present: r.is_present });
    } else {
      toInsert.push(row);
    }
  }

  if (toInsert.length) {
    const { error } = await supabase.from('attendance').insert(toInsert);
    if (error) throw error;
  }
  for (const u of toUpdate) {
    await supabase.from('attendance').update({ is_present: u.is_present, marked_by: userId ?? 'admin' }).eq('id', u.id);
  }

  await logActivity('ATTENDANCE', 'attendance', undefined, {
    count: records.length, date, session,
  }, userId);
}

export async function getMonthlyAttendance(month: number, year: number, classId?: string) {
  const allStudents = await getStudents(classId, true);
  if (!allStudents.length) return [];
  const studentIds = allStudents.map((s: any) => s.id);
  const stuMap = new Map(allStudents.map((s: any) => [s.id, s]));

  let q = supabase.from('attendance').select('*').eq('month', month).eq('year', year)
    .in('student_id', studentIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((a: any) => ({ ...a, students: stuMap.get(a.student_id) ?? null }));
}

// ── AUTH ──────────────────────────────────────────────────────
export async function getUserByUsername(username: string) {
  const { data, error } = await supabase
    .from('app_users')
    .select('id,username,password_hash,full_name,role,assigned_class,language,is_active')
    .eq('username', username.toLowerCase().trim())
    .eq('is_active', true)
    .single();
  if (error) return null;
  return data;
}

export async function getAllUsers() {
  const { data, error } = await supabase
    .from('app_users')
    .select('id,username,full_name,role,assigned_class,language,is_active,created_at')
    .order('role').order('full_name');
  if (error) throw error;
  return data ?? [];
}

export async function createUser(payload: {
  username: string; password_hash: string; full_name: string;
  role: string; assigned_class: string | null;
}) {
  const { data, error } = await supabase.from('app_users')
    .insert({ ...payload, username: payload.username.toLowerCase().trim() })
    .select('id,username,full_name,role,assigned_class,language,is_active').single();
  if (error) throw error;
  return data;
}

export async function updateUser(id: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase.from('app_users').update(updates).eq('id', id)
    .select('id,username,full_name,role,assigned_class,language,is_active').single();
  if (error) throw error;
  return data;
}

// ── EVENTS ────────────────────────────────────────────────────
export async function getEvents() {
  const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
export async function createEvent(payload: Record<string, unknown>, userId?: string) {
  const { data, error } = await supabase.from('events').insert({ ...payload, created_by: userId }).select().single();
  if (error) throw error;
  await logActivity('CREATE', 'event', data.id, { title: payload.title }, userId);
  return data;
}
export async function updateEvent(id: string, updates: Record<string, unknown>, userId?: string) {
  const { data, error } = await supabase.from('events').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
export async function deleteEvent(id: string, userId?: string) {
  await supabase.from('events').delete().eq('id', id);
  await logActivity('DELETE', 'event', id, {}, userId);
}

// ── DONATIONS ─────────────────────────────────────────────────
export async function getDonations(month?: number, year?: number) {
  let q = supabase.from('donations').select('*').order('donation_date', { ascending: false });
  if (month && year) {
    const from = `${year}-${String(month).padStart(2,'0')}-01`;
    const to = new Date(year, month, 0).toISOString().split('T')[0];
    q = q.gte('donation_date', from).lte('donation_date', to);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
export async function createDonation(payload: Record<string, unknown>, userId?: string) {
  const { data, error } = await supabase.from('donations')
    .insert({ ...payload, recorded_by: userId }).select().single();
  if (error) throw error;
  await logActivity('CREATE', 'donation', data.id, { donor: payload.donor_name, amount: payload.amount }, userId);
  return data;
}
export async function updateDonation(id: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase.from('donations').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
export async function deleteDonation(id: string, userId?: string) {
  await supabase.from('donations').delete().eq('id', id);
  await logActivity('DELETE', 'donation', id, {}, userId);
}

// ── ACTIVITY LOG ──────────────────────────────────────────────
export async function logActivity(
  action: string, entityType: string, entityId?: string,
  details?: Record<string, unknown>, userId?: string
) {
  try {
    await supabase.from('activity_log').insert({
      action, entity_type: entityType,
      // entity_id is UUID in your schema — skip if not a valid UUID
      details, performed_by: userId ?? 'admin',
    });
  } catch { /* non-critical */ }
}

export async function getActivityLog(limit = 40) {
  const { data } = await supabase.from('activity_log')
    .select('*').order('created_at', { ascending: false }).limit(limit);
  return data ?? [];
}

// ── CLASS LABEL HELPER ────────────────────────────────────────
// Maps any class_id format to proper Arabic/English label
// Handles: g6-boys, grade6_boys, g6_boys, "6_boys", "بنات4", etc.
const GRADE_WORDS_AR: Record<number,string> = { 1:'الأول',2:'الثاني',3:'الثالث',4:'الرابع',5:'الخامس',6:'السادس' };
const GRADE_WORDS_EN: Record<number,string> = { 1:'First',2:'Second',3:'Third',4:'Fourth',5:'Fifth',6:'Sixth' };

export function parseClassId(raw: string): { grade: number; gender: 'boys'|'girls' } | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[\s_]/g,'-');
  // patterns: g6-boys, grade6-boys, 6-boys, g6boys
  const m = s.match(/(?:grade?)?([1-6])[-_]?(boys|girls|boy|girl|بنات|أولاد)/);
  if (m) {
    const grade = parseInt(m[1]);
    const gender = m[2].startsWith('b') || m[2]==='أولاد' ? 'boys' : 'girls';
    return { grade, gender };
  }
  return null;
}

export function classLabel(classId: string, lang: 'ar'|'en', classes: any[]): string {
  // First try from loaded classes list (most accurate)
  if (classes?.length) {
    const found = classes.find((c:any) => c.id === classId);
    if (found) return lang === 'ar' ? found.name_ar : found.name_en;
  }
  // Fallback: parse the ID
  const parsed = parseClassId(classId);
  if (parsed) {
    const { grade, gender } = parsed;
    if (lang === 'ar') return `الصف ${GRADE_WORDS_AR[grade]} ${gender==='boys'?'أولاد':'بنات'}`;
    return `Grade ${grade} ${grade===1?'st':grade===2?'nd':grade===3?'rd':'th'} ${gender==='boys'?'Boys':'Girls'}`;
  }
  return classId; // last resort
}

// ── NOTIFICATIONS ─────────────────────────────────────────────
export async function createNotification(opts: {
  title_ar: string; title_en: string;
  body_ar: string;  body_en: string;
  type: 'event'|'donation'|'servant'|'trip'|'media'|'general';
  link?: string; created_by?: string;
}) {
  try {
    await supabase.from('notifications').insert({
      ...opts, is_read: false,
    });
  } catch { /* non-critical */ }
}

export async function getNotifications() {
  const { data } = await supabase.from('notifications')
    .select('*').order('created_at', { ascending: false }).limit(30);
  return data ?? [];
}

export async function markNotificationRead(id: string) {
  await supabase.from('notifications').update({ is_read: true }).eq('id', id);
}

export async function markAllNotificationsRead() {
  await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
}
