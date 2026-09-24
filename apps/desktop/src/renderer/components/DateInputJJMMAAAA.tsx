import { useEffect, useRef, useState } from "react";
import { parseJJMMAAAAToIso, toDisplayDateJJMMAAAA } from "@/lib/format";

type Props = {
  value: string;
  onChange: (isoDate: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  required?: boolean;
  min?: string;
  max?: string;
};

function maskJjMmAaaa(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isRealIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * Saisie Haiti : JJ/MM/AAAA. Valeur API : YYYY-MM-DD.
 * Le calendrier natif Windows affiche mm/dd — on n’en dépend plus pour l’affichage.
 */
export function DateInputJJMMAAAA({
  value,
  onChange,
  placeholder = "JJ/MM/AAAA",
  id,
  className = "",
  required = false,
  min,
  max,
}: Props) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => toDisplayDateJJMMAAAA(value));

  useEffect(() => {
    setText(toDisplayDateJJMMAAAA(value));
  }, [value]);

  function emitIso(iso: string) {
    onChange(iso);
  }

  function applyTyped(raw: string) {
    const next = maskJjMmAaaa(raw);
    setText(next);
    if (!next) {
      emitIso("");
      return;
    }
    const iso = parseJJMMAAAAToIso(next);
    if (iso && isRealIsoDate(iso)) emitIso(iso);
  }

  function finishTyping() {
    if (!text.trim()) {
      emitIso("");
      setText("");
      return;
    }
    const iso = parseJJMMAAAAToIso(text);
    if (iso && isRealIsoDate(iso)) {
      setText(toDisplayDateJJMMAAAA(iso));
      emitIso(iso);
      return;
    }
    setText(toDisplayDateJJMMAAAA(value));
  }

  function openCalendar() {
    const el = nativeRef.current;
    if (!el) return;
    try {
      el.showPicker?.();
    } catch {
      el.click();
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        lang="fr-HT"
        id={id}
        placeholder={placeholder}
        value={text}
        required={required}
        onChange={(e) => applyTyped(e.target.value)}
        onBlur={finishTyping}
        className={`${className} pr-10`.trim()}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={openCalendar}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 hover:text-slate-800"
        title="Calendrier"
        aria-label="Ouvrir le calendrier"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
          <path
            fillRule="evenodd"
            d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm8 6H6v7h8V8Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      <input
        ref={nativeRef}
        type="date"
        lang="fr-HT"
        value={value || ""}
        min={min || undefined}
        max={max || undefined}
        onChange={(e) => emitIso(e.target.value)}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        tabIndex={-1}
        aria-hidden
      />
    </div>
  );
}
