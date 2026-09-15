import { useState } from "react";

export function MaterialCatalogPicker({
  catalog,
  selected,
  onToggle,
  onCreate,
}: {
  catalog: string[];
  selected: string[];
  onToggle: (label: string) => void;
  onCreate: (label: string) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const name = draft.trim().replace(/\s+/g, " ");
    if (!name) return;
    onCreate(name);
    setDraft("");
  }

  return (
    <div className="space-y-1.5">
      {catalog.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {catalog.map((label) => {
            const on = selected.some((x) => x.toLowerCase() === label.toLowerCase());
            return (
              <button
                key={label}
                type="button"
                onClick={() => onToggle(label)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
                  on
                    ? "bg-teal-700 text-white ring-teal-700"
                    : "bg-white text-slate-700 ring-slate-200"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            add();
          }}
          className="class-input min-w-0 flex-1 bg-white"
        />
        <button type="button" onClick={add} className="app-btn-secondary shrink-0 text-xs">
          Ajouter
        </button>
      </div>
    </div>
  );
}
