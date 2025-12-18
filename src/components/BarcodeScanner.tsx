import { Input } from '@/components/ui/input';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  placeholder?: string;
  disabled?: boolean;
  expectedCode?: string;
}

export function BarcodeScanner({ onScan, placeholder = "Escanee código...", disabled, expectedCode }: BarcodeScannerProps) {
  const [inputValue, setInputValue] = useState('');
  const [lastScanTime, setLastScanTime] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Beep sound removed - now handled by the scanning logic after validation

  useEffect(() => {
    // Auto-focus the input
    const focusInput = () => {
      if (inputRef.current && !disabled) {
        inputRef.current.focus();
      }
    };

    focusInput();
    
    // Re-focus when clicking anywhere on screen
    const handleClick = () => focusInput();
    document.addEventListener('click', handleClick);
    
    return () => document.removeEventListener('click', handleClick);
  }, [disabled]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      const now = Date.now();
      const timeDiff = now - lastScanTime;
      
      // Beep is now handled by the scanning logic after successful validation
      onScan(inputValue.trim());
      setInputValue('');
      setLastScanTime(now);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "text-lg py-3 text-center font-mono",
          expectedCode && "border-primary ring-1 ring-primary/20"
        )}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {expectedCode && (
        <div className="absolute -bottom-6 left-0 right-0 text-xs text-muted-foreground text-center">
          Esperando: {expectedCode}
        </div>
      )}
    </div>
  );
}