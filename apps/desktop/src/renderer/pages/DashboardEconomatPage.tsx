import { useState, useEffect } from "react";
import { API_BASE, fetchWithAuth } from "@/services/api";
import { useSchoolProfile } from "@/context/SchoolProfileContext";
import { ROLES_FULL } from "@/lib/dashboardRoles";
import { formatDateJJMMAAAA, getTodayLocalYYYYMMDD } from "@/lib/format";
import { DateInputJJMMAAAA } from "@/components/DateInputJJMMAAAA";

const ROLES_SERVICES_ET_EXONERATIONS = ROLES_FULL; // DIRECTEUR_GENERAL, SCHOOL_ADMIN, SUPER_ADMIN

type AcademicYear = { id: string; name: string };
type ClassItem = { id: string; name: string };
type Student = { id: string; order_number: string | null; student_code: string | null; first_name: string; last_name: string; class_id: string; class_name: string };
type FeeService = {
  id: string;
  name: string;
  code: string | null;
  nature?: string;
  billing_frequency?: string;
  billing_occurrences?: number | null;
};
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
  const [serviceForm, setServiceForm] = useState({
    name: "",
    code: "",
    nature: "OBLIGATOIRE" as string,
    billing_frequency: "ONCE" as string,
    billing_occurrences: "" as string,
  });
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

  async function loadTransactions() {
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterYear) params.set("academic_year", filterYear);
      if (filterClass) params.set("class_id", filterClass);
      const res = await fetchWithAuth(`${API_BASE}/economat/transactions?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setTransactions(data.transactions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
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
    if (tab === "paiements") loadTransactions();
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
      loadTransactions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingPayment(false);
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
      const occRaw = serviceForm.billing_occurrences.trim();
      const billing_occurrences = occRaw ? Number(occRaw) : null;
      const payload = {
        name: serviceForm.name.trim(),
        code: serviceForm.code.trim() || undefined,
        nature: serviceForm.nature,
        billing_frequency: serviceForm.billing_frequency,
        billing_occurrences:
          billing_occurrences != null && Number.isFinite(billing_occurrences) && billing_occurrences > 0
            ? billing_occurrences
            : null,
      };
      if (editingService) {
        const res = await fetchWithAuth(`${API_BASE}/economat/fee-services/${editingService.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Erreur");
        }
      } else {
        const res = await fetchWithAuth(`${API_BASE}/economat/fee-services`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Erreur");
        }
      }
      setShowServiceForm(false);
      setEditingService(null);
      setServiceForm({ name: "", code: "", nature: "OBLIGATOIRE", billing_frequency: "ONCE", billing_occurrences: "" });
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
    return (
      <div className="animate-pulse text-slate-500">Chargement...</div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Économat</h2>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--app-border)]">
        <button
          type="button"
          onClick={() => setTab("paiements")}
          className={`px-4 py-2 font-medium text-sm rounded-t-lg border-b-2 -mb-px ${
            tab === "paiements"
              ? "border-[var(--school-accent-1)] text-[var(--school-accent-1)] bg-white"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Enregistrement des paiements
        </button>
        {canSeeServicesAndExemptions && (
          <>
            <button
              type="button"
              onClick={() => setTab("services")}
              className={`px-4 py-2 font-medium text-sm rounded-t-lg border-b-2 -mb-px ${
                tab === "services"
                  ? "border-[var(--school-accent-1)] text-[var(--school-accent-1)] bg-white"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Services à payer par classe
            </button>
            <button
              type="button"
              onClick={() => setTab("exonerations")}
              className={`px-4 py-2 font-medium text-sm rounded-t-lg border-b-2 -mb-px ${
                tab === "exonerations"
                  ? "border-[var(--school-accent-1)] text-[var(--school-accent-1)] bg-white"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Exonérations (bourses / demi-bourses)
            </button>
          </>
        )}
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

      {/* Tab 1: Paiements */}
      {tab === "paiements" && (
        <div className="space-y-6">
          <form onSubmit={handleSubmitPayment} className="p-5 rounded-xl border border-[var(--app-border)] bg-white space-y-4 max-w-2xl">
            <h3 className="font-semibold text-slate-900">Enregistrer un paiement</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Année scolaire</label>
                <select
                  value={paymentForm.academic_year}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, academic_year: e.target.value }))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                  required
                >
                  <option value="">Sélectionner</option>
                  {academicYears.map((y) => (
                    <option key={y.id} value={y.name}>{y.name}</option>
                  ))}
                  {currentYearLabel && !academicYears.some((y) => y.name === currentYearLabel) && (
                    <option value={currentYearLabel}>{currentYearLabel}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Classe</label>
                <select
                  value={paymentForm.class_id}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, class_id: e.target.value, student_id: "" }))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                  required
                >
                  <option value="">Sélectionner</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Élève</label>
              <select
                value={paymentForm.student_id}
                onChange={(e) => setPaymentForm((f) => ({ ...f, student_id: e.target.value }))}
                className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                required
              >
                <option value="">Sélectionner</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.student_code ? `${s.student_code} — ` : ""}{s.first_name} {s.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Service</label>
                <select
                  value={paymentForm.service_id}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, service_id: e.target.value }))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                  required
                >
                  <option value="">Sélectionner</option>
                  {feeServices.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Montant payé</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentForm.amount_paid}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, amount_paid: e.target.value }))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date du paiement</label>
                <DateInputJJMMAAAA
                  value={paymentForm.payment_date}
                  onChange={(payment_date) => setPaymentForm((f) => ({ ...f, payment_date }))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mode d&apos;encaissement</label>
                <select
                  value={paymentForm.bank_account_id}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, bank_account_id: e.target.value }))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                >
                  <option value="">Caisse</option>
                  {bankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <button type="submit" disabled={savingPayment} className="app-btn-primary disabled:opacity-60">
              {savingPayment ? "Enregistrement..." : "Enregistrer le paiement"}
            </button>
          </form>

          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Historique des paiements</h3>
            <div className="flex gap-4 mb-3">
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Toutes les années</option>
                {academicYears.map((y) => (
                  <option key={y.id} value={y.name}>{y.name}</option>
                ))}
              </select>
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Toutes les classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                  <tr>
                    <th className="px-4 py-3 font-medium text-slate-900">Date</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Élève</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Classe</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Année</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Service</th>
                    <th className="px-4 py-3 font-medium text-slate-900 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Aucun paiement</td></tr>
                  ) : (
                    transactions.map((t) => (
                      <tr key={t.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-slate-600">{formatDateJJMMAAAA(t.payment_date)}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{t.student_name ?? "—"}</td>
                        <td className="px-4 py-3 text-slate-600">{t.class_name ?? "—"}</td>
                        <td className="px-4 py-3 text-slate-600">{t.academic_year}</td>
                        <td className="px-4 py-3 text-slate-600">{t.service_name ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">{Number(t.amount_paid).toLocaleString("fr-FR")}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Services par classe */}
      {tab === "services" && canSeeServicesAndExemptions && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--app-border)] bg-white p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Sources de revenus</h3>
            {showServiceForm ? (
              <form onSubmit={handleSaveService} className="space-y-3 max-w-md mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nom</label>
                  <input
                    type="text"
                    value={serviceForm.name}
                    onChange={(e) => setServiceForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                    placeholder="Ex: Inscription, Journée des fruits"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Code (optionnel)</label>
                  <input
                    type="text"
                    value={serviceForm.code}
                    onChange={(e) => setServiceForm((f) => ({ ...f, code: e.target.value }))}
                    className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                    placeholder="Ex: INS, JDF"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nature</label>
                  <select
                    value={serviceForm.nature}
                    onChange={(e) => setServiceForm((f) => ({ ...f, nature: e.target.value }))}
                    className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                  >
                    <option value="OBLIGATOIRE">Paiement obligatoire</option>
                    <option value="PARASCOLAIRE">Activité parascolaire</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fréquence</label>
                  <select
                    value={serviceForm.billing_frequency}
                    onChange={(e) => setServiceForm((f) => ({ ...f, billing_frequency: e.target.value }))}
                    className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                  >
                    <option value="ONCE">Unique</option>
                    <option value="MONTHLY">Mensuel</option>
                    <option value="TERM">Trimestriel</option>
                  </select>
                </div>
                {(serviceForm.billing_frequency === "MONTHLY" || serviceForm.billing_frequency === "TERM") && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nombre d&apos;échéances (vide = {serviceForm.billing_frequency === "MONTHLY" ? "10" : "3"})
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={serviceForm.billing_occurrences}
                      onChange={(e) => setServiceForm((f) => ({ ...f, billing_occurrences: e.target.value }))}
                      className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                      placeholder={serviceForm.billing_frequency === "MONTHLY" ? "10" : "3"}
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <button type="submit" disabled={savingService} className="app-btn-primary disabled:opacity-60">{savingService ? "Enregistrement..." : "Enregistrer"}</button>
                  <button type="button" onClick={() => { setShowServiceForm(false); setEditingService(null); setServiceForm({ name: "", code: "", nature: "OBLIGATOIRE", billing_frequency: "ONCE", billing_occurrences: "" }); }} className="app-btn-secondary">Annuler</button>
                </div>
              </form>
            ) : (
              <button type="button" onClick={() => { setShowServiceForm(true); setEditingService(null); setServiceForm({ name: "", code: "", nature: "OBLIGATOIRE", billing_frequency: "ONCE", billing_occurrences: "" }); }} className="app-btn-secondary text-sm mb-4">Ajouter une source de revenus</button>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                  <tr>
                    <th className="px-3 py-2 font-medium text-slate-900 text-left">Nom</th>
                    <th className="px-3 py-2 font-medium text-slate-900 text-left">Code</th>
                    <th className="px-3 py-2 font-medium text-slate-900 text-left">Nature</th>
                    <th className="px-3 py-2 font-medium text-slate-900 text-left">Fréquence</th>
                    <th className="px-3 py-2 font-medium text-slate-900 w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {feeServices.map((s) => (
                    <tr key={s.id} className="border-b border-[var(--app-border)]">
                      <td className="px-3 py-2 font-medium text-slate-900">{s.name}</td>
                      <td className="px-3 py-2 text-slate-600">{s.code ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{s.nature === "PARASCOLAIRE" ? "Activité parascolaire" : "Paiement obligatoire"}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {s.billing_frequency === "MONTHLY"
                          ? `Mensuel × ${s.billing_occurrences ?? 10}`
                          : s.billing_frequency === "TERM"
                            ? `Trimestriel × ${s.billing_occurrences ?? 3}`
                            : "Unique"}
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => { setEditingService(s); setShowServiceForm(true); setServiceForm({ name: s.name, code: s.code ?? "", nature: s.nature ?? "OBLIGATOIRE", billing_frequency: s.billing_frequency ?? "ONCE", billing_occurrences: s.billing_occurrences != null ? String(s.billing_occurrences) : "" }); }} className="text-[var(--school-accent-1)] hover:underline text-xs mr-2">Modifier</button>
                        <button type="button" onClick={() => handleDeleteService(s.id)} className="text-red-600 hover:underline text-xs">Supprimer</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="font-semibold text-slate-900">Montants par classe et par année</h3>
            <div className="flex gap-2">
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Toutes les années</option>
                {academicYears.map((y) => (
                  <option key={y.id} value={y.name}>{y.name}</option>
                ))}
              </select>
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Toutes les classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button type="button" onClick={() => { setShowClassFeeForm(true); setEditingClassFee(null); setClassFeeForm({ academic_year: filterYear || academicYears[0]?.name || "", class_id: filterClass || "", service_id: "", amount: "", due_date: "", detail: "" }); }} className="app-btn-primary text-sm">
                Ajouter un montant
              </button>
            </div>
          </div>

          {showClassFeeForm && (
            <form onSubmit={handleSaveClassFee} className="p-5 rounded-xl border border-[var(--app-border)] bg-white space-y-4 max-w-lg">
              <h4 className="font-medium text-slate-900">{editingClassFee ? "Modifier le montant" : "Nouveau montant (classe, service, année)"}</h4>
              {!editingClassFee && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Année scolaire</label>
                      <select
                        value={classFeeForm.academic_year}
                        onChange={(e) => setClassFeeForm((f) => ({ ...f, academic_year: e.target.value }))}
                        className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                        required
                      >
                        <option value="">Sélectionner</option>
                        {academicYears.map((y) => (
                          <option key={y.id} value={y.name}>{y.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Classe</label>
                      <select
                        value={classFeeForm.class_id}
                        onChange={(e) => setClassFeeForm((f) => ({ ...f, class_id: e.target.value }))}
                        className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                        required
                      >
                        <option value="">Sélectionner</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Service</label>
                    <select
                      value={classFeeForm.service_id}
                      onChange={(e) => setClassFeeForm((f) => ({ ...f, service_id: e.target.value }))}
                      className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                      required
                    >
                      <option value="">Sélectionner</option>
                      {feeServices.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Montant</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingClassFee ? editingClassFee.amount : classFeeForm.amount}
                  onChange={(e) => (editingClassFee ? setEditingClassFee({ ...editingClassFee, amount: parseFloat(e.target.value) || 0 }) : setClassFeeForm((f) => ({ ...f, amount: e.target.value })))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date d&apos;échéance (optionnel)</label>
                <input
                  type="date"
                  value={editingClassFee ? (editingClassFee.due_date ?? "") : classFeeForm.due_date}
                  onChange={(e) => (editingClassFee ? setEditingClassFee({ ...editingClassFee, due_date: e.target.value || null }) : setClassFeeForm((f) => ({ ...f, due_date: e.target.value })))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                />
                <p className="text-xs text-slate-500 mt-1">Visible par les parents sur la fiche élève pour s&apos;organiser.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Détail (optionnel)</label>
                <input
                  type="text"
                  value={classFeeForm.detail}
                  onChange={(e) => setClassFeeForm((f) => ({ ...f, detail: e.target.value }))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                  placeholder="Ex: trimestre 1"
                />
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={savingClassFee} className="app-btn-primary disabled:opacity-60">{savingClassFee ? "Enregistrement..." : "Enregistrer"}</button>
                <button type="button" onClick={() => { setShowClassFeeForm(false); setEditingClassFee(null); }} className="app-btn-secondary">Annuler</button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-900">Année</th>
                  <th className="px-4 py-3 font-medium text-slate-900">Classe</th>
                  <th className="px-4 py-3 font-medium text-slate-900">Service</th>
                  <th className="px-4 py-3 font-medium text-slate-900 text-right">Montant</th>
                  <th className="px-4 py-3 font-medium text-slate-900">Échéance</th>
                  {canSeeServicesAndExemptions && <th className="px-4 py-3 font-medium text-slate-900 w-32">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {classFees.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Aucun montant défini</td></tr>
                ) : (
                  classFees.map((cf) => (
                    <tr key={cf.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-slate-600">{cf.academic_year}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{cf.class_name}</td>
                      <td className="px-4 py-3 text-slate-600">{cf.service_name}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">{Number(cf.amount).toLocaleString("fr-FR")}</td>
                      <td className="px-4 py-3 text-slate-600">{cf.due_date ? formatDateJJMMAAAA(cf.due_date) : "—"}</td>
                      <td className="px-4 py-3 flex gap-2">
                        <button type="button" onClick={() => { setEditingClassFee(cf); setShowClassFeeForm(true); setClassFeeForm({ academic_year: cf.academic_year, class_id: cf.class_id, service_id: cf.service_id, amount: String(cf.amount), due_date: cf.due_date ?? "", detail: cf.detail ?? "" }); }} className="text-[var(--school-accent-1)] hover:underline text-xs">Modifier</button>
                        <button type="button" onClick={() => handleDeleteClassFee(cf.id)} className="text-red-600 hover:underline text-xs">Supprimer</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Exonérations */}
      {tab === "exonerations" && canSeeServicesAndExemptions && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="font-semibold text-slate-900">Bourses et demi-bourses</h3>
            <div className="flex gap-2">
              <select
                value={exemptionFilterYear}
                onChange={(e) => setExemptionFilterYear(e.target.value)}
                className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Toutes les années</option>
                {academicYears.map((y) => (
                  <option key={y.id} value={y.name}>{y.name}</option>
                ))}
              </select>
              <button type="button" onClick={() => { setShowExemptionForm(true); setExemptionForm({ student_id: "", academic_year: exemptionFilterYear || academicYears[0]?.name || "", service_id: "", exemption_type: "FULL" }); }} className="app-btn-primary text-sm">
                Ajouter une exonération
              </button>
            </div>
          </div>

          {showExemptionForm && (
            <form onSubmit={handleSaveExemption} className="p-5 rounded-xl border border-[var(--app-border)] bg-white space-y-4 max-w-lg">
              <h4 className="font-medium text-slate-900">Nouvelle exonération</h4>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Année scolaire</label>
                <select
                  value={exemptionForm.academic_year}
                  onChange={(e) => setExemptionForm((f) => ({ ...f, academic_year: e.target.value }))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                  required
                >
                  <option value="">Sélectionner</option>
                  {academicYears.map((y) => (
                    <option key={y.id} value={y.name}>{y.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Service</label>
                <select
                  value={exemptionForm.service_id}
                  onChange={(e) => setExemptionForm((f) => ({ ...f, service_id: e.target.value }))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                  required
                >
                  <option value="">Sélectionner</option>
                  {feeServices.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select
                  value={exemptionForm.exemption_type}
                  onChange={(e) => setExemptionForm((f) => ({ ...f, exemption_type: e.target.value }))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                >
                  <option value="FULL">Bourse complète (100 %)</option>
                  <option value="HALF">Demi-bourse (50 %)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Élève (recherche par classe puis élève)</label>
                <ExemptionStudentSelect
                  classes={classes}
                  apiBase={API_BASE}
                  value={exemptionForm.student_id}
                  onChange={(id) => setExemptionForm((f) => ({ ...f, student_id: id }))}
                />
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={savingExemption} className="app-btn-primary disabled:opacity-60">{savingExemption ? "Enregistrement..." : "Enregistrer"}</button>
                <button type="button" onClick={() => setShowExemptionForm(false)} className="app-btn-secondary">Annuler</button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-900">Élève</th>
                  <th className="px-4 py-3 font-medium text-slate-900">Année</th>
                  <th className="px-4 py-3 font-medium text-slate-900">Service</th>
                  <th className="px-4 py-3 font-medium text-slate-900">Type</th>
                  <th className="px-4 py-3 font-medium text-slate-900 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {exemptions.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Aucune exonération</td></tr>
                ) : (
                  exemptions.map((e) => (
                    <tr key={e.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-900">{e.student_name ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{e.academic_year}</td>
                      <td className="px-4 py-3 text-slate-600">{e.service_name ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{e.exemption_type === "FULL" ? "Bourse complète" : "Demi-bourse"}</td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => handleDeleteExemption(e.id)} className="text-red-600 hover:underline text-xs">Supprimer</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
    <div className="space-y-2">
      <select
        value={classId}
        onChange={(e) => { setClassId(e.target.value); onChange(""); }}
        className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
      >
        <option value="">Choisir une classe</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
        required
        disabled={!classId}
      >
        <option value="">Choisir un élève</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.student_code ? `${s.student_code} — ` : ""}{s.first_name} {s.last_name}
          </option>
        ))}
      </select>
    </div>
  );
}
