import { CheckCircle } from 'lucide-react';
import { useEffect } from 'react';
import { audioService } from '@/lib/audioService';

interface SuccessOverlayProps {
  message: string;
  onClose?: () => void;
}

export function SuccessOverlay({ message, onClose }: SuccessOverlayProps) {
  useEffect(() => {
    // Reproducir sonido de éxito usando el servicio centralizado
    audioService.playSuccessChime();

    // Auto-cerrar después de 2 segundos
    const timer = setTimeout(() => {
      onClose?.();
    }, 2000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-green-500/95 flex items-center justify-center animate-scale-in">
      <div className="text-center text-white p-8 max-w-md">
        <CheckCircle className="h-24 w-24 mx-auto mb-4 animate-scale-in" />
        <h2 className="text-4xl font-bold mb-2">¡COMPLETADO!</h2>
        <p className="text-2xl">{message}</p>
      </div>
    </div>
  );
}
