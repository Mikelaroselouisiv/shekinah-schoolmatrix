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

/**
 * Sélecteur date (calendrier natif). Valeur API : YYYY-MM-DD.
 */
export function DateInputJJMMAAAA({
  value,
  onChange,
  id,
  className = "",
  required = false,
  min,
  max,
}: Props) {
  return (
    <input
      type="date"
      id={id}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      required={required}
      min={min || undefined}
      max={max || undefined}
    />
  );
}
