/**
 * Definição dos planos. Mantida como config estática (não em tabela no banco)
 * porque muda pouco e assim fica fácil revisar/versionar no código — se um dia
 * precisar editar preço/limite sem deploy, migra pra uma tabela `plans`.
 */
export type PlanKey = 'free' | 'entry' | 'medium' | 'power';

export interface PlanLimits {
  /** null = ilimitado */
  maxOrdersPerMonth: number | null;
  maxPhotosPerAttendance: number | null;
  maxUsers: number;
}

export interface PlanFeatures {
  financialReports: boolean;
  pdfExport: boolean;
  clientNotifications: boolean;
  multiUser: boolean;
  api: boolean;
  whiteLabel: boolean;
}

export interface Plan {
  key: PlanKey;
  name: string;
  priceCents: number; // preço mensal em centavos, 0 = grátis
  limits: PlanLimits;
  features: PlanFeatures;
}

export const PLANS: Record<PlanKey, Plan> = {
  free: {
    key: 'free',
    name: 'Grátis',
    priceCents: 0,
    limits: { maxOrdersPerMonth: 15, maxPhotosPerAttendance: 2, maxUsers: 1 },
    features: {
      financialReports: false,
      pdfExport: false,
      clientNotifications: false,
      multiUser: false,
      api: false,
      whiteLabel: false,
    },
  },
  entry: {
    key: 'entry',
    name: 'Entrada',
    priceCents: 2900,
    limits: { maxOrdersPerMonth: null, maxPhotosPerAttendance: null, maxUsers: 1 },
    features: {
      financialReports: true,
      pdfExport: true,
      clientNotifications: false,
      multiUser: false,
      api: false,
      whiteLabel: false,
    },
  },
  medium: {
    key: 'medium',
    name: 'Médio',
    priceCents: 7900,
    limits: { maxOrdersPerMonth: null, maxPhotosPerAttendance: null, maxUsers: 5 },
    features: {
      financialReports: true,
      pdfExport: true,
      clientNotifications: true,
      multiUser: true,
      api: false,
      whiteLabel: false,
    },
  },
  power: {
    key: 'power',
    name: 'Power',
    priceCents: 19900,
    limits: { maxOrdersPerMonth: null, maxPhotosPerAttendance: null, maxUsers: Infinity as unknown as number },
    features: {
      financialReports: true,
      pdfExport: true,
      clientNotifications: true,
      multiUser: true,
      api: true,
      whiteLabel: true,
    },
  },
};

export function getPlan(key: string | null | undefined): Plan {
  return PLANS[(key as PlanKey) in PLANS ? (key as PlanKey) : 'free'];
}
