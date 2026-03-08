"use client";
import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Award } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/lib/AuthContext";
import { useLang } from "@/lib/LangContext";
import { getClasses, getStudents, supabase, classLabel } from "@/lib/supabase";
import { Class } from "@/types";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

type Tab = "overview" | "students" | "classes" | "sessions";

export default function AnalyticsPage() {
  const { user, isAdmin } = useAuth();
  const { t, lang, monthName } = useLang();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [tab, setTab] = useState<Tab>("overview");
  const [classes, setClasses] = useState<Class[]>([]);

  const [summary, setSummary] = useState<any>(null);
  const [atRisk, setAtRisk] = useState<any[]>([]);
  const [topStudents, setTopStudents] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [trend, setTrend] = useState<any[]>([]);
  const [sessionBreak, setSessionBreak] = useState<any[]>([]);
  const [classRank, setClassRank] = useState<any[]>([]);
  const [genderData, setGenderData] = useState<any[]>([]);
  const [firstLoad, setFirstLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const MONTHS = Array.from({ length: 12 }, (_, i) => monthName(i + 1));
  const cls = useCallback(
    (id: string) => classLabel(id, lang, classes),
    [lang, classes],
  );

  useEffect(() => {
    getClasses().then(setClasses as any);
  }, []);

  useEffect(() => {
    if (!user || classes.length === 0) return;

    const run = async () => {
      if (firstLoad) {
        setFirstLoad(false);
      } else {
        setRefreshing(true);
      }

      try {
        await load();
      } finally {
        setRefreshing(false);
      }
    };

    run();
  }, [month, year, user, classes]);

  async function load() {
    if (!user) return;

    const scopeClass = isAdmin ? undefined : (user.assigned_class ?? undefined);
    const students = (await getStudents(scopeClass)) as any[];

    if (!students.length) {
      setSummary({ active: 0, avgPct: 0, atRisk: 0, perfect: 0 });
      return;
    }

    const ids = students.map((s: any) => s.id);

    const { data: att } = await supabase
      .from("attendance")
      .select("student_id,is_present,session_type,week_number")
      .eq("month", month)
      .eq("year", year)
      .in("student_id", ids);

    const allAtt = att ?? [];

    const map = new Map<string, { p: number; t: number }>();

    allAtt.forEach((a: any) => {
      const e = map.get(a.student_id) ?? { p: 0, t: 0 };
      e.t++;
      if (a.is_present) e.p++;
      map.set(a.student_id, e);
    });

    const vals = Array.from(map.values());

    const avg = vals.length
      ? Math.round(
          (vals.reduce((s, v) => s + v.p / v.t, 0) / vals.length) * 100,
        )
      : 0;

    setSummary({
      active: students.length,
      avgPct: avg,
      atRisk: vals.filter((v) => v.t >= 2 && v.p / v.t < 0.5).length,
      perfect: vals.filter((v) => v.t >= 2 && v.p === v.t).length,
    });

    setAtRisk(
      students
        .filter((s: any) => {
          const d = map.get(s.id);
          return d && d.t >= 2 && d.p / d.t < 0.5;
        })
        .map((s: any) => {
          const d = map.get(s.id)!;
          return {
            id: s.id,
            name: s.full_name,
            className: cls(s.class_id),
            pct: Math.round((d.p / d.t) * 100),
            p: d.p,
            t: d.t,
          };
        })
        .sort((a: any, b: any) => a.pct - b.pct),
    );

    setTopStudents(
      students
        .filter((s: any) => {
          const d = map.get(s.id);
          return d && d.t >= 2 && d.p / d.t >= 0.75;
        })
        .map((s: any) => {
          const d = map.get(s.id)!;
          return {
            id: s.id,
            name: s.full_name,
            className: cls(s.class_id),
            pct: Math.round((d.p / d.t) * 100),
          };
        })
        .sort((a: any, b: any) => b.pct - a.pct)
        .slice(0, 12),
    );

    setAllStudents(
      students
        .map((s: any) => {
          const d = map.get(s.id) ?? { p: 0, t: 0 };
          const pct = d.t > 0 ? Math.round((d.p / d.t) * 100) : 0;

          return {
            id: s.id,
            name: s.full_name,
            className: cls(s.class_id),
            pct,
            p: d.p,
            t: d.t,
            status:
              d.t === 0
                ? "none"
                : pct >= 75
                  ? "good"
                  : pct >= 50
                    ? "warn"
                    : "risk",
          };
        })
        .sort((a: any, b: any) => a.pct - b.pct),
    );

    // trend 6 months
    const trendMonths = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(year, month - 1 - i, 1);
      return { m: d.getMonth() + 1, y: d.getFullYear() };
    }).reverse();

    const trendRows = await Promise.all(
      trendMonths.map(async ({ m, y }) => {
        const { data } = await supabase
          .from("attendance")
          .select("is_present")
          .eq("month", m)
          .eq("year", y)
          .in("student_id", ids);

        const tot = (data ?? []).length;
        const pres = (data ?? []).filter((a: any) => a.is_present).length;

        return {
          label: monthName(m).slice(0, 3),
          pct: tot > 0 ? Math.round((pres / tot) * 100) : 0,
        };
      }),
    );

    setTrend(trendRows);

    const sTypes = ["mass", "sunday_school", "tasbeha"] as const;

    const labels: Record<string, string> = {
      mass: lang === "ar" ? "قداس" : "Liturgy",
      sunday_school: lang === "ar" ? "مدارس الاحد" : "Sunday School",
      tasbeha: lang === "ar" ? "تسبحه" : "Tasbeha",
    };

    setSessionBreak(
      sTypes.map((s) => {
        const sa = allAtt.filter((a: any) => a.session_type === s);
        const p = sa.filter((a: any) => a.is_present).length;

        return {
          key: s,
          name: labels[s],
          present: p,
          absent: sa.length - p,
          total: sa.length,
          pct: sa.length > 0 ? Math.round((p / sa.length) * 100) : 0,
        };
      }),
    );

    if (isAdmin) {
      const cm = new Map<
        string,
        { name: string; p: number; t: number; gender: "boys" | "girls" }
      >();

      students.forEach((s: any) => {
        const found = classes.find((c) => c.id === s.class_id);
        const name = cls(s.class_id);

        if (!cm.has(s.class_id))
          cm.set(s.class_id, {
            name,
            p: 0,
            t: 0,
            gender: found?.gender ?? "boys",
          });
      });

      allAtt.forEach((a: any) => {
        const s = students.find((st: any) => st.id === a.student_id);
        if (s) {
          const e = cm.get(s.class_id);
          if (e) {
            e.t++;
            if (a.is_present) e.p++;
          }
        }
      });

      setClassRank(
        Array.from(cm.values())
          .map((d) => ({
            name: d.name,
            pct: d.t > 0 ? Math.round((d.p / d.t) * 100) : 0,
            gender: d.gender,
          }))
          .sort((a: any, b: any) => b.pct - a.pct),
      );
    }

    const gMap = new Map<string, "boys" | "girls">();

    students.forEach((s: any) => {
      const c = classes.find((cl) => cl.id === s.class_id);
      gMap.set(s.id, c?.gender ?? "boys");
    });

    const bp = allAtt.filter(
      (a: any) => a.is_present && gMap.get(a.student_id) === "boys",
    ).length;

    const gp = allAtt.filter(
      (a: any) => a.is_present && gMap.get(a.student_id) === "girls",
    ).length;

    setGenderData([
      { name: lang === "ar" ? "أولاد" : "Boys", value: bp, color: "#3b82f6" },
      { name: lang === "ar" ? "بنات" : "Girls", value: gp, color: "#ec4899" },
    ]);
  }

  const TABS: { key: Tab; label: string }[] = isAdmin
    ? [
        { key: "overview", label: lang === "ar" ? "نظرة عامة" : "Overview" },
        { key: "students", label: lang === "ar" ? "الطلاب" : "Students" },
        { key: "classes", label: lang === "ar" ? "الفصول" : "Classes" },
        { key: "sessions", label: lang === "ar" ? "الجلسات" : "Sessions" },
      ]
    : [
        { key: "overview", label: lang === "ar" ? "نظرة عامة" : "Overview" },
        { key: "students", label: lang === "ar" ? "طلابي" : "My Students" },
        { key: "sessions", label: lang === "ar" ? "الجلسات" : "Sessions" },
      ];

  function StatusDot({ status }: { status: string }) {
    const c =
      status === "good"
        ? "#16a34a"
        : status === "warn"
          ? "#d97706"
          : status === "risk"
            ? "#dc2626"
            : "#cbd5e1";
    return (
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: c,
          flexShrink: 0,
        }}
      />
    );
  }
  function PctBar({ pct, color }: { pct: number; color: string }) {
    return (
      <div style={{ flex: 1 }}>
        <div className="progress">
          <div
            className="progress-bar"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
      </div>
    );
  }

  const summaryCards = summary
    ? [
        {
          label: t("active_students"),
          value: summary.active,
          color: "stat-indigo",
        },
        {
          label: t("avg_attendance"),
          value: `${summary.avgPct}%`,
          color:
            summary.avgPct >= 75
              ? "stat-green"
              : summary.avgPct >= 50
                ? "stat-amber"
                : "stat-red",
        },
        {
          label: t("at_risk_students"),
          value: summary.atRisk,
          color: "stat-red",
        },
        {
          label: t("perfect_attendance"),
          value: summary.perfect,
          color: "stat-green",
        },
      ]
    : [];

  return (
    <AppShell>
      <div className="stack" style={{ gap: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800 }}>{t("analytics")}</h2>
            <p
              style={{
                fontSize: 12,
                color: "#64748b",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {monthName(month)} {year}
              {refreshing && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    color: "#94a3b8",
                    fontSize: 11,
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      border: "1.5px solid #e2e8f0",
                      borderTopColor: "#4338ca",
                      borderRadius: "50%",
                      display: "inline-block",
                    }}
                    className="spin"
                  />
                  ‎
                </span>
              )}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              className="form-input"
              style={{ fontSize: 13, width: "auto" }}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select
              className="form-input"
              style={{ fontSize: 13, width: "auto" }}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {[now.getFullYear() - 1, now.getFullYear()].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Stat cards — persist across tab switches */}
        {summaryCards.length > 0 && (
          <div className="grid-4">
            {summaryCards.map((c, i) => (
              <div key={i} className={`card stat-card ${c.color}`}>
                <p
                  style={{
                    fontSize: 11,
                    color: "#64748b",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: ".04em",
                    marginBottom: 6,
                  }}
                >
                  {c.label}
                </p>
                <p style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>
                  {c.value}
                </p>
                <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                  {monthName(month)}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            background: "#f1f5f9",
            padding: 4,
            borderRadius: 10,
            alignSelf: "flex-start",
            flexWrap: "wrap",
          }}
        >
          {TABS.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              style={{
                padding: "7px 16px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                fontWeight: 700,
                fontSize: 13,
                transition: "all .15s",
                background: tab === tb.key ? "white" : "transparent",
                color: tab === tb.key ? "#1e293b" : "#64748b",
                boxShadow: tab === tb.key ? "0 1px 3px rgba(0,0,0,.1)" : "none",
              }}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* First-load spinner */}
        {firstLoad && !summary ? (
          <div
            className="card"
            style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}
          >
            {t("loading")}
          </div>
        ) : (
          <>
            {/* ── OVERVIEW ── */}
            {tab === "overview" && (
              <div className="stack" style={{ gap: 12 }}>
                {atRisk.length > 0 && (
                  <div
                    style={{
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: 14,
                      padding: 14,
                    }}
                  >
                    <div className="hstack" style={{ marginBottom: 10 }}>
                      <AlertTriangle size={16} color="#dc2626" />
                      <h3
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: "#991b1b",
                        }}
                      >
                        {t("at_risk")} ({atRisk.length}) — {t("at_risk_desc")}
                      </h3>
                    </div>
                    <div className="grid-2" style={{ gap: 8 }}>
                      {atRisk.slice(0, 6).map((s: any) => (
                        <div
                          key={s.id}
                          style={{
                            background: "white",
                            borderRadius: 9,
                            padding: "10px 12px",
                            border: "1px solid #fecaca",
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: "50%",
                              background: "#fee2e2",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 13,
                              fontWeight: 800,
                              color: "#dc2626",
                              flexShrink: 0,
                            }}
                          >
                            {s.name.charAt(0)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {s.name}
                            </div>
                            <div style={{ fontSize: 10, color: "#94a3b8" }}>
                              {s.className}
                            </div>
                          </div>
                          <div style={{ textAlign: "end", flexShrink: 0 }}>
                            <div
                              style={{
                                fontSize: 16,
                                fontWeight: 800,
                                color: "#dc2626",
                              }}
                            >
                              {s.pct}%
                            </div>
                            <div style={{ fontSize: 10, color: "#94a3b8" }}>
                              {s.p}/{s.t}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {topStudents.length > 0 && (
                  <div
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: 14,
                      padding: 14,
                    }}
                  >
                    <div className="hstack" style={{ marginBottom: 10 }}>
                      <Award size={16} color="#16a34a" />
                      <h3
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: "#15803d",
                        }}
                      >
                        {t("top_students")} ({topStudents.length})
                      </h3>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {topStudents.slice(0, 8).map((s: any, i: number) => (
                        <div
                          key={s.id}
                          style={{
                            background: "white",
                            borderRadius: 8,
                            padding: "6px 10px",
                            border: "1px solid #bbf7d0",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              width: 18,
                              height: 18,
                              background: i < 3 ? "#fbbf24" : "#e2e8f0",
                              borderRadius: 4,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: i < 3 ? "white" : "#64748b",
                              flexShrink: 0,
                            }}
                          >
                            {i + 1}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: 110,
                              }}
                            >
                              {s.name}
                            </div>
                            <div style={{ fontSize: 10, color: "#94a3b8" }}>
                              {s.className}
                            </div>
                          </div>
                          <span className="badge badge-green">{s.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid-2">
                  <div className="card" style={{ padding: 14 }}>
                    <h3
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        marginBottom: 12,
                      }}
                    >
                      {t("months_trend")}
                    </h3>
                    {trend.every((d) => d.pct === 0) ? (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "30px 0",
                          color: "#94a3b8",
                          fontSize: 13,
                        }}
                      >
                        {t("no_data")}
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={150}>
                        <LineChart data={trend}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#f1f5f9"
                          />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                          <YAxis
                            domain={[0, 100]}
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => `${v}%`}
                          />
                          <Tooltip
                            formatter={(v: number) => [`${v}%`, "%"]}
                            contentStyle={{ borderRadius: 8, fontSize: 12 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="pct"
                            stroke="#4f46e5"
                            strokeWidth={2.5}
                            dot={{ fill: "#4f46e5", r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <div className="card" style={{ padding: 14 }}>
                    <h3
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        marginBottom: 12,
                      }}
                    >
                      {t("by_gender")}
                    </h3>
                    {genderData.every((g) => g.value === 0) ? (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "30px 0",
                          color: "#94a3b8",
                          fontSize: 13,
                        }}
                      >
                        {t("no_data")}
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={150}>
                        <PieChart>
                          <Pie
                            data={genderData}
                            cx="50%"
                            cy="50%"
                            innerRadius={38}
                            outerRadius={58}
                            paddingAngle={4}
                            dataKey="value"
                          >
                            {genderData.map((e: any, i: number) => (
                              <Cell key={i} fill={e.color} />
                            ))}
                          </Pie>
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── STUDENTS ── */}
            {tab === "students" && (
              <div className="card" style={{ overflow: "hidden" }}>
                <div
                  style={{
                    padding: "12px 14px",
                    borderBottom: "1px solid #f1f5f9",
                    display: "flex",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 700 }}>
                    {lang === "ar" ? "تفاصيل حضور الطلاب" : "Attendance Detail"}
                  </span>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      fontSize: 11,
                      flexWrap: "wrap",
                    }}
                  >
                    {[
                      {
                        s: "good",
                        l: lang === "ar" ? "ممتاز ≥75%" : "Good ≥75%",
                      },
                      { s: "warn", l: lang === "ar" ? "متوسط" : "Avg" },
                      {
                        s: "risk",
                        l: lang === "ar" ? "يحتاج متابعة" : "At-Risk",
                      },
                    ].map(({ s, l }) => (
                      <span
                        key={s}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <StatusDot status={s} />
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
                {allStudents.length === 0 ? (
                  <div
                    style={{
                      padding: 48,
                      textAlign: "center",
                      color: "#94a3b8",
                    }}
                  >
                    {t("no_data")}
                  </div>
                ) : (
                  allStudents.map((s: any, i: number) => (
                    <div
                      key={s.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 14px",
                        borderBottom:
                          i < allStudents.length - 1
                            ? "1px solid #f8fafc"
                            : "none",
                      }}
                    >
                      <StatusDot status={s.status} />
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background:
                            s.status === "risk"
                              ? "#fee2e2"
                              : s.status === "good"
                                ? "#dcfce7"
                                : s.status === "warn"
                                  ? "#fef3c7"
                                  : "#f1f5f9",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 800,
                          color:
                            s.status === "risk"
                              ? "#dc2626"
                              : s.status === "good"
                                ? "#16a34a"
                                : s.status === "warn"
                                  ? "#d97706"
                                  : "#94a3b8",
                        }}
                      >
                        {s.name.charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {s.name}
                        </div>
                        {isAdmin && (
                          <div style={{ fontSize: 10, color: "#94a3b8" }}>
                            {s.className}
                          </div>
                        )}
                      </div>
                      <PctBar
                        pct={s.pct}
                        color={
                          s.status === "good"
                            ? "#16a34a"
                            : s.status === "warn"
                              ? "#d97706"
                              : s.t === 0
                                ? "#e2e8f0"
                                : "#dc2626"
                        }
                      />
                      <div
                        style={{
                          textAlign: "end",
                          flexShrink: 0,
                          minWidth: 54,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            color:
                              s.t === 0
                                ? "#94a3b8"
                                : s.status === "good"
                                  ? "#16a34a"
                                  : s.status === "warn"
                                    ? "#d97706"
                                    : "#dc2626",
                          }}
                        >
                          {s.t === 0 ? "—" : `${s.pct}%`}
                        </div>
                        {s.t > 0 && (
                          <div style={{ fontSize: 10, color: "#94a3b8" }}>
                            {s.p}/{s.t}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── CLASSES (admin) ── */}
            {tab === "classes" && isAdmin && (
              <div className="stack" style={{ gap: 8 }}>
                {classRank.length === 0 ? (
                  <div
                    className="card"
                    style={{
                      padding: 48,
                      textAlign: "center",
                      color: "#94a3b8",
                    }}
                  >
                    {t("no_data")}
                  </div>
                ) : (
                  classRank.map((c: any, i: number) => (
                    <div
                      key={i}
                      className="card"
                      style={{ padding: "12px 16px" }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          marginBottom: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            width: 22,
                            height: 22,
                            background: i < 3 ? "#4338ca" : "#e2e8f0",
                            borderRadius: 5,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: i < 3 ? "white" : "#64748b",
                            flexShrink: 0,
                          }}
                        >
                          {i + 1}
                        </span>
                        <span
                          style={{ flex: 1, fontSize: 14, fontWeight: 700 }}
                        >
                          {c.name}
                        </span>
                        <span
                          className={`badge ${c.gender === "boys" ? "badge-blue" : "badge-pink"}`}
                          style={{ flexShrink: 0 }}
                        >
                          {c.gender === "boys"
                            ? lang === "ar"
                              ? "أولاد"
                              : "Boys"
                            : lang === "ar"
                              ? "بنات"
                              : "Girls"}
                        </span>
                        <span
                          style={{
                            fontSize: 16,
                            fontWeight: 800,
                            color:
                              c.pct >= 75
                                ? "#16a34a"
                                : c.pct >= 50
                                  ? "#d97706"
                                  : "#dc2626",
                            flexShrink: 0,
                          }}
                        >
                          {c.pct}%
                        </span>
                      </div>
                      <div className="progress">
                        <div
                          className="progress-bar"
                          style={{
                            width: `${c.pct}%`,
                            background:
                              c.gender === "boys" ? "#3b82f6" : "#ec4899",
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
                {classRank.length > 1 && (
                  <div className="card" style={{ padding: 14 }}>
                    <h3
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        marginBottom: 12,
                      }}
                    >
                      {t("class_ranking")}
                    </h3>
                    <ResponsiveContainer
                      width="100%"
                      height={Math.max(180, classRank.length * 28)}
                    >
                      <BarChart data={classRank} layout="vertical" barSize={14}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#f1f5f9"
                          horizontal={false}
                        />
                        <XAxis
                          type="number"
                          domain={[0, 100]}
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fontSize: 10 }}
                          width={100}
                        />
                        <Tooltip
                          formatter={(v: number) => [`${v}%`, ""]}
                          contentStyle={{ borderRadius: 8, fontSize: 12 }}
                        />
                        <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                          {classRank.map((c: any, i: number) => (
                            <Cell
                              key={i}
                              fill={c.gender === "boys" ? "#3b82f6" : "#ec4899"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* ── SESSIONS ── */}
            {tab === "sessions" && (
              <div className="stack" style={{ gap: 10 }}>
                {sessionBreak.every((s) => s.total === 0) ? (
                  <div
                    className="card"
                    style={{
                      padding: 48,
                      textAlign: "center",
                      color: "#94a3b8",
                    }}
                  >
                    {t("no_data")}
                  </div>
                ) : (
                  <>
                    {sessionBreak
                      .filter((s) => s.total > 0)
                      .map((s: any) => (
                        <div
                          key={s.key}
                          className="card"
                          style={{ padding: "14px 16px" }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 10,
                              flexWrap: "wrap",
                              gap: 8,
                            }}
                          >
                            <span className={`sess-${s.key}`}>{s.name}</span>
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                              }}
                            >
                              <span className="badge badge-green">
                                {s.present} {lang === "ar" ? "حاضر" : "present"}
                              </span>
                              <span className="badge badge-red">
                                {s.absent} {lang === "ar" ? "غائب" : "absent"}
                              </span>
                              <span
                                style={{
                                  fontSize: 16,
                                  fontWeight: 800,
                                  color:
                                    s.pct >= 75
                                      ? "#16a34a"
                                      : s.pct >= 50
                                        ? "#d97706"
                                        : "#dc2626",
                                }}
                              >
                                {s.pct}%
                              </span>
                            </div>
                          </div>
                          <div className="progress">
                            <div
                              className="progress-bar"
                              style={{
                                width: `${s.pct}%`,
                                background:
                                  s.pct >= 75
                                    ? "#16a34a"
                                    : s.pct >= 50
                                      ? "#d97706"
                                      : "#dc2626",
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    <div className="card" style={{ padding: 14 }}>
                      <h3
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          marginBottom: 12,
                        }}
                      >
                        {t("session_breakdown")}
                      </h3>
                      <ResponsiveContainer width="100%" height={140}>
                        <BarChart
                          data={sessionBreak.filter((s) => s.total > 0)}
                          barSize={24}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#f1f5f9"
                          />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip
                            contentStyle={{ borderRadius: 8, fontSize: 12 }}
                          />
                          <Bar
                            dataKey="present"
                            name={t("present")}
                            fill="#4f46e5"
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="absent"
                            name={t("absent")}
                            fill="#e2e8f0"
                            radius={[4, 4, 0, 0]}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
