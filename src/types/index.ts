export type UserRole = 'admin' | 'servant';
export type Language = 'ar' | 'en';
export type DayType = 'friday' | 'sunday';
export type SessionType = 'mass' | 'sunday_school' | 'tasbeha';

export interface AppUser {
  id: string; username: string; full_name: string; role: UserRole;
  assigned_class: string | null; language: Language; is_active: boolean; created_at: string;
}
export interface Class {
  id: string; name_ar: string; name_en: string; grade: number; gender: 'boys'|'girls'; sort_order: number;
}
export interface Student {
  id: string; full_name: string; class_id: string; grade: number;
  gender: string; class_gender: string; is_active: boolean;
  phone?: string; address?: string; notes?: string;
  birth_date?: string; parent_name?: string; parent_phone?: string;
  created_at: string; classes?: Class;
}
export interface Attendance {
  id: string; student_id: string; session_type: SessionType;
  day_of_week: number; attendance_date: string; week_number: number;
  month: number; year: number; is_present: boolean;
  marked_by?: string; created_at: string; students?: Student;
}
export interface Visitation {
  id: string; student_id: string; visited_by: string;
  visit_date: string; notes?: string; was_home: boolean; created_at: string;
}
export interface SessionCfg {
  type: SessionType; dayOfWeek: number; ar: string; en: string; color: string; bg: string; border: string;
}
export const SESSIONS: SessionCfg[] = [
  { type:'mass',          dayOfWeek:5, ar:'قداس',        en:'Liturgy',       color:'#7c3aed', bg:'#ede9fe', border:'#c4b5fd' },
  { type:'sunday_school', dayOfWeek:5, ar:'مدارس الاحد', en:'Sunday School', color:'#0891b2', bg:'#e0f2fe', border:'#bae6fd' },
  { type:'tasbeha',       dayOfWeek:0, ar:'تسبحه',        en:'Tasbeha',       color:'#b45309', bg:'#fef3c7', border:'#fde68a' },
];
export const FRIDAY_SESSIONS: SessionType[] = ['mass','sunday_school'];
export const SUNDAY_SESSIONS: SessionType[] = ['tasbeha'];
