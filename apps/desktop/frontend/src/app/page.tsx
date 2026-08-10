"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSchoolProfileOptional } from "@/src/contexts/SchoolProfileContext";

export default function HomePage() {
  const ctx = useSchoolProfileOptional();
  const router = useRouter();

  useEffect(() => {
    if (!ctx?.loading && ctx?.user) {
      router.replace("/dashboard");
    }
  }, [ctx?.loading, ctx?.user, router]);

  if (ctx?.loading || ctx?.user) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-slate-500">
          {ctx?.user ? "Redirection..." : "Chargement..."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Bienvenue</h2>
      <p className="text-slate-600">
        Bienvenue sur Shekinah SchoolMatrix, le logiciel de gestion scolaire.
      </p>
      <div className="flex gap-3">
        <Link href="/login" className="app-btn-primary">
          Connexion
        </Link>
        <Link href="/signup" className="app-btn-secondary">
          Créer un compte
        </Link>
      </div>
    </div>
  );
}
