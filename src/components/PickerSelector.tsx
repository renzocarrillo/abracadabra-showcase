import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { User } from 'lucide-react';

interface PickerSelectorProps {
  selectedPickerId: string | null;
  selectedPickerName: string | null;
  onPickerChange: (pickerId: string, pickerName: string) => void;
  currentUserId: string;
  currentUserName: string;
  currentUserType: string | null;
}

interface PickerData {
  id: string;
  full_name: string;
  user_types: {
    name: string;
    is_admin: boolean;
  };
}

export default function PickerSelector({
  selectedPickerId,
  selectedPickerName,
  onPickerChange,
  currentUserId,
  currentUserName,
  currentUserType
}: PickerSelectorProps) {
  const isAdminOrSupervisor = currentUserType === 'admin' || currentUserType === 'supervisor';
  
  const { data: availablePickers, isLoading } = useQuery({
    queryKey: ['available-pickers', currentUserType, currentUserId],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          user_types!inner(name, is_admin)
        `)
        .is('deleted_at', null);

      // Si es admin o supervisor, incluir pickers + sí mismo
      if (isAdminOrSupervisor) {
        query = query.or(`user_types.name.eq.picker,id.eq.${currentUserId}`);
      } else {
        // Si es picker u otro, solo mostrar pickers
        query = query.eq('user_types.name', 'picker');
      }

      const { data, error } = await query.order('full_name');
      
      if (error) throw error;
      return data as PickerData[];
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
  });

  // Set default to current user if not already set
  useEffect(() => {
    if (!selectedPickerId && currentUserId && currentUserName && availablePickers) {
      onPickerChange(currentUserId, currentUserName);
    }
  }, [selectedPickerId, currentUserId, currentUserName, availablePickers]);

  const handlePickerChange = (pickerId: string) => {
    const picker = availablePickers?.find(p => p.id === pickerId);
    if (picker) {
      onPickerChange(picker.id, picker.full_name);
    }
  };

  return (
    <Card className="p-4 bg-card border-border">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-muted-foreground" />
          <Label className="text-base font-semibold">
            Seleccionar Picker
          </Label>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="picker-select" className="text-sm text-muted-foreground">
            ¿Quién realizó el picking?
          </Label>
          
          <Select
            value={selectedPickerId || undefined}
            onValueChange={handlePickerChange}
            disabled={isLoading}
          >
            <SelectTrigger id="picker-select" className="w-full">
              <SelectValue placeholder="Seleccionar picker..." />
            </SelectTrigger>
            <SelectContent>
              {availablePickers?.map((picker) => (
                <SelectItem key={picker.id} value={picker.id}>
                  {picker.id === currentUserId ? (
                    <div className="flex items-center gap-2">
                      <span>{picker.full_name}</span>
                      <Badge variant="outline" className="text-xs">
                        Yo mismo
                      </Badge>
                    </div>
                  ) : (
                    picker.full_name
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedPickerName && (
            <div className="flex items-center gap-2 pt-2">
              <span className="text-sm text-muted-foreground">Picker seleccionado:</span>
              <Badge variant="secondary" className="font-medium">
                {selectedPickerName}
              </Badge>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Esta información se registrará en los documentos y tickets generados.
        </p>
      </div>
    </Card>
  );
}
