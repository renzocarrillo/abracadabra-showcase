// Códigos de país disponibles
export const COUNTRY_CODES = [
  { code: '+51', country: 'Perú', flag: '🇵🇪' },
  { code: '+1', country: 'Estados Unidos', flag: '🇺🇸' },
  { code: '+52', country: 'México', flag: '🇲🇽' },
  { code: '+591', country: 'Bolivia', flag: '🇧🇴' },
  { code: '+593', country: 'Ecuador', flag: '🇪🇨' },
  { code: '+58', country: 'Venezuela', flag: '🇻🇪' },
  { code: '+56', country: 'Chile', flag: '🇨🇱' },
  { code: '+57', country: 'Colombia', flag: '🇨🇴' }
];

/**
 * Normaliza un número de teléfono eliminando espacios, guiones y caracteres especiales
 * mantiene solo números y el signo +
 */
export function cleanPhoneNumber(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

/**
 * Detecta si un número ya tiene código de país
 */
export function hasCountryCode(phone: string): boolean {
  const cleaned = cleanPhoneNumber(phone);
  return cleaned.startsWith('+') || cleaned.length > 9;
}

/**
 * Extrae el código de país de un número si lo tiene
 */
export function extractCountryCode(phone: string): string | null {
  const cleaned = cleanPhoneNumber(phone);
  
  if (cleaned.startsWith('+51')) return '+51';
  if (cleaned.startsWith('+1')) return '+1';
  if (cleaned.startsWith('+52')) return '+52';
  if (cleaned.startsWith('+591')) return '+591';
  if (cleaned.startsWith('+593')) return '+593';
  if (cleaned.startsWith('+58')) return '+58';
  if (cleaned.startsWith('+56')) return '+56';
  if (cleaned.startsWith('+57')) return '+57';
  
  // Si empieza con 51 sin +, asumimos que es Perú
  if (cleaned.startsWith('51') && cleaned.length >= 10) return '+51';
  
  return null;
}

/**
 * Normaliza un número de teléfono agregando el código de país por defecto si no lo tiene
 */
export function normalizePhoneNumber(phone: string, defaultCountryCode: string = '+51'): string {
  if (!phone) return '';
  
  const cleaned = cleanPhoneNumber(phone);
  if (!cleaned) return '';
  
  // Si ya tiene código de país, devolverlo tal como está
  const existingCode = extractCountryCode(phone);
  if (existingCode) {
    return cleaned;
  }
  
  // Si no tiene código de país, agregarlo
  return `${defaultCountryCode}${cleaned}`;
}

/**
 * Formatea un número para mostrarlo de manera más legible
 * Ejemplo: +51970851401 -> +51 970 851 401
 */
export function formatPhoneForDisplay(phone: string): string {
  const cleaned = cleanPhoneNumber(phone);
  if (!cleaned) return '';
  
  // Si es peruano (+51)
  if (cleaned.startsWith('+51') && cleaned.length === 12) {
    const number = cleaned.slice(3); // Remover +51
    return `+51 ${number.slice(0, 3)} ${number.slice(3, 6)} ${number.slice(6)}`;
  }
  
  // Para otros países, formato genérico
  if (cleaned.startsWith('+')) {
    const parts = cleaned.slice(1);
    if (parts.length >= 8) {
      const countryCode = parts.slice(0, -9);
      const number = parts.slice(-9);
      return `+${countryCode} ${number.slice(0, 3)} ${number.slice(3, 6)} ${number.slice(6)}`;
    }
  }
  
  return cleaned;
}

/**
 * Obtiene solo el número sin código de país
 */
export function getPhoneNumberOnly(phone: string): string {
  const cleaned = cleanPhoneNumber(phone);
  const countryCode = extractCountryCode(phone);
  
  if (countryCode) {
    return cleaned.replace(countryCode, '');
  }
  
  return cleaned;
}