/**
 * Référence Plan Comptable Général (PCG) – utilisé pour suggérer le type d'un compte
 * à partir de son code (actif, passif, charge, produit).
 * Comptes de bilan : ACTIF, PASSIF. Comptes de résultat : CHARGE, PRODUIT.
 *
 * Classes PCG :
 * - 1 : Capitaux (passif)
 * - 2 : Actif immobilisé
 * - 3 : Stocks
 * - 4 : Tiers (détail 40-49)
 * - 5 : Comptes financiers
 * - 6 : Charges
 * - 7 : Produits
 * - 8 : Résultat (89)
 */

export type AccountType = 'ACTIF' | 'PASSIF' | 'CHARGE' | 'PRODUIT';

/** Préfixes de compte → type. Les clés les plus longues sont testées en premier (ex. 41 avant 4). */
export const PCG_PREFIX_TYPE: Record<string, AccountType> = {
  // Classe 1 - Capitaux (passif)
  '1': 'PASSIF',
  '10': 'PASSIF', // Capital, primes
  '11': 'PASSIF', // Réserves
  '12': 'PASSIF', // Report à nouveau, résultat
  '13': 'PASSIF', // Écarts de réévaluation
  '14': 'PASSIF', // Subventions
  '15': 'PASSIF', // Provisions réglementées
  '16': 'PASSIF', // Dettes (emprunts, fournisseurs d'immobilisations)
  '17': 'PASSIF', // Dettes rattachées à des participations
  '18': 'PASSIF', // Comptes de liaison
  '19': 'PASSIF', // Provisions pour risques et charges
  // Classe 2 - Actif immobilisé
  '2': 'ACTIF',
  '20': 'ACTIF', // Immobilisations incorporelles
  '21': 'ACTIF', // Immobilisations corporelles
  '22': 'ACTIF', // Terrains, constructions, matériel
  '23': 'ACTIF', // Immobilisations en cours
  '26': 'ACTIF', // Participations
  '27': 'ACTIF', // Autres immobilisations financières
  '28': 'ACTIF', // Amortissements
  // Classe 3 - Stocks
  '3': 'ACTIF',
  '30': 'ACTIF', // Marchandises
  '31': 'ACTIF', // Matières premières
  '34': 'ACTIF', // En-cours
  '35': 'ACTIF', // Produits finis
  '37': 'ACTIF', // Débits / crédits
  '39': 'ACTIF', // Provisions pour dépréciation
  // Classe 4 - Tiers (détail par sous-classe)
  '40': 'PASSIF', // Fournisseurs
  '41': 'ACTIF',  // Clients
  '42': 'PASSIF', // Personnel (dettes)
  '43': 'ACTIF',  // Sécurité sociale, autres débiteurs
  '44': 'PASSIF', // État (TVA, impôts)
  '45': 'PASSIF', // Autres débiteurs / créditeurs
  '46': 'PASSIF', // Débiteurs / créditeurs divers
  '47': 'ACTIF',  // Comptes d'attente
  '48': 'ACTIF',  // Comptes de répartition
  '49': 'ACTIF',  // Provisions pour dépréciation (comptes de tiers)
  '4': 'PASSIF',  // Par défaut si pas de sous-classe reconnue
  // Classe 5 - Comptes financiers
  '5': 'ACTIF',
  '50': 'ACTIF',  // Valeurs mobilières
  '51': 'ACTIF',  // Banque (établissements)
  '52': 'ACTIF',  // Banque (instruments de trésorerie)
  '53': 'ACTIF',  // Caisse
  '54': 'ACTIF',  // Régies d'avance
  '58': 'ACTIF',  // Autres (VMP, etc.)
  // Classe 6 - Charges
  '6': 'CHARGE',
  '60': 'CHARGE', // Achats
  '61': 'CHARGE', // Services extérieurs
  '62': 'CHARGE', // Autres services
  '63': 'CHARGE', // Impôts et taxes
  '64': 'CHARGE', // Charges de personnel
  '65': 'CHARGE', // Autres charges
  '66': 'CHARGE', // Charges financières
  '67': 'CHARGE', // Charges exceptionnelles
  '68': 'CHARGE', // Dotations aux amortissements et provisions
  // Classe 7 - Produits
  '7': 'PRODUIT',
  '70': 'PRODUIT', // Ventes
  '71': 'PRODUIT', // Production stockée
  '72': 'PRODUIT', // Production immobilisée
  '74': 'PRODUIT', // Subventions
  '75': 'PRODUIT', // Autres produits
  '76': 'PRODUIT', // Produits financiers
  '77': 'PRODUIT', // Produits exceptionnels
  '78': 'PRODUIT', // Reprises sur provisions
  // Classe 8 - Comptes de résultat
  '89': 'PASSIF', // Résultat (bénéfice ou perte)
  '8': 'PASSIF',  // Par défaut (comptes spéciaux, résultat)
};

/** Libellés types pour quelques codes courants (suggestion). */
export const PCG_LABEL_SUGGESTIONS: Record<string, string> = {
  '101': 'Capital',
  '129': 'Report à nouveau',
  '164': 'Emprunts',
  '22': 'Immobilisations corporelles',
  '220': 'Terrains',
  '218': 'Matériel',
  '411': 'Clients',
  '401': 'Fournisseurs',
  '421': 'Personnel - Rémunérations dues',
  '431': 'Sécurité sociale',
  '445': 'État - TVA',
  '512': 'Banque',
  '53': 'Caisse',
  '531': 'Caisse',
  '601': 'Achats stockés',
  '606': 'Achats non stockés',
  '611': 'Sous-traitance',
  '614': 'Charges locatives',
  '616': 'Honoraires',
  '625': 'Déplacements',
  '641': 'Rémunérations du personnel',
  '706': 'Prestations de services',
  '701': 'Ventes de marchandises',
  '707': 'Ventes de services',
  '89': 'Résultat de l\'exercice',
};

/**
 * Retourne le type (ACTIF, PASSIF, CHARGE, PRODUIT) et un libellé suggéré pour un code compte.
 * Le code peut être sur 2 à 6 chiffres ; on teste les préfixes du plus long au plus court.
 */
export function suggestAccountFromCode(code: string): { type: AccountType; label_suggestion?: string } {
  const cleaned = String(code).replace(/\s/g, '').replace(/^0+/, '') || '0';
  const digits = cleaned.replace(/\D/g, '');
  if (!digits.length) return { type: 'CHARGE' };

  // Tester les préfixes par longueur décroissante (3 chiffres, 2, 1)
  for (let len = Math.min(3, digits.length); len >= 1; len--) {
    const prefix = digits.slice(0, len);
    const type = PCG_PREFIX_TYPE[prefix];
    if (type) {
      const label = PCG_LABEL_SUGGESTIONS[digits.slice(0, 3)] || PCG_LABEL_SUGGESTIONS[digits.slice(0, 2)] || PCG_LABEL_SUGGESTIONS[digits.slice(0, 1)];
      return { type, label_suggestion: label };
    }
  }
  return { type: 'CHARGE' };
}
