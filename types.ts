
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
