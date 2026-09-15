"use client";

import { useState, useEffect } from "react";
import { API_BASE, fetchWithAuth } from "@/src/lib/api";
import { useSchoolProfile } from "@/src/contexts/SchoolProfileContext";
import { ImageUpload } from "@/src/components/ImageUpload";
import {
  EXTRA_SIGNATURE_SLOT,
  ROLE_OPTIONS,
  SignatureForm,
  buildDefaultSignatures,
  displayRoleLabel,
  mergeSignaturesFromApi,
} from "@/src/lib/signatureSlots";

export default function SchoolPage() {
  const { school, refetch } = useSchoolProfile();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [slogan, setSlogan] = useState("");
  const [domain, setDomain] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [primary_color, setPrimary_color] = useState("#0f766e");
  const [secondary_color, setSecondary_color] = useState("#0d9488");
  const [logo_url, setLogo_url] = useState<string | null>(null);
  const [signatures, setSignatures] = useState<SignatureForm[]>(() =>
    buildDefaultSignatures(),
  );
  const [openKey, setOpenKey] = useState<string | null>(
    () => buildDefaultSignatures()[0]?._key ?? null,
  );

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  async function loadSignatures() {
    try {
      const res = await fetchWithAuth(`${API_BASE}/school/signatures`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const merged = mergeSignaturesFromApi(data.signatures ?? []);
      setSignatures(merged);
      setOpenKey((prev) =>
        prev && merged.some((s) => s._key === prev) ? prev : merged[0]?._key ?? null,
      );
    } catch {
      /* les emplacements par défaut restent affichés */
    }
  }

  useEffect(() => {
    if (school) {
      setName(school.name ?? "");
      setSlogan(school.slogan ?? "");
      setDomain(school.domain ?? "");
      setAddress(school.address ?? "");
      setPhone(school.phone ?? "");
      setEmail(school.email ?? "");
      setPrimary_color(school.primary_color ?? "#0f766e");
      setSecondary_color(school.secondary_color ?? "#0d9488");
      setLogo_url(school.logo_url ?? null);
    }
    setLoading(false);
  }, [school]);

  useEffect(() => {
    loadSignatures();
  }, []);

  function updateSignature(key: string, patch: Partial<SignatureForm>) {
    setSignatures((prev) =>
      prev.map((s) => (s._key === key ? { ...s, ...patch } : s)),
    );
  }

  function addSignature() {
    const key = `extra-new-${Date.now()}`;
    const n = signatures.filter((s) => !s.is_fixed).length + 1;
    setSignatures((prev) => [
      ...prev,
      {
        id: null,
        slot_key: EXTRA_SIGNATURE_SLOT,
        signer_name: "",
        signer_role: "",
        image_url: null,
        sort_order: 100 + n,
        is_fixed: false,
        _key: key,
        role_choice: "Autre",
      },
    ]);
    setOpenKey(key);
  }

  function removeSignature(key: string) {
    setSignatures((prev) => {
      const next = prev.filter((s) => s._key !== key);
      if (openKey === key) setOpenKey(next[0]?._key ?? null);
      return next;
    });
  }

  function onRoleChoice(key: string, choice: string, isFixed: boolean) {
    if (isFixed) return;
    if (choice === "Autre") {
      updateSignature(key, { role_choice: "Autre", signer_role: "" });
    } else {
      updateSignature(key, { role_choice: choice, signer_role: choice });
    }
  }

  function toggleAccordion(key: string) {
    setOpenKey((prev) => (prev === key ? null : key));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/school/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          slogan: slogan.trim() || null,
          domain: domain.trim() || null,
          address: address.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          primary_color: primary_color,
          secondary_color: secondary_color,
          logo_url: logo_url,
          signatures: signatures.map((s) => ({
            id: s.id || undefined,
            slot_key: s.slot_key,
            signer_name: s.signer_name,
            signer_role: s.signer_role,
            image_url: s.image_url,
            sort_order: s.sort_order,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      if (Array.isArray(data.signatures)) {
        const merged = mergeSignaturesFromApi(data.signatures);
        setSignatures(merged);
        setOpenKey((prev) =>
          prev && merged.some((s) => s._key === prev) ? prev : merged[0]?._key ?? null,
        );
      }
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="animate-pulse text-slate-500">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Gestion de l&apos;établissement</h2>

      <form onSubmit={handleSubmit} className="p-6 rounded-xl border border-[var(--app-border)] bg-white space-y-6 max-w-3xl">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Nom de l&apos;établissement</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="École Eureka"
            className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Slogan</label>
          <input
            type="text"
            value={slogan}
            onChange={(e) => setSlogan(e.target.value)}
            placeholder="Excellence et discipline"
            className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Adresse de l&apos;école</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="ex: 12, rue de l'École, Port-au-Prince"
            className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="ex: +509 XXXX XXXX"
              className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ex: contact@ecole.com"
              className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Domaine (site web)</label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="https://ecole-eureka.com"
            className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Logo</label>
          <ImageUpload
            value={logo_url ?? undefined}
            onChange={(url) => setLogo_url(url || null)}
            label="Logo de l'établissement"
            token={token}
            crop="none"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Couleur primaire</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={primary_color}
                onChange={(e) => setPrimary_color(e.target.value)}
                className="h-10 w-14 rounded border border-[var(--app-border)] cursor-pointer"
              />
              <input
                type="text"
                value={primary_color}
                onChange={(e) => setPrimary_color(e.target.value)}
                className="flex-1 border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Couleur secondaire</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={secondary_color}
                onChange={(e) => setSecondary_color(e.target.value)}
                className="h-10 w-14 rounded border border-[var(--app-border)] cursor-pointer"
              />
              <input
                type="text"
                value={secondary_color}
                onChange={(e) => setSecondary_color(e.target.value)}
                className="flex-1 border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--app-border)] pt-6 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900">Signatures</h3>
            <button type="button" onClick={addSignature} className="app-btn-secondary text-sm">
              Ajouter
            </button>
          </div>

          <div className="rounded-xl border border-[var(--app-border)] overflow-hidden divide-y divide-[var(--app-border)]">
            {signatures.map((sig) => {
              const open = openKey === sig._key;
              const label = displayRoleLabel(sig);
              return (
                <div key={sig._key} className="bg-white">
                  <button
                    type="button"
                    onClick={() => toggleAccordion(sig._key)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                  >
                    <svg
                      className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="flex-1 text-sm font-medium text-slate-900 truncate">{label}</span>
                    {sig.signer_name ? (
                      <span className="hidden sm:inline text-xs text-slate-500 truncate max-w-[140px]">
                        {sig.signer_name}
                      </span>
                    ) : null}
                    {sig.image_url ? (
                      <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="PNG déposé" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" title="Sans image" />
                    )}
                  </button>

                  {open && (
                    <div className="px-4 pb-4 pt-1 space-y-3 bg-slate-50/60 border-t border-[var(--app-border)]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Rôle</label>
                          {sig.is_fixed ? (
                            <input
                              type="text"
                              value={sig.signer_role}
                              readOnly
                              className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm bg-slate-100 text-slate-700"
                            />
                          ) : (
                            <select
                              value={sig.role_choice}
                              onChange={(e) => onRoleChoice(sig._key, e.target.value, false)}
                              className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
                            >
                              {ROLE_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          )}
                        </div>
                        {!sig.is_fixed && sig.role_choice === "Autre" && (
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Préciser</label>
                            <input
                              type="text"
                              value={sig.signer_role}
                              onChange={(e) => updateSignature(sig._key, { signer_role: e.target.value })}
                              placeholder="Rôle"
                              className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Nom</label>
                          <input
                            type="text"
                            value={sig.signer_name}
                            onChange={(e) => updateSignature(sig._key, { signer_name: e.target.value })}
                            placeholder="Prénom Nom"
                            className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
                          />
                        </div>
                      </div>

                      <ImageUpload
                        value={sig.image_url}
                        onChange={(url) => updateSignature(sig._key, { image_url: url || null })}
                        label="Signature PNG"
                        buttonLabel="Déposer le PNG"
                        accept="image/png"
                        token={token}
                        crop="none"
                        previewClassName="h-14 max-w-[180px] object-contain rounded-lg border border-slate-200 bg-[repeating-conic-gradient(#e2e8f0_0%_25%,#fff_0%_50%)] bg-[length:12px_12px]"
                      />

                      {!sig.is_fixed && (
                        <button
                          type="button"
                          onClick={() => removeSignature(sig._key)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          Retirer
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={saving} className="app-btn-primary disabled:opacity-60">
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </form>
    </div>
  );
}
