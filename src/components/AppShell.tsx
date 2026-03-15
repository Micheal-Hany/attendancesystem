"use client";
import { useState, useEffect, useRef, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  Globe,
  Cross,
  AlertTriangle,
  ChevronRight,
  Calendar,
  Heart,
  Image as ImageIcon,
  X,
  Bus,
  Bell,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useLang } from "@/lib/LangContext";
import {
  supabase,
  getNotifications,
  markAllNotificationsRead,
} from "@/lib/supabase";

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, isAdmin, logout, loading } = useAuth();
  const { t, lang, setLang, isRTL } = useLang();
  const router = useRouter();
  const path = usePathname();
  const [sideOpen, setSideOpen] = useState(false);
  const [atRisk, setAtRisk] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  // Close drawer on route change
  useEffect(() => {
    setSideOpen(false);
    setNotifOpen(false);
  }, [path]);

   useEffect(() => {
    if (!user) return;
    getNotifications().then(setNotifications);
    // Poll every 60s
    const iv = setInterval(
      () => getNotifications().then(setNotifications),
      60000,
    );
    return () => clearInterval(iv);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const now = new Date();
    const scopeFilter = isAdmin ? {} : { class_scope: user.assigned_class };
    supabase
      .from("attendance")
      .select("student_id,is_present")
      .eq("month", now.getMonth() + 1)
      .eq("year", now.getFullYear())
      .then(async ({ data }) => {
        if (!data) return;
        // scope to servant's class
        let filtered = data;
        if (!isAdmin && user?.assigned_class) {
          const { data: ids } = await supabase
            .from("students")
            .select("id")
            .eq("class_id", user.assigned_class);
          const idSet = new Set((ids ?? []).map((s: any) => s.id));
          filtered = data.filter((r: any) => idSet.has(r.student_id));
        }
        const map = new Map<string, { p: number; t: number }>();
        filtered.forEach((r: any) => {
          const e = map.get(r.student_id) ?? { p: 0, t: 0 };
          e.t++;
          if (r.is_present) e.p++;
          map.set(r.student_id, e);
        });
        setAtRisk(
          Array.from(map.values()).filter((s) => s.t >= 2 && s.p / s.t < 0.5)
            .length,
        );
      });
  }, [user, isAdmin]);

  function doLogout() {
    logout();
    router.replace("/login");
  }
  const isActive = (href: string) => path === href;

  if (loading || !user) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100dvh",
          background: "#f0f4f8",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 40,
              height: 40,
              border: "3px solid #e2e8f0",
              borderTopColor: "#4f46e5",
              borderRadius: "50%",
              margin: "0 auto 12px",
            }}
            className="spin"
          />
          <p style={{ fontSize: 13, color: "#94a3b8" }}>
            {lang === "ar" ? "جارٍ التحميل..." : "Loading..."}
          </p>
        </div>
      </div>
    );
  }

  const servantNav = [
    {
      href: "/dashboard",
      label: t("dashboard"),
      icon: <LayoutDashboard size={18} />,
      badge: 0,
    },
    {
      href: "/students",
      label: t("students"),
      icon: <Users size={18} />,
      badge: 0,
    },
    {
      href: "/attendance",
      label: t("take_attendance"),
      icon: <CalendarCheck size={18} />,
      badge: 0,
    },
    {
      href: "/reports",
      label: t("reports"),
      icon: <FileText size={18} />,
      badge: 0,
    },
    {
      href: "/analytics",
      label: t("analytics"),
      icon: <BarChart3 size={18} />,
      badge: atRisk,
    },
  ];
  const adminExtra = [
    {
      href: "/events",
      label: t("events"),
      icon: <Calendar size={18} />,
      badge: 0,
    },
    {
      href: "/donations",
      label: t("donations"),
      icon: <Heart size={18} />,
      badge: 0,
    },
    { href: "/trips", label: t("trips"), icon: <Bus size={18} />, badge: 0 },
    {
      href: "/media",
      label: t("media"),
      icon: <ImageIcon size={18} />,
      badge: 0,
    },
    {
      href: "/admin",
      label: t("admin_panel"),
      icon: <Settings size={18} />,
      badge: 0,
    },
  ];
  const navItems = isAdmin ? [...servantNav, ...adminExtra] : servantNav;
  // Mobile bottom nav: first 5 items always
  const mobileItems = isAdmin
    ? [
        servantNav[0],
        servantNav[1],
        servantNav[2],
        servantNav[4],
        adminExtra[2],
      ]
    : servantNav;

  return (
    <div style={{ display: "flex", height: "100dvh", overflow: "hidden" }}>
      {/* Overlay — only visible when drawer open on mobile */}
      <div
        ref={overlayRef}
        onClick={() => setSideOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,.45)",
          zIndex: 899,
          display: sideOpen ? "block" : "none",
        }}
      />

      {/* ── SIDEBAR ── */}
      {/* We use inline style transforms to avoid RTL CSS specificity issues */}
      <aside
        style={{
          width: 240,
          background: "#fff",
          borderInlineEnd: "1px solid #e2e8f0",
          display: "flex",
          flexDirection: "column",
          height: "100dvh",
          flexShrink: 0,
          overflowY: "auto",
          overflowX: "hidden",
          // Mobile: fixed + slide from correct side
          ...(typeof window !== "undefined" && window.innerWidth < 768
            ? {
                position: "fixed" as const,
                top: 0,
                bottom: 0,
                ...(isRTL
                  ? { right: 0, left: "auto" }
                  : { left: 0, right: "auto" }),
                zIndex: 900,
                boxShadow: "0 4px 16px rgba(0,0,0,.1)",
                transform: sideOpen
                  ? "translateX(0)"
                  : isRTL
                    ? "translateX(100%)"
                    : "translateX(-100%)",
                transition: "transform .28s cubic-bezier(.4,0,.2,1)",
              }
            : {}),
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: "16px 14px 12px",
            borderBottom: "1px solid #f1f5f9",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                flexShrink: 0,
                background: "linear-gradient(135deg,#3730a3,#7c3aed)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Cross size={16} color="white" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#1e293b",
                  lineHeight: 1.3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {t("app_name")}
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>
                {t("app_subtitle")}
              </div>
            </div>
            {/* Mobile close button */}
            <button
              onClick={() => setSideOpen(false)}
              style={{
                marginInlineStart: "auto",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                borderRadius: 6,
                color: "#94a3b8",
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* User card */}
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid #f1f5f9",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              background: "#f8fafc",
              borderRadius: 9,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                flexShrink: 0,
                background: isAdmin
                  ? "linear-gradient(135deg,#7c3aed,#4338ca)"
                  : "linear-gradient(135deg,#0891b2,#0e7490)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 800,
                color: "white",
              }}
            >
              {user.full_name?.charAt(0)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user.full_name}
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>
                @{user.username}
              </div>
            </div>
            <span
              className={`badge ${isAdmin ? "badge-purple" : "badge-blue"}`}
              style={{ fontSize: 10, flexShrink: 0 }}
            >
              {isAdmin ? t("admin") : t("servant")}
            </span>
          </div>
          {!isAdmin && user.assigned_class && (
            <div
              style={{
                marginTop: 6,
                padding: "4px 10px",
                background: "#eef2ff",
                borderRadius: 6,
                fontSize: 11,
                color: "#4338ca",
                fontWeight: 700,
              }}
            >
              {user.assigned_class}
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "10px", overflowY: "auto" }}>
          {navItems.map((item, idx) => {
            const showAdminLabel = isAdmin && idx === servantNav.length;
            return (
              <div key={item.href}>
                {showAdminLabel && (
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: ".08em",
                      padding: "10px 12px 4px",
                    }}
                  >
                    {lang === "ar" ? "أدوات المسؤول" : "Admin Tools"}
                  </div>
                )}
                <Link
                  href={item.href}
                  className={`nav-item ${isActive(item.href) ? "active" : ""}`}
                  style={{ marginBottom: 2 }}
                >
                  <span style={{ flexShrink: 0 }}>{item.icon}</span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.label}
                  </span>
                  {item.badge > 0 && (
                    <span
                      style={{
                        background: "#dc2626",
                        color: "white",
                        borderRadius: 99,
                        padding: "1px 6px",
                        fontSize: 10,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                  {isActive(item.href) && (
                    <ChevronRight
                      size={13}
                      style={{
                        flexShrink: 0,
                        transform: isRTL ? "rotate(180deg)" : "none",
                      }}
                    />
                  )}
                </Link>
              </div>
            );
          })}
        </nav>

        {/* At-risk banner */}
        {atRisk > 0 && (
          <div
            style={{
              margin: "0 10px 8px",
              padding: "9px 12px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 9,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={13} color="#dc2626" />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#991b1b" }}>
                {atRisk} {t("at_risk")}
              </span>
            </div>
            <p style={{ fontSize: 10, color: "#b91c1c", marginTop: 2 }}>
              {t("at_risk_desc")}
            </p>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: "10px 12px",
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <button
            className="btn btn-ghost btn-sm"
            style={{ flex: 1, justifyContent: "center", gap: 5 }}
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
          >
            <Globe size={13} />
            {lang === "ar" ? "En" : "ع"}
          </button>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={doLogout}>
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {/* Topbar */}
        <header
          style={{
            height: 52,
            background: "#fff",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            gap: 8,
            flexShrink: 0,
            position: "sticky",
            top: 0,
            zIndex: 100,
          }}
        >
          <button
            onClick={() => setSideOpen((s) => !s)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 7,
              borderRadius: 7,
              color: "#64748b",
              display: "flex",
              alignItems: "center",
            }}
            className="mobile-menu-btn"
          >
            <Menu size={20} />
          </button>
          <h1
            style={{
              flex: 1,
              fontSize: 15,
              fontWeight: 800,
              color: "#1e293b",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {navItems.find((n) => isActive(n.href))?.label ?? t("dashboard")}
          </h1>
          <button
            className="btn btn-ghost btn-sm"
            style={{ gap: 4, flexShrink: 0 }}
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
          >
            <Globe size={13} />
            <span style={{ fontSize: 12 }}>{lang === "ar" ? "En" : "ع"}</span>
          </button>
          {/* Bell */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              onClick={() => {
                setNotifOpen((o) => !o);
                if (!notifOpen) {
                  markAllNotificationsRead();
                  setTimeout(
                    () => getNotifications().then(setNotifications),
                    500,
                  );
                }
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 7,
                borderRadius: 7,
                color: "#64748b",
                display: "flex",
                alignItems: "center",
                position: "relative",
              }}
            >
              <Bell size={18} />
              {notifications.filter((n) => !n.is_read).length > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    insetInlineEnd: 4,
                    background: "#dc2626",
                    color: "white",
                    borderRadius: 99,
                    fontSize: 9,
                    fontWeight: 800,
                    padding: "1px 4px",
                    lineHeight: 1.2,
                    minWidth: 14,
                    textAlign: "center",
                  }}
                >
                  {notifications.filter((n) => !n.is_read).length}
                </span>
              )}
            </button>
            {notifOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  insetInlineEnd: 0,
                  width: 300,
                  background: "white",
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 8px 30px rgba(0,0,0,.12)",
                  zIndex: 500,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "10px 14px",
                    borderBottom: "1px solid #f1f5f9",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 800 }}>
                    {lang === "ar" ? "الإشعارات" : "Notifications"}
                  </span>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>
                    {notifications.length}
                  </span>
                </div>
                <div style={{ maxHeight: 320, overflowY: "auto" }}>
                  {notifications.length === 0 ? (
                    <div
                      style={{
                        padding: 24,
                        textAlign: "center",
                        color: "#94a3b8",
                        fontSize: 13,
                      }}
                    >
                      {lang === "ar" ? "لا توجد إشعارات" : "No notifications"}
                    </div>
                  ) : (
                    notifications.map((n: any) => {
                      const iconMap: Record<string, string> = {
                        event: "📅",
                        donation: "💰",
                        servant: "👤",
                        trip: "🚌",
                        media: "📸",
                        general: "🔔",
                      };
                      return (
                        <div
                          key={n.id}
                          onClick={() => {
                            setNotifOpen(false);
                            if (n.link) router.push(n.link);
                          }}
                          style={{
                            padding: "10px 14px",
                            borderBottom: "1px solid #f8fafc",
                            cursor: "pointer",
                            background: n.is_read ? "white" : "#f0f4ff",
                            transition: "background .15s",
                            display: "flex",
                            gap: 10,
                            alignItems: "flex-start",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 18,
                              flexShrink: 0,
                              marginTop: 1,
                            }}
                          >
                            {iconMap[n.type] ?? "🔔"}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: "#1e293b",
                              }}
                            >
                              {lang === "ar" ? n.title_ar : n.title_en}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#64748b",
                                marginTop: 2,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {lang === "ar" ? n.body_ar : n.body_en}
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: "#94a3b8",
                                marginTop: 3,
                              }}
                            >
                              {new Date(n.created_at).toLocaleDateString(
                                lang === "ar" ? "ar-EG" : "en-GB",
                                {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </div>
                          </div>
                          {!n.is_read && (
                            <div
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                background: "#4338ca",
                                flexShrink: 0,
                                marginTop: 5,
                              }}
                            />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "14px",
            paddingBottom: "80px",
          }}
          className="main-content"
        >
          <div
            className="anim-fade"
            style={{ maxWidth: 1100, margin: "0 auto" }}
          >
            {children}
          </div>
        </main>
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="mobile-nav">
        {mobileItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-nav-item ${isActive(item.href) ? "active" : ""}`}
          >
            <div style={{ position: "relative" }}>
              {item.icon}
              {item.badge > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    insetInlineEnd: -4,
                    background: "#dc2626",
                    color: "white",
                    borderRadius: 99,
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "1px 4px",
                    lineHeight: 1.2,
                  }}
                >
                  {item.badge}
                </span>
              )}
            </div>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Desktop: hide hamburger, show sidebar always */}
      <style>{`
        @media(min-width:768px){
          .mobile-menu-btn{display:none!important;}
          .mobile-nav{display:none!important;}
          .main-content{padding-bottom:14px!important;}
          aside{position:static!important;transform:none!important;transition:none!important;}
        }
      `}</style>
    </div>
  );
}
