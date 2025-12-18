import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COUNTRY_CODES, normalizePhoneNumber, extractCountryCode, cleanPhoneNumber } from '@/lib/phone-utils';

interface PhoneInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function PhoneInput({ value = '', onChange, placeholder = "999 999 999", className }: PhoneInputProps) {
  // Detectar el código de país y número desde el valor inicial
  const getInitialValues = (phoneValue: string) => {
    if (!phoneValue) return { code: '+51', number: '' };
    
    const cleaned = cleanPhoneNumber(phoneValue);
    const detectedCode = extractCountryCode(phoneValue);
    
    if (detectedCode) {
      // Remover el código de país (sin el +) del número limpio
      const codeWithoutPlus = detectedCode.replace('+', '');
      let numberPart = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
      
      if (numberPart.startsWith(codeWithoutPlus)) {
        numberPart = numberPart.slice(codeWithoutPlus.length);
      }
      
      return { code: detectedCode, number: numberPart };
    }
    
    // Si no tiene código, asumir que es solo el número
    return { code: '+51', number: cleaned };
  };

  const initial = getInitialValues(value);
  const [countryCode, setCountryCode] = useState(initial.code);
  const [phoneNumber, setPhoneNumber] = useState(initial.number);

  // Actualizar cuando cambie el valor externo
  useEffect(() => {
    const newInitial = getInitialValues(value);
    setCountryCode(newInitial.code);
    setPhoneNumber(newInitial.number);
  }, [value]);

  const handlePhoneNumberChange = (newPhoneNumber: string) => {
    // Limpiar input: solo números
    const cleanNumber = newPhoneNumber.replace(/[^\d]/g, '');
    setPhoneNumber(cleanNumber);
    
    // Enviar el número completo normalizado
    if (cleanNumber) {
      const fullPhone = `${countryCode}${cleanNumber}`;
      onChange?.(fullPhone);
    } else {
      onChange?.('');
    }
  };

  const handleCountryCodeChange = (newCountryCode: string) => {
    setCountryCode(newCountryCode);
    
    // Actualizar el número completo con el nuevo código
    if (phoneNumber) {
      const fullPhone = `${newCountryCode}${phoneNumber}`;
      onChange?.(fullPhone);
    }
  };

  // Formatear el número para display (sin el código de país)
  const formatNumberForDisplay = (number: string) => {
    if (!number) return '';
    // Formatear solo el número sin código de país
    if (number.length >= 6) {
      return `${number.slice(0, 3)} ${number.slice(3, 6)} ${number.slice(6)}`;
    } else if (number.length >= 3) {
      return `${number.slice(0, 3)} ${number.slice(3)}`;
    }
    return number;
  };

  return (
    <div className={`flex ${className || ''}`}>
      <Select value={countryCode} onValueChange={handleCountryCodeChange}>
        <SelectTrigger className="w-24 rounded-r-none border-r-0 focus:z-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COUNTRY_CODES.map((country) => (
            <SelectItem key={country.code} value={country.code}>
              <div className="flex items-center gap-2">
                <span>{country.flag}</span>
                <span className="text-xs">{country.code}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="tel"
        placeholder={placeholder}
        value={formatNumberForDisplay(phoneNumber)}
        onChange={(e) => handlePhoneNumberChange(e.target.value)}
        className="rounded-l-none focus:z-10"
      />
    </div>
  );
}