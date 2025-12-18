import { AlertCircle } from 'lucide-react';
import { useEffect } from 'react';
import { audioService } from '@/lib/audioService';

interface ErrorOverlayProps {
  message: string;
  onClose?: () => void;
}

export function ErrorOverlay({ message, onClose }: ErrorOverlayProps) {
  useEffect(() => {
    // Reproducir sonido de error usando el servicio centralizado
    audioService.playErrorBeep();

    // Auto-cerrar después de 2 segundos
    const timer = setTimeout(() => {
      onClose?.();
    }, 2000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-destructive/95 flex items-center justify-center animate-pulse">
      <div className="text-center text-destructive-foreground p-8 max-w-md">
        <AlertCircle className="h-24 w-24 mx-auto mb-4" />
        <h2 className="text-4xl font-bold mb-2">¡ERROR!</h2>
        <p className="text-2xl">{message}</p>
      </div>
    </div>
  );
}
