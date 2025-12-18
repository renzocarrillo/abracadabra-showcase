import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ValidateAndSignResult {
  success: boolean;
  signerName?: string;
  signedAt?: string;
  error?: string;
}

interface PinValidationResult {
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  is_valid: boolean;
}

export const useSignaturePin = () => {
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [isLocked, setIsLocked] = useState(false);
  const [lockUntil, setLockUntil] = useState<Date | null>(null);
  const { user } = useAuth();

  // Check if rate limited
  const checkRateLimit = useCallback((): boolean => {
    if (lockUntil && lockUntil > new Date()) {
      const secondsRemaining = Math.ceil((lockUntil.getTime() - new Date().getTime()) / 1000);
      setError(`Bloqueado. Espera ${secondsRemaining}s`);
      setIsLocked(true);
      return false;
    }
    setIsLocked(false);
    return true;
  }, [lockUntil]);

  // Validate PIN and create signature
  const validateAndSign = useCallback(async (
    pin: string,
    orderId: string,
    orderType: 'pedido' | 'venta' | 'picking_libre',
    orderCode: string,
    reviewNotes?: string,
    overrideSignerName?: string,
    overrideSignerId?: string
  ): Promise<ValidateAndSignResult> => {
    if (!checkRateLimit()) {
      return { success: false, error: error || 'Demasiados intentos' };
    }

    setIsValidating(true);
    setError(null);

    try {
      // Step 1: Validate PIN via RPC
      const { data: validationData, error: validationError } = await supabase
        .rpc('validate_signature_pin', { p_pin: pin })
        .single();

      if (validationError) {
        console.error('Error validating PIN:', validationError);
        throw new Error('Error al validar PIN');
      }

      const validation = validationData as unknown as PinValidationResult;

      console.log('PIN validation result:', { 
        is_valid: validation.is_valid, 
        user_id: validation.user_id,
        user_name: validation.user_name,
        current_session_user: user?.id
      });

      if (!validation.is_valid || !validation.user_id) {
        // Invalid PIN - decrement attempts
        const newAttempts = attemptsRemaining - 1;
        setAttemptsRemaining(newAttempts);
        
        if (newAttempts <= 0) {
          // Lock for 30 seconds
          const lockTime = new Date(Date.now() + 30000);
          setLockUntil(lockTime);
          setIsLocked(true);
          setError('Demasiados intentos. Bloqueado por 30s');
          setAttemptsRemaining(3); // Reset for next time
          
          // Auto-unlock after 30 seconds
          setTimeout(() => {
            setLockUntil(null);
            setIsLocked(false);
            setError(null);
          }, 30000);
        } else {
          setError(`PIN incorrecto. Intentos restantes: ${newAttempts}`);
        }

        // Log failed attempt (using RPC to bypass RLS)
        await supabase.rpc('log_signature_attempt', {
          p_user_id: user?.id,
          p_action: 'SIGNATURE_PIN_FAILED',
          p_table_name: 'order_signatures',
          p_record_id: orderId,
          p_details: {
            order_code: orderCode,
            order_type: orderType,
            attempts_remaining: newAttempts
          }
        });

        return { success: false, error: `PIN incorrecto. Intentos restantes: ${newAttempts}` };
      }

      // Step 2: Generate signature hash
      const signedAt = new Date().toISOString();
      const { data: hashData, error: hashError } = await supabase.rpc(
        'generate_signature_hash',
        {
          p_order_id: orderId,
          p_order_type: orderType,
          p_signed_by: validation.user_id,
          p_signed_at: signedAt
        }
      );

      if (hashError) {
        console.error('Error generating signature hash:', hashError);
        throw new Error('Error al generar firma');
      }

      // Step 3: Create signature record with picker override if provided
      const { error: signatureError } = await supabase
        .from('order_signatures')
        .insert({
          order_id: orderId,
          order_type: orderType,
          order_code: orderCode,
          signed_by: validation.user_id,
          signed_by_name: overrideSignerName || validation.user_name || validation.user_email || 'Usuario',
          signed_at: signedAt,
          review_notes: reviewNotes || null,
          signature_hash: hashData
        });

      if (signatureError) {
        console.error('Error creating signature:', signatureError);
        throw new Error('Error al crear firma');
      }

      // Step 4: Log successful signature (using RPC to bypass RLS)
      await supabase.rpc('log_signature_attempt', {
        p_user_id: validation.user_id,
        p_action: 'SIGNATURE_PIN_SUCCESS',
        p_table_name: 'order_signatures',
        p_record_id: orderId,
        p_details: {
          order_code: orderCode,
          order_type: orderType,
          signer_name: validation.user_name
        }
      });

      // Reset attempts on success
      setAttemptsRemaining(3);
      setError(null);

      return {
        success: true,
        signerName: overrideSignerName || validation.user_name || validation.user_email || 'Usuario',
        signedAt: signedAt
      };

    } catch (err: any) {
      const errorMessage = err.message || 'Error desconocido';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsValidating(false);
    }
  }, [attemptsRemaining, checkRateLimit, error, user]);

  // Check if current user has PIN configured
  const checkUserHasPin = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('user_has_signature_pin');
      
      if (error) {
        console.error('Error checking PIN status:', error);
        return false;
      }

      return data || false;
    } catch (err) {
      console.error('Error checking PIN status:', err);
      return false;
    }
  }, []);

  // Check if current user can sign with PIN
  const checkCanSignWithPin = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('can_sign_with_pin');
      
      if (error) {
        console.error('Error checking signing permissions:', error);
        return false;
      }

      return data || false;
    } catch (err) {
      console.error('Error checking signing permissions:', err);
      return false;
    }
  }, []);

  // Reset attempts manually
  const resetAttempts = useCallback(() => {
    setAttemptsRemaining(3);
    setIsLocked(false);
    setLockUntil(null);
    setError(null);
  }, []);

  return {
    validateAndSign,
    checkUserHasPin,
    checkCanSignWithPin,
    resetAttempts,
    isValidating,
    error,
    attemptsRemaining,
    isLocked,
    lockUntil
  };
};
