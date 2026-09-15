import { useState, useEffect } from "react";
import { API_BASE, fetchWithAuth } from "@/services/api";
import { formatDateJJMMAAAA, getTodayLocalYYYYMMDD } from "@/lib/format";
import { DateInputJJMMAAAA } from "@/components/DateInputJJMMAAAA";
import { useRevealScroll } from "@/lib/useRevealScroll";


type Activity = { id: string; name: string; code: string | null };
type Expense = {
  id: string;
  expense_date: string;
  amount: number;
  label: string;
  beneficiary: string | null;
  category: string | null;
  document_ref: string | null;
  statut: string;
  fee_service_id: string | null;
  bank_account_id: string | null;
  created_at: string;
};
type BankAccountOption = { id: string; label: string };

export function DashboardDepensesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showForm, setShowForm] = useState(false);
  const formRef = useRevealScroll<HTMLFormElement>(showForm);
  const [saving, setSaving] = useState(false);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    expense_date: getTodayLocalYYYYMMDD(),
    amount: "",
    label: "",
    beneficiary: "",
    category: "",
    document_ref: "",
    fee_service_id: "" as string,
    bank_account_id: "" as string,
  });

  useEffect(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    setDateFrom(`${y}-${m}-01`);
    setDateTo(d.toISOString().slice(0, 10));
  }, []);

  async function loadActivities() {
    try {
      const [actRes, banksRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/finance/activities`),
        fetchWithAuth(`${API_BASE}/finance/bank-accounts`),
      ]);
      const data = await actRes.json();
      const banksData = await banksRes.json().catch(() => ({}));
      setActivities(data.activities ?? []);
      setBankAccounts(banksRes.ok ? banksData.accounts ?? [] : []);
    } catch {
      setActivities([]);
      setBankAccounts([]);
    }
  }

  async function loadExpenses() {
    setError("");
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const res = await fetchWithAuth(`${API_BASE}/finance/expenses?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setExpenses(data.expenses ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur chargement");
      setExpenses([]);
    }
  }

  useEffect(() => {
    loadActivities();
  }, []);

  useEffect(() => {
    if (dateFrom || dateTo) loadExpenses();
    else setLoading(false);
  }, [dateFrom, dateTo]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/finance/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense_date: form.expense_date,
          amount: parseFloat(form.amount) || 0,
          label: form.label.trim(),
          beneficiary: form.beneficiary.trim() || undefined,
          category: form.category.trim() || undefined,
          document_ref: form.document_ref.trim() || undefined,
          fee_service_id: form.fee_service_id || null,
          bank_account_id: form.bank_account_id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setShowForm(false);
      setForm({
        expense_date: getTodayLocalYYYYMMDD(),
        amount: "",
        label: "",
        beneficiary: "",
        category: "",
        document_ref: "",
        fee_service_id: "",
        bank_account_id: "",
      });
      loadExpenses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function handleValidate(id: string) {
    setValidatingId(id);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/finance/expenses/${id}/validate`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      loadExpenses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setValidatingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette dépense (brouillon) ?")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/finance/expenses/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      loadExpenses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  const activityName = (id: string | null) => {
    if (!id) return "Trésorerie générale";
    return activities.find((a) => a.id === id)?.name ?? id;
  };

  const bankLabel = (id: string | null) => {
    if (!id) return "Caisse";
    return bankAccounts.find((a) => a.id === id)?.label ?? "Banque";
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Dépenses</h2>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-700">Du</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-700">Au</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm" />
        </div>
        <button type="button" onClick={() => setShowForm(true)} className="app-btn-primary text-sm">
          Nouvelle dépense
        </button>
      </div>

      {showForm && (
        <form ref={formRef} onSubmit={handleSubmit} className="p-5 rounded-xl border border-[var(--app-border)] bg-white space-y-4 max-w-xl">
          <h3 className="font-semibold text-slate-900">Nouvelle dépense</h3>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
            <DateInputJJMMAAAA value={form.expense_date} onChange={(v) => setForm((f) => ({ ...f, expense_date: v }))} className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Montant</label>
            <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Libellé</label>
            <input type="text" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Bénéficiaire / Fournisseur (optionnel)</label>
            <input type="text" value={form.beneficiary} onChange={(e) => setForm((f) => ({ ...f, beneficiary: e.target.value }))} className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Imputé à</label>
            <select value={form.fee_service_id} onChange={(e) => setForm((f) => ({ ...f, fee_service_id: e.target.value }))} className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2">
              <option value="">Trésorerie générale</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mode de paiement</label>
            <select
              value={form.bank_account_id}
              onChange={(e) => setForm((f) => ({ ...f, bank_account_id: e.target.value }))}
              className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
            >
              <option value="">Caisse</option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">N° pièce (optionnel)</label>
            <input type="text" value={form.document_ref} onChange={(e) => setForm((f) => ({ ...f, document_ref: e.target.value }))} className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="app-btn-primary disabled:opacity-60">{saving ? "Enregistrement..." : "Enregistrer (brouillon)"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="app-btn-secondary">Annuler</button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-[var(--app-border)]">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-900 text-left">Date</th>
              <th className="px-4 py-3 font-medium text-slate-900 text-left">Libellé</th>
              <th className="px-4 py-3 font-medium text-slate-900 text-left">Imputé à</th>
              <th className="px-4 py-3 font-medium text-slate-900 text-left">Mode</th>
              <th className="px-4 py-3 font-medium text-slate-900 text-right">Montant</th>
              <th className="px-4 py-3 font-medium text-slate-900 text-center">Statut</th>
              <th className="px-4 py-3 font-medium text-slate-900 w-40">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Chargement...</td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Aucune dépense</td></tr>
            ) : (
              expenses.map((exp) => (
                <tr key={exp.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-slate-600">{formatDateJJMMAAAA(exp.expense_date)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{exp.label}</td>
                  <td className="px-4 py-3 text-slate-600">{activityName(exp.fee_service_id)}</td>
                  <td className="px-4 py-3 text-slate-600">{bankLabel(exp.bank_account_id)}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">{exp.amount.toLocaleString("fr-FR")}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={exp.statut === "VALIDEE" ? "text-green-600 font-medium" : "text-amber-600"}>{exp.statut === "VALIDEE" ? "Validée" : "Brouillon"}</span>
                  </td>
                  <td className="px-4 py-3">
                    {exp.statut === "BROUILLON" && (
                      <>
                        <button type="button" onClick={() => handleValidate(exp.id)} disabled={validatingId === exp.id} className="text-green-600 hover:underline text-xs mr-2 disabled:opacity-50">Valider</button>
                        <button type="button" onClick={() => handleDelete(exp.id)} className="text-red-600 hover:underline text-xs">Supprimer</button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
