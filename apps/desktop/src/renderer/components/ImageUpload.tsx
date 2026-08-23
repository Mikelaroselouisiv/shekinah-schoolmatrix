import { useEffect, useRef, useState } from "react";
import { API_BASE, getImageUrl, initApi } from "@/services/api";
import { SquareCropModal } from "@/components/SquareCropModal";

type ImageUploadProps = {
  /** Valeur actuelle (URL GCS publique ou legacy uploads/xxx.jpg) */
  value?: string | null;
  /** Callback avec le nouveau chemin après upload */
  onChange: (url: string) => void;
  /** Label affiché au-dessus du champ */
  label?: string;
  /** Texte du bouton */
  buttonLabel?: string;
  /** Accept attribute (défaut: images) */
  accept?: string;
  /** Désactivé */
  disabled?: boolean;
  /** Token JWT pour l'API */
  token: string | null;
  /** Classe CSS pour le conteneur de l'aperçu */
  previewClassName?: string;
  /**
   * Recadrage avant envoi.
   * - square (défaut) : photos identité / profil → JPEG carré
   * - none : logo, signature PNG, etc.
   */
  crop?: "square" | "none";
};

export function ImageUpload({
  value,
  onChange,
  label = "Image",
  buttonLabel = "Choisir une image (bibliothèque / appareil)",
  accept = "image/jpeg,image/png,image/gif,image/webp,image/svg+xml",
  disabled = false,
  token,
  previewClassName = "w-24 h-24 rounded-lg object-cover border border-slate-200",
  crop = "square",
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  const imageUrl = getImageUrl(value ?? undefined);

  async function uploadFile(file: File) {
    if (!token) return;
    setError(null);
    setUploading(true);
    try {
      await initApi();
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/uploads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "Échec de l’upload");
        return;
      }
      if (data.url) onChange(data.url);
    } catch {
      setError("Erreur réseau");
    } finally {
      setUploading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !token) return;
    setError(null);

    if (crop === "square") {
      const url = URL.createObjectURL(file);
      setCropSrc(url);
      return;
    }

    void uploadFile(file);
  }

  function closeCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function handleCropConfirm(file: File) {
    closeCrop();
    await uploadFile(file);
  }

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-slate-600">{label}</label>
      )}
      <div className="flex items-start gap-3 flex-wrap">
        {imageUrl && (
          <div className="flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Aperçu"
              className={previewClassName}
            />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={handleFileSelect}
            disabled={disabled || uploading}
          />
          <button
            type="button"
            className="border border-slate-300 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
          >
            {uploading ? "Envoi…" : buttonLabel}
          </button>
          {value && (
            <button
              type="button"
              className="text-sm text-slate-500 hover:text-red-600"
              onClick={() => onChange("")}
              disabled={disabled}
            >
              Supprimer l’image
            </button>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>

      {cropSrc && (
        <SquareCropModal
          src={cropSrc}
          onCancel={closeCrop}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}
