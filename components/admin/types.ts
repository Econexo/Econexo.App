// Shared types for Admin panel components

export interface AdminUserProfile {
    id: string;
    company_name: string;
    rut: string;
    address: string;
    is_admin?: boolean;
    company_email?: string;
    is_unregistered?: boolean;
    is_active?: boolean;
    phone?: string;
    workers_count?: number;
    company_size?: string;
    waste_types?: string[];
}

export interface AdminDocument {
    id: string;
    title: string;
    user_id: string;
    verified: boolean;
    created_at: string;
    type?: string;
    content_url?: string;
    metadata?: any;
    profiles?: {
        company_name: string;
        rut: string;
        address: string;
    };
    _clientId?: string;
    _companyName?: string;
    _isUnregistered?: boolean;
}

export interface SupportTicket {
    id: string;
    user_id: string;
    subject: string;
    description: string;
    status: string;
    created_at: string;
    profiles?: {
        company_name: string;
        rut?: string;
    };
}

export interface WasteItem {
    waste_type: string;
    description: string;
    quantity: number;
    unit: string;
}

export interface AdminPath {
    level: 'home' | 'history_companies' | 'history_years' | 'history_months' | 'history_files' | 'monthly_gen_users';
    companyId?: string;
    companyName?: string;
    year?: number;
    month?: number;
}

export const WASTE_CATEGORIES = [
    { label: 'Plásticos', value: 'Plásticos' },
    { label: 'Papel/Cartón', value: 'Papel/Cartón' },
    { label: 'Vidrio', value: 'Vidrio' },
    { label: 'Metales', value: 'Metales' },
    { label: 'Electrónicos (RAEE)', value: 'Electrónicos' },
    { label: 'Peligrosos', value: 'Peligrosos' },
    { label: 'Orgánicos', value: 'Orgánicos' },
    { label: 'Aceites', value: 'Aceites' },
    { label: 'Madera', value: 'Madera' },
    { label: 'Textiles', value: 'Textiles' },
    { label: 'Neumáticos/Caucho', value: 'Neumáticos' },
    { label: 'Otros', value: 'Otros' },
];

export const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
