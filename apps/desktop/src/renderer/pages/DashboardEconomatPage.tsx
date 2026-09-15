import { useState, useEffect, useRef } from "react";
import { API_BASE, fetchWithAuth } from "@/services/api";
import { useSchoolProfile } from "@/context/SchoolProfileContext";
import { ROLES_FULL } from "@/lib/dashboardRoles";
import { formatDateJJMMAAAA, getTodayLocalYYYYMMDD } from "@/lib/format";
import { DateInputJJMMAAAA } from "@/components/DateInputJJMMAAAA";

const ROLES_SERVICES_ET_EXONERATIONS = ROLES_FULL; // DIRECTEUR_GENERAL, SCHOOL_ADMIN, SUPER_ADMIN
const TX_PAGE = 40;
const FIELD = "class-input w-full";
const CARD = "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm";
const CARD_BODY = "min-w-0 flex-1 p-5";
const TABLE_WRAP = "h-[min(58vh,32rem)] overflow-auto rounded-xl ring-1 ring-slate-200";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Count({ n, extra }: { n: number; extra?: boolean }) {
  return (
    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-teal-800 ring-1 ring-teal-100">
      {n}
      {extra ? "+" : ""}
    </span>
  );
}

function Pill({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "teal" | "amber" | "slate";
}) {
  const cls =
    tone === "teal"
      ? "bg-teal-50 text-teal-800 ring-teal-100"
      : tone === "amber"
        ? "bg-amber-50 text-amber-800 ring-amber-100"
        : "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${cls}`}>
      {children}
    </span>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className={CARD}>
      <div className="flex">
        <span className="w-1.5 shrink-0 bg-[var(--school-accent-1)]" />
        <div className={CARD_BODY}>{children}</div>
      </div>
    </section>
  );
}

type AcademicYear = { id: string; name: string };
type ClassItem = { id: string; name: string };
type Student = { id: string; order_number: string | null; first_name: string; last_name: string; class_id: string; class_name: string };
type FeeService = { id: string; name: string; code: string | null; nature?: string };
type ClassFee = {
  id: string;
  academic_year: string;
  class_id: string;
  class_name: string;
  service_id: string;
  service_name: string;
  amount: number;
  due_date: string | null;
  detail: string | null;
  created_at: string;
};
type Transaction = {
  id: string;
  student_id: string;
  student_name: string | null;
  class_name: string | null;
  academic_year: string;
  service_name: string | null;
  amount_due: number;
  amount_paid: number;
  payment_date: string;
  bank_account_id: string | null;
  cancelled_at: string | null;
  created_at: string;
};
type BankAccountOption = { id: string; label: string };
type Exemption = {
  id: string;
  student_id: string;
  student_name: string | null;
  academic_year: string;
  service_id: string;
  service_name: string | null;
  exemption_type: string;
  created_at: string;
};

export function DashboardEconomatPage() {
  const { roleName } = useSchoolProfile() ?? { roleName: "" };
  const canSeeServicesAndExemptions = ROLES_SERVICES_ET_EXONERATIONS.includes(roleName);

  const [tab, setTab] = useState<"paiements" | "services" | "exonerations">("paiements");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [feeServices, setFeeServices] = useState<FeeService[]>([]);
  const [currentYearLabel, setCurrentYearLabel] = useState<string>("");

  const [classFees, setClassFees] = useState<ClassFee[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txHasMore, setTxHasMore] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [txLoadingMore, setTxLoadingMore] = useState(false);
  const txBusy = useRef(false);
  const [exemptions, setExemptions] = useState<Exemption[]>([]);

  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [paymentForm, setPaymentForm] = useState({
    student_id: "",
    class_id: "",
    academic_year: "",
    service_id: "",
    amount_paid: "",
    payment_date: getTodayLocalYYYYMMDD(),
    bank_account_id: "",
  });
  const [savingPayment, setSavingPayment] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState("");
  const [filterClass, setFilterClass] = useState("");

  const [showClassFeeForm, setShowClassFeeForm] = useState(false);
  const [classFeeForm, setClassFeeForm] = useState({
    academic_year: "",
    class_id: "",
    service_id: "",
    amount: "",
    due_date: "",
    detail: "",
  });
  const [editingClassFee, setEditingClassFee] = useState<ClassFee | null>(null);
  const [savingClassFee, setSavingClassFee] = useState(false);

  const [showExemptionForm, setShowExemptionForm] = useState(false);
  const [exemptionForm, setExemptionForm] = useState({
    student_id: "",
    academic_year: "",
    service_id: "",
    exemption_type: "FULL",
  });
  const [savingExemption, setSavingExemption] = useState(false);
  const [exemptionFilterYear, setExemptionFilterYear] = useState("");
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [serviceForm, setServiceForm] = useState({ name: "", code: "", nature: "OBLIGATOIRE" as string });
  const [editingService, setEditingService] = useState<FeeService | null>(null);
  const [savingService, setSavingService] = useState(false);

  async function loadBaseData() {
    setError("");
    try {
      const [yearsRes, classesRes, servicesRes, currentRes, ctxRes, banksRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/academic-years`),
        fetchWithAuth(`${API_BASE}/classes`),
        fetchWithAuth(`${API_BASE}/economat/fee-services`),
        fetchWithAuth(`${API_BASE}/economat/current-year`),
        fetchWithAuth(`${API_BASE}/school/current-context`),
        fetchWithAuth(`${API_BASE}/finance/bank-accounts`),
      ]);
      const yearsData = await yearsRes.json();
      const classesData = await classesRes.json();
      const servicesData = await servicesRes.json();
      const currentData = await currentRes.json();
      const ctxData = await ctxRes.json();
      const banksData = await banksRes.json().catch(() => ({}));
      if (!yearsRes.ok) throw new Error(yearsData.message || "Erreur années");
      if (!classesRes.ok) throw new Error(classesData.message || "Erreur classes");
      if (!servicesRes.ok) throw new Error(servicesData.message || "Erreur services");
      setAcademicYears(yearsData.academic_years ?? []);
      setClasses(classesData.classes ?? []);
      setFeeServices(servicesData.fee_services ?? []);
      setBankAccounts(banksRes.ok ? banksData.accounts ?? [] : []);
      const defaultYearName = ctxRes.ok && ctxData.current_academic_year_name
        ? ctxData.current_academic_year_name
        : (currentData.academic_year as string) || "";
      setCurrentYearLabel(defaultYearName);
      setFilterYear((prev) => (prev === "" && defaultYearName ? defaultYearName : prev));
      setExemptionFilterYear((prev) => (prev === "" && defaultYearName ? defaultYearName : prev));
      if (defaultYearName) {
        setPaymentForm((prev) => (prev.academic_year ? prev : { ...prev, academic_year: defaultYearName }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur chargement");
    }
  }

  async function loadStudents(classId?: string) {
    if (!classId) {
      setStudents([]);
      return;
    }
    try {
      const res = await fetchWithAuth(`${API_BASE}/students?class_id=${classId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setStudents(data.students ?? []);
    } catch {
      setStudents([]);
    }
  }

  async function loadTransactions(mode: "reset" | "more" = "reset") {
    if (txBusy.current) return;
    if (mode === "more" && (!txHasMore || txLoadingMore)) return;
    txBusy.current = true;
    if (mode === "more") setTxLoadingMore(true);
    else {
      setTxLoading(true);
      setError("");
    }
    try {
      const params = new URLSearchParams();
      if (filterYear) params.set("academic_year", filterYear);
      if (filterClass) params.set("class_id", filterClass);
      params.set("limit", String(TX_PAGE));
      params.set("offset", String(mode === "more" ? transactions.length : 0));
      const res = await fetchWithAuth(`${API_BASE}/economat/transactions?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      const list: Transaction[] = data.transactions ?? [];
      setTransactions((prev) => (mode === "more" ? [...prev, ...list] : list));
      setTxHasMore(!!data.has_more);
    } catch (e) {
      if (mode === "reset") {
        setError(e instanceof Error ? e.message : "Erreur");
        setTransactions([]);
        setTxHasMore(false);
      }
    } finally {
      txBusy.current = false;
      setTxLoading(false);
      setTxLoadingMore(false);
    }
  }

  async function loadClassFees() {
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterYear) params.set("academic_year", filterYear);
      if (filterClass) params.set("class_id", filterClass);
      const res = await fetchWithAuth(`${API_BASE}/economat/class-fees?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setClassFees(data.class_fees ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function loadExemptions() {
    setError("");
    try {
      const params = new URLSearchParams();
      if (exemptionFilterYear) params.set("academic_year", exemptionFilterYear);
      const res = await fetchWithAuth(`${API_BASE}/economat/exemptions?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setExemptions(data.exemptions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  useEffect(() => {
    loadBaseData().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === "paiements") void loadTransactions("reset");
    if (tab === "services" && canSeeServicesAndExemptions) loadClassFees();
    if (tab === "exonerations" && canSeeServicesAndExemptions) loadExemptions();
  }, [tab, filterYear, filterClass, exemptionFilterYear, canSeeServicesAndExemptions]);

  useEffect(() => {
    if (paymentForm.class_id) loadStudents(paymentForm.class_id);
    else setStudents([]);
  }, [paymentForm.class_id]);

  async function handleSubmitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentForm.student_id || !paymentForm.class_id || !paymentForm.academic_year || !paymentForm.service_id || !paymentForm.amount_paid || !paymentForm.payment_date) {
      setError("Veuillez remplir tous les champs.");
      return;
    }
    const amount = parseFloat(paymentForm.amount_paid);
    if (isNaN(amount) || amount <= 0) {
      setError("Montant invalide.");
      return;
    }
    setSavingPayment(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/economat/payments`, {
        method: "POST",
        body: JSON.stringify({
          student_id: paymentForm.student_id,
          class_id: paymentForm.class_id,
          academic_year: paymentForm.academic_year,
          service_id: paymentForm.service_id,
          amount_paid: amount,
          payment_date: paymentForm.payment_date,
          bank_account_id: paymentForm.bank_account_id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setPaymentForm((f) => ({ ...f, amount_paid: "", student_id: "", bank_account_id: "" }));
      void loadTransactions("reset");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingPayment(false);
    }
  }

  async function handleCancelPayment(id: string) {
    if (!confirm("Supprimer ce paiement ?")) return;
    setCancellingId(id);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/economat/payments/${id}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erreur");
      setTransactions((prev) =>
        prev.map((t) => (t.id === id ? { ...t, cancelled_at: data.payment?.cancelled_at ?? new Date().toISOString() } : t)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCancellingId(null);
    }
  }

  async function handleSaveClassFee(e: React.FormEvent) {
    e.preventDefault();
    const year = editingClassFee ? undefined : classFeeForm.academic_year;
    const classId = editingClassFee ? undefined : classFeeForm.class_id;
    const serviceId = editingClassFee ? undefined : classFeeForm.service_id;
    if (!editingClassFee && (!year || !classId || !serviceId)) {
      setError("Année, classe et service requis.");
      return;
    }
    const amount = editingClassFee ? editingClassFee.amount : parseFloat(classFeeForm.amount);
    if (isNaN(amount) || amount < 0) {
      setError("Montant invalide.");
      return;
    }
    setSavingClassFee(true);
    setError("");
    try {
      if (editingClassFee) {
        const res = await fetchWithAuth(`${API_BASE}/economat/class-fees/${editingClassFee.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            due_date: classFeeForm.due_date.trim() || null,
            detail: classFeeForm.detail.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      } else {
        const res = await fetchWithAuth(`${API_BASE}/economat/class-fees`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            academic_year: year,
            class_id: classId,
            service_id: serviceId,
            amount,
            due_date: classFeeForm.due_date.trim() || null,
            detail: classFeeForm.detail.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      }
      setShowClassFeeForm(false);
      setEditingClassFee(null);
      setClassFeeForm({ academic_year: "", class_id: "", service_id: "", amount: "", due_date: "", detail: "" });
      loadClassFees();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingClassFee(false);
    }
  }

  async function handleDeleteClassFee(id: string) {
    if (!confirm("Supprimer ce montant ?")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/economat/class-fees/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      loadClassFees();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function handleSaveExemption(e: React.FormEvent) {
    e.preventDefault();
    if (!exemptionForm.student_id || !exemptionForm.academic_year || !exemptionForm.service_id) {
      setError("Élève, année et service requis.");
      return;
    }
    setSavingExemption(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/economat/exemptions`, {
        method: "POST",
        body: JSON.stringify({
          student_id: exemptionForm.student_id,
          academic_year: exemptionForm.academic_year,
          service_id: exemptionForm.service_id,
          exemption_type: exemptionForm.exemption_type,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setShowExemptionForm(false);
      setExemptionForm({ student_id: "", academic_year: "", service_id: "", exemption_type: "FULL" });
      loadExemptions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingExemption(false);
    }
  }

  async function handleDeleteExemption(id: string) {
    if (!confirm("Supprimer cette exonération ?")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/economat/exemptions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      loadExemptions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function handleSaveService(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSavingService(true);
    try {
      if (editingService) {
        const res = await fetchWithAuth(`${API_BASE}/economat/fee-services/${editingService.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: serviceForm.name.trim(), code: serviceForm.code.trim() || undefined, nature: serviceForm.nature }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Erreur");
        }
      } else {
        const res = await fetchWithAuth(`${API_BASE}/economat/fee-services`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: serviceForm.name.trim(), code: serviceForm.code.trim() || undefined, nature: serviceForm.nature }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Erreur");
        }
      }
      setShowServiceForm(false);
      setEditingService(null);
      setServiceForm({ name: "", code: "", nature: "OBLIGATOIRE" });
      loadBaseData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSavingService(false);
    }
  }

  async function handleDeleteService(id: string) {
    if (!confirm("Supprimer cette source de revenus ?")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/economat/fee-services/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      loadBaseData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  if (loading) {
    return <div className="animate-pulse text-slate-500">Chargement...</div>;
  }

  const tabs = [
    { id: "paiements" as const, label: "Paiements" },
    ...(canSeeServicesAndExemptions
      ? [
          { id: "services" as const, label: "Services" },
          { id: "exonerations" as const, label: "Exonérations" },
        ]
      : []),
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700">Finance</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Économat</h2>
        </div>
        <div className="inline-flex rounded-full bg-slate-100 p-1 ring-1 ring-slate-200">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">{error}</div>
      ) : null}

      {tab === "paiements" ? (
        <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
          <Card>
            <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Encaissement
            </h3>
            <form onSubmit={handleSubmitPayment} className="space-y-4">
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Élève
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Année">
                    <select
                      value={paymentForm.academic_year}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, academic_year: e.target.value }))}
                      className={FIELD}
                      required
                    >
                      <option value="">Sélectionner</option>
                      {academicYears.map((y) => (
                        <option key={y.id} value={y.name}>{y.name}</option>
                      ))}
                      {currentYearLabel && !academicYears.some((y) => y.name === currentYearLabel) ? (
                        <option value={currentYearLabel}>{currentYearLabel}</option>
                      ) : null}
                    </select>
                  </Field>
                  <Field label="Classe">
                    <select
                      value={paymentForm.class_id}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, class_id: e.target.value, student_id: "" }))}
                      className={FIELD}
                      required
                    >
                      <option value="">Sélectionner</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Élève">
                      <select
                        value={paymentForm.student_id}
                        onChange={(e) => setPaymentForm((f) => ({ ...f, student_id: e.target.value }))}
                        className={FIELD}
                        required
                        disabled={!paymentForm.class_id}
                      >
                        <option value="">Sélectionner</option>
                        {students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.order_number ? `${s.order_number} — ` : ""}{s.first_name} {s.last_name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>
              </div>
              <div className="rounded-xl p-4 ring-1 ring-slate-200">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Paiement
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Service">
                    <select
                      value={paymentForm.service_id}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, service_id: e.target.value }))}
                      className={FIELD}
                      required
                    >
                      <option value="">Sélectionner</option>
                      {feeServices.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Montant">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={paymentForm.amount_paid}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, amount_paid: e.target.value }))}
                      className={FIELD}
                      required
                    />
                  </Field>
                  <Field label="Date">
                    <DateInputJJMMAAAA
                      value={paymentForm.payment_date}
                      onChange={(payment_date) => setPaymentForm((f) => ({ ...f, payment_date }))}
                      className={FIELD}
                      required
                    />
                  </Field>
                  <Field label="Encaissement">
                    <select
                      value={paymentForm.bank_account_id}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, bank_account_id: e.target.value }))}
                      className={FIELD}
                    >
                      <option value="">Caisse</option>
                      {bankAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <button type="submit" disabled={savingPayment} className="app-btn-primary disabled:opacity-60">
                  {savingPayment ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </Card>

          <Card>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Historique
                </h3>
                <Count n={transactions.length} extra={txHasMore} />
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="class-input bg-white"
                >
                  <option value="">Toutes</option>
                  {academicYears.map((y) => (
                    <option key={y.id} value={y.name}>{y.name}</option>
                  ))}
                </select>
                <select
                  value={filterClass}
                  onChange={(e) => setFilterClass(e.target.value)}
                  className="class-input bg-white"
                >
                  <option value="">Toutes</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div
              className={TABLE_WRAP}
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 72) {
                  void loadTransactions("more");
                }
              }}
            >
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 font-medium text-slate-900">Date</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Élève</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Classe</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Service</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-900">Montant</th>
                    <th className="px-4 py-3 font-medium text-slate-900 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {txLoading && transactions.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Chargement...</td></tr>
                  ) : transactions.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Aucun paiement</td></tr>
                  ) : (
                    transactions.map((t) => (
                      <tr
                        key={t.id}
                        className={`border-b ${
                          t.cancelled_at
                            ? "border-red-100 bg-red-50/70"
                            : "border-slate-100 hover:bg-slate-50/50"
                        }`}
                      >
                        <td className={`px-4 py-3 ${t.cancelled_at ? "text-red-700 line-through" : "text-slate-600"}`}>
                          {formatDateJJMMAAAA(t.payment_date)}
                        </td>
                        <td className={`px-4 py-3 font-medium ${t.cancelled_at ? "text-red-700 line-through" : "text-slate-900"}`}>
                          {t.student_name ?? "—"}
                        </td>
                        <td className={`px-4 py-3 ${t.cancelled_at ? "text-red-700 line-through" : "text-slate-600"}`}>
                          {t.class_name ?? "—"}
                        </td>
                        <td className={`px-4 py-3 ${t.cancelled_at ? "text-red-700 line-through" : "text-slate-600"}`}>
                          {t.service_name ?? "—"}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium tabular-nums ${t.cancelled_at ? "text-red-700 line-through" : "text-slate-900"}`}>
                          {Number(t.amount_paid).toLocaleString("fr-FR")}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {t.cancelled_at ? (
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
                              Supprimé
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleCancelPayment(t.id)}
                              disabled={cancellingId === t.id}
                              className="text-xs text-red-600 hover:underline disabled:opacity-50"
                            >
                              {cancellingId === t.id ? "..." : "Supprimer"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                  {txLoadingMore ? (
                    <tr><td colSpan={6} className="px-4 py-3 text-center text-slate-500">Chargement...</td></tr>
                  ) : txHasMore ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => void loadTransactions("more")}
                          className="text-sm font-medium text-[var(--school-accent-1)] hover:underline"
                        >
                          Plus
                        </button>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "services" && canSeeServicesAndExemptions ? (
        <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Sources
                </h3>
                <Count n={feeServices.length} />
              </div>
              {!showServiceForm ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowServiceForm(true);
                    setEditingService(null);
                    setServiceForm({ name: "", code: "", nature: "OBLIGATOIRE" });
                  }}
                  className="app-btn-secondary text-sm"
                >
                  Ajouter
                </button>
              ) : null}
            </div>
            {showServiceForm ? (
              <form onSubmit={handleSaveService} className="mb-4 space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                <Field label="Nom">
                  <input
                    type="text"
                    value={serviceForm.name}
                    onChange={(e) => setServiceForm((f) => ({ ...f, name: e.target.value }))}
                    className={FIELD}
                    required
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Code">
                    <input
                      type="text"
                      value={serviceForm.code}
                      onChange={(e) => setServiceForm((f) => ({ ...f, code: e.target.value }))}
                      className={FIELD}
                    />
                  </Field>
                  <Field label="Nature">
                    <select
                      value={serviceForm.nature}
                      onChange={(e) => setServiceForm((f) => ({ ...f, nature: e.target.value }))}
                      className={FIELD}
                    >
                      <option value="OBLIGATOIRE">Obligatoire</option>
                      <option value="PARASCOLAIRE">Parascolaire</option>
                    </select>
                  </Field>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={savingService} className="app-btn-primary disabled:opacity-60">
                    {savingService ? "Enregistrement..." : "Enregistrer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowServiceForm(false);
                      setEditingService(null);
                      setServiceForm({ name: "", code: "", nature: "OBLIGATOIRE" });
                    }}
                    className="app-btn-secondary"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            ) : null}
            <div className={TABLE_WRAP}>
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 font-medium text-slate-900">Nom</th>
                    <th className="px-3 py-2 font-medium text-slate-900">Code</th>
                    <th className="px-3 py-2 font-medium text-slate-900">Nature</th>
                    <th className="px-3 py-2 font-medium text-slate-900 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {feeServices.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-500">Aucune source</td></tr>
                  ) : (
                    feeServices.map((s) => (
                      <tr key={s.id} className="border-b border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-900">{s.name}</td>
                        <td className="px-3 py-2 text-slate-600">{s.code ?? "—"}</td>
                        <td className="px-3 py-2">
                          <Pill tone={s.nature === "PARASCOLAIRE" ? "amber" : "teal"}>
                            {s.nature === "PARASCOLAIRE" ? "Parascolaire" : "Obligatoire"}
                          </Pill>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingService(s);
                              setShowServiceForm(true);
                              setServiceForm({ name: s.name, code: s.code ?? "", nature: s.nature ?? "OBLIGATOIRE" });
                            }}
                            className="mr-2 text-xs text-[var(--school-accent-1)] hover:underline"
                          >
                            Modifier
                          </button>
                          <button type="button" onClick={() => handleDeleteService(s.id)} className="text-xs text-red-600 hover:underline">
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Montants
                </h3>
                <Count n={classFees.length} />
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="class-input bg-white"
                >
                  <option value="">Toutes</option>
                  {academicYears.map((y) => (
                    <option key={y.id} value={y.name}>{y.name}</option>
                  ))}
                </select>
                <select
                  value={filterClass}
                  onChange={(e) => setFilterClass(e.target.value)}
                  className="class-input bg-white"
                >
                  <option value="">Toutes</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setShowClassFeeForm(true);
                    setEditingClassFee(null);
                    setClassFeeForm({
                      academic_year: filterYear || academicYears[0]?.name || "",
                      class_id: filterClass || "",
                      service_id: "",
                      amount: "",
                      due_date: "",
                      detail: "",
                    });
                  }}
                  className="app-btn-primary text-sm"
                >
                  Ajouter
                </button>
              </div>
            </div>
            {showClassFeeForm ? (
              <form onSubmit={handleSaveClassFee} className="mb-4 space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                {!editingClassFee ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Année">
                      <select
                        value={classFeeForm.academic_year}
                        onChange={(e) => setClassFeeForm((f) => ({ ...f, academic_year: e.target.value }))}
                        className={FIELD}
                        required
                      >
                        <option value="">Sélectionner</option>
                        {academicYears.map((y) => (
                          <option key={y.id} value={y.name}>{y.name}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Classe">
                      <select
                        value={classFeeForm.class_id}
                        onChange={(e) => setClassFeeForm((f) => ({ ...f, class_id: e.target.value }))}
                        className={FIELD}
                        required
                      >
                        <option value="">Sélectionner</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Service">
                        <select
                          value={classFeeForm.service_id}
                          onChange={(e) => setClassFeeForm((f) => ({ ...f, service_id: e.target.value }))}
                          className={FIELD}
                          required
                        >
                          <option value="">Sélectionner</option>
                          {feeServices.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Montant">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editingClassFee ? editingClassFee.amount : classFeeForm.amount}
                      onChange={(e) =>
                        editingClassFee
                          ? setEditingClassFee({ ...editingClassFee, amount: parseFloat(e.target.value) || 0 })
                          : setClassFeeForm((f) => ({ ...f, amount: e.target.value }))
                      }
                      className={FIELD}
                      required
                    />
                  </Field>
                  <Field label="Échéance">
                    <DateInputJJMMAAAA
                      value={editingClassFee ? (editingClassFee.due_date ?? "") : classFeeForm.due_date}
                      onChange={(due_date) =>
                        editingClassFee
                          ? setEditingClassFee({ ...editingClassFee, due_date: due_date || null })
                          : setClassFeeForm((f) => ({ ...f, due_date }))
                      }
                      className={FIELD}
                    />
                  </Field>
                </div>
                <Field label="Détail">
                  <input
                    type="text"
                    value={classFeeForm.detail}
                    onChange={(e) => setClassFeeForm((f) => ({ ...f, detail: e.target.value }))}
                    className={FIELD}
                  />
                </Field>
                <div className="flex gap-2">
                  <button type="submit" disabled={savingClassFee} className="app-btn-primary disabled:opacity-60">
                    {savingClassFee ? "Enregistrement..." : "Enregistrer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowClassFeeForm(false);
                      setEditingClassFee(null);
                    }}
                    className="app-btn-secondary"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            ) : null}
            <div className={TABLE_WRAP}>
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 font-medium text-slate-900">Année</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Classe</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Service</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-900">Montant</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Échéance</th>
                    <th className="px-4 py-3 font-medium text-slate-900 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {classFees.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Aucun montant</td></tr>
                  ) : (
                    classFees.map((cf) => (
                      <tr key={cf.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-slate-600">{cf.academic_year}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{cf.class_name}</td>
                        <td className="px-4 py-3 text-slate-600">{cf.service_name}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                          {Number(cf.amount).toLocaleString("fr-FR")}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {cf.due_date ? formatDateJJMMAAAA(cf.due_date) : "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingClassFee(cf);
                              setShowClassFeeForm(true);
                              setClassFeeForm({
                                academic_year: cf.academic_year,
                                class_id: cf.class_id,
                                service_id: cf.service_id,
                                amount: String(cf.amount),
                                due_date: cf.due_date ?? "",
                                detail: cf.detail ?? "",
                              });
                            }}
                            className="mr-2 text-xs text-[var(--school-accent-1)] hover:underline"
                          >
                            Modifier
                          </button>
                          <button type="button" onClick={() => handleDeleteClassFee(cf.id)} className="text-xs text-red-600 hover:underline">
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "exonerations" && canSeeServicesAndExemptions ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Bourses
              </h3>
              <Count n={exemptions.length} />
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={exemptionFilterYear}
                onChange={(e) => setExemptionFilterYear(e.target.value)}
                className="class-input bg-white"
              >
                <option value="">Toutes</option>
                {academicYears.map((y) => (
                  <option key={y.id} value={y.name}>{y.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setShowExemptionForm(true);
                  setExemptionForm({
                    student_id: "",
                    academic_year: exemptionFilterYear || academicYears[0]?.name || "",
                    service_id: "",
                    exemption_type: "FULL",
                  });
                }}
                className="app-btn-primary text-sm"
              >
                Ajouter
              </button>
            </div>
          </div>
          {showExemptionForm ? (
            <form onSubmit={handleSaveExemption} className="mb-4 grid gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100 sm:grid-cols-2">
              <Field label="Année">
                <select
                  value={exemptionForm.academic_year}
                  onChange={(e) => setExemptionForm((f) => ({ ...f, academic_year: e.target.value }))}
                  className={FIELD}
                  required
                >
                  <option value="">Sélectionner</option>
                  {academicYears.map((y) => (
                    <option key={y.id} value={y.name}>{y.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Service">
                <select
                  value={exemptionForm.service_id}
                  onChange={(e) => setExemptionForm((f) => ({ ...f, service_id: e.target.value }))}
                  className={FIELD}
                  required
                >
                  <option value="">Sélectionner</option>
                  {feeServices.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Type">
                <select
                  value={exemptionForm.exemption_type}
                  onChange={(e) => setExemptionForm((f) => ({ ...f, exemption_type: e.target.value }))}
                  className={FIELD}
                >
                  <option value="FULL">Bourse complète</option>
                  <option value="HALF">Demi-bourse</option>
                </select>
              </Field>
              <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                <ExemptionStudentSelect
                  classes={classes}
                  apiBase={API_BASE}
                  value={exemptionForm.student_id}
                  onChange={(id) => setExemptionForm((f) => ({ ...f, student_id: id }))}
                />
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <button type="submit" disabled={savingExemption} className="app-btn-primary disabled:opacity-60">
                  {savingExemption ? "Enregistrement..." : "Enregistrer"}
                </button>
                <button type="button" onClick={() => setShowExemptionForm(false)} className="app-btn-secondary">
                  Annuler
                </button>
              </div>
            </form>
          ) : null}
          <div className={TABLE_WRAP}>
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 font-medium text-slate-900">Élève</th>
                  <th className="px-4 py-3 font-medium text-slate-900">Année</th>
                  <th className="px-4 py-3 font-medium text-slate-900">Service</th>
                  <th className="px-4 py-3 font-medium text-slate-900">Type</th>
                  <th className="px-4 py-3 font-medium text-slate-900 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {exemptions.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Aucune exonération</td></tr>
                ) : (
                  exemptions.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-900">{e.student_name ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{e.academic_year}</td>
                      <td className="px-4 py-3 text-slate-600">{e.service_name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Pill tone={e.exemption_type === "FULL" ? "teal" : "amber"}>
                          {e.exemption_type === "FULL" ? "Bourse complète" : "Demi-bourse"}
                        </Pill>
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => handleDeleteExemption(e.id)} className="text-xs text-red-600 hover:underline">
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function ExemptionStudentSelect({
  classes,
  apiBase,
  value,
  onChange,
}: {
  classes: ClassItem[];
  apiBase: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  useEffect(() => {
    if (!classId) {
      setStudents([]);
      onChange("");
      return;
    }
    fetchWithAuth(`${apiBase}/students?class_id=${classId}`)
      .then((r) => r.json())
      .then((d) => {
        setStudents(d.students ?? []);
        if (value && !(d.students ?? []).some((s: Student) => s.id === value)) onChange("");
      })
      .catch(() => setStudents([]));
  }, [classId, apiBase]);
  return (
    <>
      <Field label="Classe">
        <select
          value={classId}
          onChange={(e) => { setClassId(e.target.value); onChange(""); }}
          className={FIELD}
        >
          <option value="">Sélectionner</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Élève">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={FIELD}
          required
          disabled={!classId}
        >
          <option value="">Sélectionner</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.order_number ? `${s.order_number} — ` : ""}{s.first_name} {s.last_name}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}
