"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Edit2,
  Trash2,
  Heart,
  TrendingUp,
  DollarSign,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/lib/AuthContext";
import { useLang } from "@/lib/LangContext";
import {
  getDonations,
  createDonation,
  updateDonation,
  deleteDonation,
  createNotification,
} from "@/lib/supabase";

interface Toast {
  type: "success" | "error";
  msg: string;
}
const now = new Date();
const emptyForm = {
  donor_name: "",
  amount: "",
  currency: "EGP",
  purpose: "",
  donation_date: now.toISOString().split("T")[0],
  notes: "",
};

export default function DonationsPage() {
  const { user, isAdmin } = useAuth();
  const { t, lang, monthName } = useLang();
  const router = useRouter();
  const [donations, setDonations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      router.replace("/dashboard");
      return;
    }
  }, [isAdmin]);
  useEffect(() => {
    load();
  }, [month, year]);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    setLoading(true);
    try {
      setDonations(await getDonations(month, year));
    } finally {
      setLoading(false);
    }
  }

  const totalEGP = donations
    .filter((d) => d.currency === "EGP")
    .reduce((s, d) => s + Number(d.amount), 0);
  const totalUSD = donations
    .filter((d) => d.currency === "USD")
    .reduce((s, d) => s + Number(d.amount), 0);

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm, donation_date: now.toISOString().split("T")[0] });
    setModal("add");
  }
  function openEdit(d: any) {
    setEditing(d);
    setForm({
      donor_name: d.donor_name,
      amount: String(d.amount),
      currency: d.currency,
      purpose: d.purpose ?? "",
      donation_date: d.donation_date,
      notes: d.notes ?? "",
    });
    setModal("edit");
  }

  async function handleSave() {
    if (!form.donor_name.trim() || !form.amount) {
      showToast("error", t("required"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        donor_name: form.donor_name,
        amount: parseFloat(form.amount),
        currency: form.currency,
        purpose: form.purpose || null,
        donation_date: form.donation_date,
        notes: form.notes || null,
      };
      if (editing) {
        await updateDonation(editing.id, payload);
        showToast("success", t("donation_updated"));
      } else {
        await createDonation(payload, user?.id);
        showToast("success", t("donation_added"));

        await createNotification({
          title_ar: "تبرع جديد",
          title_en: "New Donation",
          body_ar: `تبرع من ${form.donor_name} بمبلغ ${form.amount} ${form.currency}`,
          body_en: `Donation from ${form.donor_name}: ${form.amount} ${form.currency}`,
          type: "donation",
          link: "/donations",
          created_by: user?.id,
        });
      }
      setModal(null);
      load();
    } catch {
      showToast("error", t("error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("confirm_delete"))) return;
    setDeleting(id);
    try {
      await deleteDonation(id, user?.id);
      showToast("success", t("donation_deleted"));
      load();
    } catch {
      showToast("error", t("error"));
    } finally {
      setDeleting(null);
    }
  }

  const MONTHS = Array.from({ length: 12 }, (_, i) => monthName(i + 1));

  if (!isAdmin) return null;

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
            <h2 style={{ fontSize: 18, fontWeight: 800 }}>{t("donations")}</h2>
            <p style={{ fontSize: 12, color: "#64748b" }}>
              {monthName(month)} {year}
            </p>
          </div>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={14} /> {t("add_donation")}
          </button>
        </div>

        {/* Month filter */}
        <div
          className="card"
          style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <select
            className="form-input"
            style={{ flex: "1 1 130px", fontSize: 14 }}
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
            style={{ flex: "1 1 80px", fontSize: 14 }}
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

        {/* Summary cards */}
        <div className="grid-3">
          <div className="card stat-card stat-green">
            <p
              style={{
                fontSize: 11,
                color: "#64748b",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".04em",
                marginBottom: 4,
              }}
            >
              {t("donations_count")}
            </p>
            <p style={{ fontSize: 26, fontWeight: 800 }}>
              {loading ? "—" : donations.length}
            </p>
          </div>
          <div className="card stat-card stat-indigo">
            <p
              style={{
                fontSize: 11,
                color: "#64748b",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".04em",
                marginBottom: 4,
              }}
            >
              {t("this_month_total")} (EGP)
            </p>
            <p style={{ fontSize: 22, fontWeight: 800 }}>
              {loading ? "—" : totalEGP.toLocaleString()}
            </p>
          </div>
          {totalUSD > 0 && (
            <div className="card stat-card stat-amber">
              <p
                style={{
                  fontSize: 11,
                  color: "#64748b",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: ".04em",
                  marginBottom: 4,
                }}
              >
                {t("this_month_total")} (USD)
              </p>
              <p style={{ fontSize: 22, fontWeight: 800 }}>
                {loading ? "—" : totalUSD.toLocaleString()}
              </p>
            </div>
          )}
        </div>

        {/* Donations list */}
        {loading ? (
          <div
            className="card"
            style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}
          >
            {t("loading")}
          </div>
        ) : donations.length === 0 ? (
          <div
            className="card"
            style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}
          >
            <Heart size={36} style={{ margin: "0 auto 10px", opacity: 0.3 }} />
            <p style={{ fontSize: 14 }}>{t("no_donations")}</p>
            <button
              className="btn btn-primary"
              onClick={openAdd}
              style={{ marginTop: 12 }}
            >
              <Plus size={14} /> {t("add_donation")}
            </button>
          </div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            {donations.map((d, i) => (
              <div
                key={d.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  borderBottom:
                    i < donations.length - 1 ? "1px solid #f1f5f9" : "none",
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: "linear-gradient(135deg,#16a34a,#15803d)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 800,
                    color: "white",
                  }}
                >
                  {d.donor_name.charAt(0)}
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{ fontSize: 14, fontWeight: 700 }}
                    className="truncate"
                  >
                    {d.donor_name}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      marginTop: 2,
                    }}
                  >
                    <span style={{ fontSize: 11, color: "#64748b" }}>
                      {d.donation_date}
                    </span>
                    {d.purpose && (
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>
                        — {d.purpose}
                      </span>
                    )}
                  </div>
                </div>
                {/* Amount */}
                <div style={{ textAlign: "end", flexShrink: 0 }}>
                  <div
                    style={{ fontSize: 16, fontWeight: 800, color: "#16a34a" }}
                  >
                    {Number(d.amount).toLocaleString()}{" "}
                    <span style={{ fontSize: 11 }}>{d.currency}</span>
                  </div>
                </div>
                {/* Actions */}
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button
                    className="btn btn-ghost btn-sm btn-icon"
                    onClick={() => openEdit(d)}
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    className="btn btn-danger btn-sm btn-icon"
                    onClick={() => handleDelete(d.id)}
                    disabled={deleting === d.id}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
            {/* Total row */}
            <div
              style={{
                padding: "12px 14px",
                background: "#f8fafc",
                borderTop: "2px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 800, color: "#374151" }}>
                {lang === "ar" ? "الإجمالي" : "Total"} ({donations.length}{" "}
                {lang === "ar" ? "تبرع" : "donations"})
              </span>
              <div style={{ textAlign: "end" }}>
                {totalEGP > 0 && (
                  <div
                    style={{ fontSize: 16, fontWeight: 800, color: "#16a34a" }}
                  >
                    {totalEGP.toLocaleString()} EGP
                  </div>
                )}
                {totalUSD > 0 && (
                  <div
                    style={{ fontSize: 14, fontWeight: 700, color: "#0891b2" }}
                  >
                    {totalUSD.toLocaleString()} USD
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>
                {modal === "add" ? t("add_donation") : t("edit_donation")}
              </h3>
              <button
                className="btn btn-ghost btn-sm btn-icon"
                onClick={() => setModal(null)}
              >
                <X size={17} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t("donor_name")} *</label>
                <input
                  className="form-input"
                  style={{ fontSize: 16 }}
                  value={form.donor_name}
                  onChange={(e) =>
                    setForm({ ...form, donor_name: e.target.value })
                  }
                  autoFocus
                />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">{t("amount")} *</label>
                  <input
                    type="number"
                    className="form-input"
                    style={{ fontSize: 16 }}
                    value={form.amount}
                    onChange={(e) =>
                      setForm({ ...form, amount: e.target.value })
                    }
                    dir="ltr"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t("currency")}</label>
                  <select
                    className="form-input"
                    style={{ fontSize: 14 }}
                    value={form.currency}
                    onChange={(e) =>
                      setForm({ ...form, currency: e.target.value })
                    }
                  >
                    <option value="EGP">EGP — ج.م</option>
                    <option value="USD">USD — $</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t("donation_date")} *</label>
                <input
                  type="date"
                  className="form-input"
                  style={{ fontSize: 14 }}
                  value={form.donation_date}
                  onChange={(e) =>
                    setForm({ ...form, donation_date: e.target.value })
                  }
                  dir="ltr"
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  {t("purpose")}{" "}
                  <span style={{ color: "#94a3b8", fontWeight: 400 }}>
                    ({t("optional")})
                  </span>
                </label>
                <input
                  className="form-input"
                  style={{ fontSize: 16 }}
                  value={form.purpose}
                  onChange={(e) =>
                    setForm({ ...form, purpose: e.target.value })
                  }
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  {t("notes")}{" "}
                  <span style={{ color: "#94a3b8", fontWeight: 400 }}>
                    ({t("optional")})
                  </span>
                </label>
                <textarea
                  className="form-input"
                  style={{ fontSize: 14 }}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setModal(null)}
              >
                {t("cancel")}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? t("saving") : t("save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast-wrap">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </AppShell>
  );
}
