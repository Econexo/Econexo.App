
export interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface WasteBreakdown {
  label: string;
  value: number;
  color: string;
  icon: string;
}

export interface UserProfile {
  name: string;
  email: string;
  role: string;
  phone: string;
}

export interface CompanyProfile {
  name: string;
  rut: string;
  address: string;
  companyEmail: string;
  industry: string;
  declaroLeyRep: boolean;
  size?: 'Pequeña' | 'Mediana' | 'Grande' | 'Corporativa';
  wasteTypes?: string[];
  workersCount?: number;
  certifications?: string[];
}

export interface DocumentInfo {
  id: string;
  title: string;
  date: string;
  size: string;
  type: 'pdf' | 'legal' | 'image';
  verified: boolean;
  driveUrl: string;
}

/** Preferencias del barrido diario de recordatorios (columna profiles.reminder_prefs). */
export interface ReminderPrefs {
  /** Interruptor general de los avisos automáticos. */
  enabled: boolean;
  /** Días de antelación con que avisar de un retiro (0 = el mismo día). */
  withdrawal_days_before: number[];
  /** Día del mes (1-28) en que se avisa del certificado del mes anterior. */
  certificate_day: number;
  /** Si los correos adicionales reciben también los recordatorios. */
  copy_extra_emails: boolean;
}

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  enabled: true,
  withdrawal_days_before: [3, 1],
  certificate_day: 5,
  copy_extra_emails: true,
};

/** Un material dentro del desglose mensual de residuos recuperados. */
export interface MonthlyMaterialRow {
  material: string;
  kg: number;
  share: number;      // % del total del mes
  co2: number;        // kg CO2e evitados
  water: number;      // litros ahorrados
  energy: number;     // kWh ahorrados
  repCategory: string | null;
}
