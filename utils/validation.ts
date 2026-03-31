/**
 * Input validation utilities for EcoNexo
 */

// Validate Chilean RUT format (XX.XXX.XXX-X or XXXXXXXX-X)
export const validateRut = (rut: string): boolean => {
  const cleaned = rut.replace(/\./g, '').replace(/-/g, '');
  if (cleaned.length < 8 || cleaned.length > 9) return false;

  const body = cleaned.slice(0, -1);
  const verifier = cleaned.slice(-1).toUpperCase();

  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  const expectedVerifier = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);

  return verifier === expectedVerifier;
};

// Format RUT as XX.XXX.XXX-X
export const formatRut = (value: string): string => {
  const cleaned = value.replace(/[^0-9kK]/g, '');
  if (cleaned.length <= 1) return cleaned;

  const body = cleaned.slice(0, -1);
  const verifier = cleaned.slice(-1);

  // Add dots
  let formatted = '';
  for (let i = body.length - 1, count = 0; i >= 0; i--, count++) {
    if (count > 0 && count % 3 === 0) formatted = '.' + formatted;
    formatted = body[i] + formatted;
  }

  return `${formatted}-${verifier}`;
};

// Validate password strength
export const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (password.length < 8) errors.push('Mínimo 8 caracteres');
  if (!/[A-Z]/.test(password)) errors.push('Al menos una mayúscula');
  if (!/[a-z]/.test(password)) errors.push('Al menos una minúscula');
  if (!/[0-9]/.test(password)) errors.push('Al menos un número');

  return { valid: errors.length === 0, errors };
};

// Validate email format
export const validateEmail = (email: string): boolean => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// Validate Chilean phone number
export const validatePhone = (phone: string): boolean => {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  return /^(\+?56)?9\d{8}$/.test(cleaned);
};

// Strip HTML tags from a string (simple sanitization)
export const stripHtml = (html: string): string => {
  return html.replace(/<[^>]*>/g, '');
};
