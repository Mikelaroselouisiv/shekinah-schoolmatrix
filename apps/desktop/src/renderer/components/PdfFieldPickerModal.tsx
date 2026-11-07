export type PdfFieldGroup = {
  label: string;
  options: { id: string; label: string }[];
};

export function PdfFieldPickerModal({
  title,
  groups,
  selected,
  busy,
  onChange,
  onCancel,
  onConfirm,
}: {
  title: string;
  groups: PdfFieldGroup[];
  selected: Set<string>;
  busy?: boolean;
  onChange: (next: Set<string>) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const allIds = groups.flatMap((g) => g.options.map((o) => o.id));
  const allOn = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button type="button" onClick={onCancel} disabled={busy} className="text-sm font-medium text-slate-500">
            Fermer
          </button>
        </div>
        <div className="flex items-center justify-end px-5 pt-3">
          <button
            type="button"
            className="text-xs font-medium text-teal-800"
            onClick={() => onChange(allOn ? new Set() : new Set(allIds))}
          >
            {allOn ? "Aucun" : "Tout"}
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 py-3">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{group.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.options.map((option) => {
                  const on = selected.has(option.id);
                  return (
                    <label
                      key={option.id}
                      className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                        on ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-slate-600 ring-slate-200"
                      }`}
                    >
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(option.id)} />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onCancel} disabled={busy} className="app-btn-secondary text-sm py-2">
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || selected.size === 0}
            className="app-btn-primary text-sm py-2 disabled:opacity-60"
          >
            {busy ? "Génération..." : "Exporter"}
          </button>
        </div>
      </div>
    </div>
  );
}
