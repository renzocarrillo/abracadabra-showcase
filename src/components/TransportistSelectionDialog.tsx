import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus } from "lucide-react";

interface Transportista {
  id: string;
  nombre_empresa: string;
  ruc: string;
}

interface TransportistSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransportistSelected: (transportista: { name: string; ruc: string }) => void;
  onSendToSunat: (transportistId: string) => void;
  loading: boolean;
}

export function TransportistSelectionDialog({
  open,
  onOpenChange,
  onTransportistSelected,
  onSendToSunat,
  loading
}: TransportistSelectionDialogProps) {
  const [transportistas, setTransportistas] = useState<Transportista[]>([]);
  const [selectedTransportista, setSelectedTransportista] = useState<string>('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTransportista, setNewTransportista] = useState({ nombre_empresa: '', ruc: '' });
  const [loadingTransportistas, setLoadingTransportistas] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const { toast } = useToast();

  const fetchTransportistas = async () => {
    setLoadingTransportistas(true);
    try {
      const { data, error } = await supabase
        .from('transportistas')
        .select('*')
        .order('nombre_empresa');

      if (error) throw error;
      setTransportistas(data || []);
    } catch (error) {
      console.error('Error fetching transportistas:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los transportistas",
        variant: "destructive",
      });
    } finally {
      setLoadingTransportistas(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchTransportistas();
      setSelectedTransportista('');
      setShowNewForm(false);
      setNewTransportista({ nombre_empresa: '', ruc: '' });
    }
  }, [open]);

  const handleTransportistaSelection = (value: string) => {
    if (value === 'new') {
      setShowNewForm(true);
      setSelectedTransportista('');
      return;
    }

    const transportista = transportistas.find(t => t.id === value);
    if (transportista) {
      setSelectedTransportista(value);
      setShowNewForm(false);
      onTransportistSelected({
        name: transportista.nombre_empresa,
        ruc: transportista.ruc
      });
    }
  };

  const handleSaveNewTransportista = async () => {
    if (!newTransportista.nombre_empresa.trim() || !newTransportista.ruc.trim()) {
      toast({
        title: "Error",
        description: "Por favor complete todos los campos",
        variant: "destructive",
      });
      return;
    }

    setSavingNew(true);
    try {
      const { data, error } = await supabase
        .from('transportistas')
        .insert([{
          nombre_empresa: newTransportista.nombre_empresa.trim(),
          ruc: newTransportista.ruc.trim()
        }])
        .select()
        .single();

      if (error) throw error;

      // Add to local list and select it
      setTransportistas(prev => [...prev, data]);
      setSelectedTransportista(data.id);
      setShowNewForm(false);
      
      onTransportistSelected({
        name: data.nombre_empresa,
        ruc: data.ruc
      });

      toast({
        title: "Éxito",
        description: "Transportista agregado correctamente",
      });
    } catch (error) {
      console.error('Error saving transportista:', error);
      toast({
        title: "Error",
        description: "No se pudo guardar el transportista",
        variant: "destructive",
      });
    } finally {
      setSavingNew(false);
    }
  };

  const canSendToSunat = selectedTransportista || 
    (showNewForm && newTransportista.nombre_empresa.trim() && newTransportista.ruc.trim());

  const handleSendToSunat = () => {
    const transportistId = selectedTransportista || 
      (showNewForm ? transportistas.find(t => t.nombre_empresa === newTransportista.nombre_empresa)?.id : '');
    
    if (transportistId) {
      onSendToSunat(transportistId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Seleccionar Transportista</DialogTitle>
          <DialogDescription>
            Seleccione un transportista de la lista o agregue uno nuevo para crear la guía de remisión.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="transportista">Transportista</Label>
            {loadingTransportistas ? (
              <div className="flex items-center gap-2 p-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Cargando transportistas...</span>
              </div>
            ) : (
              <Select value={selectedTransportista} onValueChange={handleTransportistaSelection}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione un transportista" />
                </SelectTrigger>
                <SelectContent>
                  {transportistas.map((transportista) => (
                    <SelectItem key={transportista.id} value={transportista.id}>
                      {transportista.nombre_empresa} - {transportista.ruc}
                    </SelectItem>
                  ))}
                  <SelectItem value="new">
                    <div className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Agregar nuevo transportista
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {showNewForm && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre_empresa">Nombre de la Empresa</Label>
                  <Input
                    id="nombre_empresa"
                    value={newTransportista.nombre_empresa}
                    onChange={(e) => setNewTransportista(prev => ({ ...prev, nombre_empresa: e.target.value }))}
                    placeholder="Ingrese el nombre de la empresa"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ruc">RUC</Label>
                  <Input
                    id="ruc"
                    value={newTransportista.ruc}
                    onChange={(e) => setNewTransportista(prev => ({ ...prev, ruc: e.target.value }))}
                    placeholder="Ingrese el RUC"
                  />
                </div>
                <Button 
                  onClick={handleSaveNewTransportista} 
                  disabled={savingNew}
                  className="w-full"
                >
                  {savingNew ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    'Guardar Transportista'
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancelar
            </Button>
            <Button 
              onClick={handleSendToSunat}
              disabled={!canSendToSunat || loading}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Enviar datos a Sunat'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}