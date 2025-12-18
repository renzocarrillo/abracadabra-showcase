import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { PhoneInput } from '@/components/ui/phone-input';
import { Switch } from '@/components/ui/switch';
import { FileText, User, AlertCircle, Edit2, Truck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ClienteInfo {
  tipo?: string | boolean;
  ruc?: string;
  razonSocial?: string;
  nombre?: string;
  firstName?: string;
  lastName?: string;
  telefono?: string;
  email?: string;
  activity?: string;
  direccion?: string;
  ciudad?: string;
  provincia?: string;
  ubigeoDestino?: string;
  ubigeoTexto?: string;
  recipient?: string;
  direccionFacturacion?: string;
  ciudadFacturacion?: string;
  provinciaFacturacion?: string;
  ubigeoFacturacion?: string;
  ubigeoFacturacionTexto?: string;
}

interface Transportista {
  id: string;
  nombre_empresa: string;
  ruc: string;
}

interface ClientDocumentPreparationProps {
  ventaId: string;
  clienteInfo: ClienteInfo;
  documentoTipoSugerido?: string;
  requiereGuiaRemisionSugerido?: boolean;
  onEmitDocument: (
    clienteInfo: ClienteInfo,
    documentType: string,
    generateGuide: boolean,
    transportistId?: string
  ) => void;
  isLoading: boolean;
}

export function ClientDocumentPreparation({
  ventaId,
  clienteInfo: initialClienteInfo,
  documentoTipoSugerido,
  requiereGuiaRemisionSugerido,
  onEmitDocument,
  isLoading
}: ClientDocumentPreparationProps) {
  const { toast } = useToast();
  const [clienteInfo, setClienteInfo] = useState<ClienteInfo>(initialClienteInfo);
  const [selectedDocumentType, setSelectedDocumentType] = useState<string>('');
  const [generateGuide, setGenerateGuide] = useState(requiereGuiaRemisionSugerido || false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  // Transportista state
  const [transportistas, setTransportistas] = useState<Transportista[]>([]);
  const [selectedTransportistId, setSelectedTransportistId] = useState<string>('');
  const [loadingTransportistas, setLoadingTransportistas] = useState(false);
  
  // Estados para el formulario de edición (similar a CrearVenta)
  const [editedCliente, setEditedCliente] = useState(initialClienteInfo);
  const [envio, setEnvio] = useState({
    direccion: initialClienteInfo.direccion || '',
    ciudad: initialClienteInfo.ciudad || '',
    provincia: initialClienteInfo.provincia || '',
    ubigeoDestino: initialClienteInfo.ubigeoDestino || '',
    ubigeoTexto: initialClienteInfo.ubigeoTexto || '',
    recipient: initialClienteInfo.recipient || ''
  });
  const [facturacion, setFacturacion] = useState({
    direccion: initialClienteInfo.direccionFacturacion || '',
    ciudad: initialClienteInfo.ciudadFacturacion || '',
    provincia: initialClienteInfo.provinciaFacturacion || '',
    ubigeoDestino: initialClienteInfo.ubigeoFacturacion || '',
    ubigeoTexto: initialClienteInfo.ubigeoFacturacionTexto || ''
  });
  const [mismasDirecciones, setMismasDirecciones] = useState(true);
  
  // Estados para búsqueda de ubigeos
  const [busquedaUbigeo, setBusquedaUbigeo] = useState(initialClienteInfo.ubigeoTexto || '');
  const [ubigeos, setUbigeos] = useState<any[]>([]);
  const [mostrarUbigeos, setMostrarUbigeos] = useState(false);
  const [busquedaUbigeoFacturacion, setBusquedaUbigeoFacturacion] = useState(initialClienteInfo.ubigeoFacturacionTexto || '');
  const [ubigeosFacturacion, setUbigeosFacturacion] = useState<any[]>([]);
  const [mostrarUbigeosFacturacion, setMostrarUbigeosFacturacion] = useState(false);

  // Determinar tipo de cliente inicial
  const getInitialClientType = (): boolean => {
    if (typeof initialClienteInfo.tipo === 'boolean') return initialClienteInfo.tipo;
    if (typeof initialClienteInfo.tipo === 'string') {
      return initialClienteInfo.tipo === '1' || initialClienteInfo.tipo.toLowerCase() === 'empresa';
    }
    return !!initialClienteInfo.razonSocial;
  };

  const [isEmpresa, setIsEmpresa] = useState(getInitialClientType());

  // Establecer documento sugerido al inicio
  useEffect(() => {
    if (documentoTipoSugerido) {
      setSelectedDocumentType(documentoTipoSugerido);
    } else {
      // Default según tipo de cliente
      setSelectedDocumentType(isEmpresa ? 'Factura' : 'Boleta');
    }
  }, [documentoTipoSugerido, isEmpresa]);

  // Load transportistas when generateGuide is enabled
  useEffect(() => {
    if (generateGuide && transportistas.length === 0) {
      loadTransportistas();
    }
  }, [generateGuide]);

  const loadTransportistas = async () => {
    setLoadingTransportistas(true);
    try {
      const { data, error } = await supabase
        .from('transportistas')
        .select('id, nombre_empresa, ruc')
        .order('nombre_empresa');
      
      if (error) throw error;
      setTransportistas(data || []);
    } catch (error) {
      console.error('Error loading transportistas:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los transportistas",
        variant: "destructive"
      });
    } finally {
      setLoadingTransportistas(false);
    }
  };

  // Sincronizar direcciones cuando el switch cambia
  useEffect(() => {
    if (mismasDirecciones && isEmpresa) {
      setEnvio(prev => ({
        ...prev,
        direccion: facturacion.direccion,
        ciudad: facturacion.ciudad, 
        provincia: facturacion.provincia,
        ubigeoDestino: facturacion.ubigeoDestino,
        ubigeoTexto: facturacion.ubigeoTexto
      }));
      setBusquedaUbigeo(facturacion.ubigeoTexto);
    } else if (!mismasDirecciones && isEmpresa) {
      setEnvio(prev => ({
        ...prev,
        direccion: '',
        ciudad: '',
        provincia: '',
        ubigeoDestino: '',
        ubigeoTexto: ''
      }));
      setBusquedaUbigeo('');
    }
  }, [mismasDirecciones, facturacion, isEmpresa]);

  const getAvailableDocumentTypes = () => {
    if (isEmpresa) {
      return [
        { value: 'Factura', label: 'Factura' },
        { value: 'Ticket', label: 'Ticket (Empresa)' }
      ];
    } else {
      return [
        { value: 'Boleta', label: 'Boleta' },
        { value: 'Ticket', label: 'Ticket (Persona Natural)' }
      ];
    }
  };

  const isGuideGenerationAllowed = () => {
    return selectedDocumentType !== 'Ticket';
  };

  // Funciones de búsqueda de ubigeos
  const buscarUbigeos = async (termino: string) => {
    const term = termino.trim();
    if (term.length < 2) {
      setUbigeos([]);
      return;
    }
    try {
      const [exactRes, wideRes] = await Promise.all([
        supabase.from('ubigeos').select('*').eq('codigo', term).limit(1),
        supabase.from('ubigeos').select('*')
          .or(`distrito.ilike.%${term}%,provincia.ilike.%${term}%,departamento.ilike.%${term}%,nombre_completo.ilike.%${term}%,codigo.ilike.%${term}%`)
          .order('nombre_completo').limit(50)
      ]);
      const exactData = exactRes.data || [];
      const wideData = wideRes.data || [];
      const seen = new Set<string>();
      const combinados = [...exactData, ...wideData].filter((u: any) => {
        if (seen.has(u.codigo)) return false;
        seen.add(u.codigo);
        return true;
      });
      setUbigeos(combinados);
    } catch (error) {
      console.error('Error buscando ubigeos:', error);
      setUbigeos([]);
    }
  };

  const buscarUbigeosFacturacion = async (termino: string) => {
    const term = termino.trim();
    if (term.length < 2) {
      setUbigeosFacturacion([]);
      return;
    }
    try {
      const [exactRes, wideRes] = await Promise.all([
        supabase.from('ubigeos').select('*').eq('codigo', term).limit(1),
        supabase.from('ubigeos').select('*')
          .or(`distrito.ilike.%${term}%,provincia.ilike.%${term}%,departamento.ilike.%${term}%,nombre_completo.ilike.%${term}%,codigo.ilike.%${term}%`)
          .order('nombre_completo').limit(50)
      ]);
      const exactData = exactRes.data || [];
      const wideData = wideRes.data || [];
      const seen = new Set<string>();
      const combinados = [...exactData, ...wideData].filter((u: any) => {
        if (seen.has(u.codigo)) return false;
        seen.add(u.codigo);
        return true;
      });
      setUbigeosFacturacion(combinados);
    } catch (error) {
      console.error('Error buscando ubigeos de facturación:', error);
      setUbigeosFacturacion([]);
    }
  };

  const seleccionarUbigeo = (ubigeo: any) => {
    setEnvio({
      ...envio,
      ubigeoDestino: ubigeo.codigo,
      ubigeoTexto: ubigeo.nombre_completo
    });
    setBusquedaUbigeo(ubigeo.nombre_completo);
    setMostrarUbigeos(false);
  };

  const seleccionarUbigeoFacturacion = (ubigeo: any) => {
    setFacturacion({
      ...facturacion,
      ubigeoDestino: ubigeo.codigo,
      ubigeoTexto: ubigeo.nombre_completo
    });
    setBusquedaUbigeoFacturacion(ubigeo.nombre_completo);
    setMostrarUbigeosFacturacion(false);
  };

  const handleClientTypeChange = (value: string) => {
    const esEmpresa = value === "1";
    setIsEmpresa(esEmpresa);
    
    if (esEmpresa) {
      setEditedCliente(prev => ({
        ...prev,
        firstName: '',
        lastName: '',
        nombre: '',
        tipo: true
      }));
    } else {
      setEditedCliente(prev => ({
        ...prev,
        razonSocial: '',
        tipo: false
      }));
    }
  };

  const validateClientData = (dataToValidate: ClienteInfo): { isValid: boolean; error?: string } => {
    if (!dataToValidate.ruc) {
      return { isValid: false, error: isEmpresa ? 'RUC es requerido' : 'DNI es requerido' };
    }
    if (!dataToValidate.email) {
      return { isValid: false, error: 'Email es requerido' };
    }
    
    if (isEmpresa) {
      if (!dataToValidate.razonSocial) {
        return { isValid: false, error: 'Razón social es requerida' };
      }
    } else {
      const hasFullName = dataToValidate.nombre || (dataToValidate.firstName && dataToValidate.lastName);
      if (!hasFullName) {
        return { isValid: false, error: 'Nombre completo es requerido' };
      }
    }

    return { isValid: true };
  };

  const handleSaveClientChanges = () => {
    // Validar datos editados
    const validation = validateClientData(editedCliente);
    if (!validation.isValid) {
      toast({
        title: "Error de validación",
        description: validation.error,
        variant: "destructive"
      });
      return;
    }

    // Actualizar cliente info con todos los datos
    const updatedClienteInfo = {
      ...editedCliente,
      tipo: isEmpresa,
      direccion: envio.direccion,
      ciudad: envio.ciudad,
      provincia: envio.provincia,
      ubigeoDestino: envio.ubigeoDestino,
      ubigeoTexto: envio.ubigeoTexto,
      recipient: envio.recipient,
      direccionFacturacion: facturacion.direccion,
      ciudadFacturacion: facturacion.ciudad,
      provinciaFacturacion: facturacion.provincia,
      ubigeoFacturacion: facturacion.ubigeoDestino,
      ubigeoFacturacionTexto: facturacion.ubigeoTexto
    };

    setClienteInfo(updatedClienteInfo);
    setEditDialogOpen(false);
    
    toast({
      title: "Cliente actualizado",
      description: "Los datos del cliente se han actualizado correctamente"
    });
  };

  const handleEmit = () => {
    const validation = validateClientData(clienteInfo);
    if (!validation.isValid) {
      toast({
        title: "Error de validación",
        description: validation.error,
        variant: "destructive"
      });
      return;
    }

    // Validate transportist selection when guide is needed
    if (generateGuide && !selectedTransportistId) {
      toast({
        title: "Transportista requerido",
        description: "Debes seleccionar un transportista para generar la guía de remisión",
        variant: "destructive"
      });
      return;
    }

    const finalClienteInfo = {
      ...clienteInfo,
      tipo: isEmpresa
    };

    onEmitDocument(
      finalClienteInfo, 
      selectedDocumentType, 
      generateGuide,
      generateGuide ? selectedTransportistId : undefined
    );
  };

  const getClientDisplayName = () => {
    if (isEmpresa) {
      return clienteInfo.razonSocial || 'Empresa sin nombre';
    } else {
      return clienteInfo.nombre || 
             `${clienteInfo.firstName || ''} ${clienteInfo.lastName || ''}`.trim() || 
             'Cliente sin nombre';
    }
  };

  return (
    <div className="space-y-4">
      {/* Preferencias del Vendedor */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Preferencias del Vendedor
          </CardTitle>
          <CardDescription>
            Configuración recomendada al crear la venta
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Documento sugerido:</span>
            <Badge variant="secondary">
              {documentoTipoSugerido || 'No especificado'}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Guía de remisión:</span>
            <Badge variant={requiereGuiaRemisionSugerido ? "default" : "outline"}>
              {requiereGuiaRemisionSugerido ? 'Requerida' : 'No requerida'}
            </Badge>
          </div>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Puedes modificar estos valores si el cliente cambió de opinión
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Información del Cliente */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4" />
              Información del Cliente
            </CardTitle>
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Edit2 className="w-4 h-4 mr-2" />
                  Editar Cliente
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Editar Información del Cliente</DialogTitle>
                  <DialogDescription>
                    Modifica los datos del cliente según sea necesario
                  </DialogDescription>
                </DialogHeader>
                
                {/* Formulario completo de edición */}
                <div className="space-y-6 py-4">
                  {/* Información del Cliente */}
                  <div className="space-y-4">
                    <h3 className="font-semibold">Datos del cliente para la venta</h3>
                    
                    <div className="space-y-2">
                      <Label>Tipo de Cliente</Label>
                      <Select 
                        value={isEmpresa ? "1" : "0"}
                        onValueChange={handleClientTypeChange}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Persona Natural</SelectItem>
                          <SelectItem value="1">Empresa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {isEmpresa ? (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Razón Social *</Label>
                            <Input
                              value={editedCliente.razonSocial || ''}
                              onChange={(e) => setEditedCliente({ ...editedCliente, razonSocial: e.target.value })}
                              placeholder="Razón social de la empresa"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Giro del Cliente</Label>
                            <Input
                              value={editedCliente.activity || ''}
                              onChange={(e) => setEditedCliente({ ...editedCliente, activity: e.target.value })}
                              placeholder="Giro o actividad comercial"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>RUC</Label>
                          <Input
                            value={editedCliente.ruc || ''}
                            onChange={(e) => setEditedCliente({ ...editedCliente, ruc: e.target.value })}
                            placeholder="Ingrese RUC"
                            maxLength={11}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Nombre *</Label>
                            <Input
                              value={editedCliente.firstName || ''}
                              onChange={(e) => setEditedCliente({ ...editedCliente, firstName: e.target.value })}
                              placeholder="Nombre de la persona"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Apellido</Label>
                            <Input
                              value={editedCliente.lastName || ''}
                              onChange={(e) => setEditedCliente({ ...editedCliente, lastName: e.target.value })}
                              placeholder="Apellido de la persona"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>DNI</Label>
                          <Input
                            value={editedCliente.ruc || ''}
                            onChange={(e) => setEditedCliente({ ...editedCliente, ruc: e.target.value })}
                            placeholder="Ingrese DNI"
                            maxLength={8}
                          />
                        </div>
                      </>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Email *</Label>
                        <Input
                          type="email"
                          value={editedCliente.email || ''}
                          onChange={(e) => setEditedCliente({ ...editedCliente, email: e.target.value })}
                          placeholder="correo@ejemplo.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Teléfono</Label>
                        <PhoneInput
                          value={editedCliente.telefono || ''}
                          onChange={(value) => setEditedCliente({ ...editedCliente, telefono: value })}
                          placeholder="Teléfono de contacto"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dirección de Facturación (solo empresas) */}
                  {isEmpresa && (
                    <div className="space-y-4 border-t pt-4">
                      <h3 className="font-semibold">Dirección de Facturación</h3>
                      <div className="space-y-2">
                        <Label>Dirección</Label>
                        <Input
                          value={facturacion.direccion}
                          onChange={(e) => setFacturacion({ ...facturacion, direccion: e.target.value })}
                          placeholder="Dirección de facturación"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Ciudad</Label>
                          <Input
                            value={facturacion.ciudad}
                            onChange={(e) => setFacturacion({ ...facturacion, ciudad: e.target.value })}
                            placeholder="Ciudad"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Provincia</Label>
                          <Input
                            value={facturacion.provincia}
                            onChange={(e) => setFacturacion({ ...facturacion, provincia: e.target.value })}
                            placeholder="Provincia"
                          />
                        </div>
                      </div>
                      <div className="space-y-2 relative">
                        <Label>Ubigeo de Facturación</Label>
                        <Input
                          value={busquedaUbigeoFacturacion}
                          onChange={(e) => {
                            setBusquedaUbigeoFacturacion(e.target.value);
                            buscarUbigeosFacturacion(e.target.value);
                            setMostrarUbigeosFacturacion(true);
                          }}
                          onFocus={() => setMostrarUbigeosFacturacion(true)}
                          placeholder="Buscar distrito, provincia o departamento"
                        />
                        {mostrarUbigeosFacturacion && ubigeosFacturacion.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
                            {ubigeosFacturacion.map((ubigeo: any) => (
                              <div
                                key={ubigeo.id}
                                className="px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                                onClick={() => seleccionarUbigeoFacturacion(ubigeo)}
                              >
                                <div className="font-medium">{ubigeo.nombre_completo}</div>
                                <div className="text-xs text-muted-foreground">Código: {ubigeo.codigo}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Dirección de Envío */}
                  <div className="space-y-4 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">Dirección de Envío</h3>
                      {isEmpresa && (
                        <div className="flex items-center gap-2">
                          <Switch
                            id="mismas-direcciones"
                            checked={mismasDirecciones}
                            onCheckedChange={setMismasDirecciones}
                          />
                          <Label htmlFor="mismas-direcciones" className="text-sm">
                            Misma que facturación
                          </Label>
                        </div>
                      )}
                    </div>
                    
                    {(!isEmpresa || !mismasDirecciones) && (
                      <>
                        <div className="space-y-2">
                          <Label>Destinatario</Label>
                          <Input
                            value={envio.recipient}
                            onChange={(e) => setEnvio({ ...envio, recipient: e.target.value })}
                            placeholder="Nombre de quien recibe"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Dirección de Envío</Label>
                          <Input
                            value={envio.direccion}
                            onChange={(e) => setEnvio({ ...envio, direccion: e.target.value })}
                            placeholder="Dirección de envío"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Ciudad</Label>
                            <Input
                              value={envio.ciudad}
                              onChange={(e) => setEnvio({ ...envio, ciudad: e.target.value })}
                              placeholder="Ciudad"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Provincia</Label>
                            <Input
                              value={envio.provincia}
                              onChange={(e) => setEnvio({ ...envio, provincia: e.target.value })}
                              placeholder="Provincia"
                            />
                          </div>
                        </div>
                        <div className="space-y-2 relative">
                          <Label>Ubigeo de Destino</Label>
                          <Input
                            value={busquedaUbigeo}
                            onChange={(e) => {
                              setBusquedaUbigeo(e.target.value);
                              buscarUbigeos(e.target.value);
                              setMostrarUbigeos(true);
                            }}
                            onFocus={() => setMostrarUbigeos(true)}
                            placeholder="Buscar distrito, provincia o departamento"
                          />
                          {mostrarUbigeos && ubigeos.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
                              {ubigeos.map((ubigeo: any) => (
                                <div
                                  key={ubigeo.id}
                                  className="px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                                  onClick={() => seleccionarUbigeo(ubigeo)}
                                >
                                  <div className="font-medium">{ubigeo.nombre_completo}</div>
                                  <div className="text-xs text-muted-foreground">Código: {ubigeo.codigo}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button 
                      variant="outline" 
                      onClick={() => setEditDialogOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button onClick={handleSaveClientChanges}>
                      Guardar Cambios
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <CardDescription>
            Verifica los datos antes de emitir
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <span className="text-sm text-muted-foreground">Tipo:</span>
            <span className="ml-2 text-sm font-medium">
              {isEmpresa ? 'Empresa' : 'Persona Natural'}
            </span>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">
              {isEmpresa ? 'RUC' : 'DNI'}:
            </span>
            <span className="ml-2 text-sm font-medium">{clienteInfo.ruc || 'No especificado'}</span>
          </div>
          {isEmpresa ? (
            <div>
              <span className="text-sm text-muted-foreground">Razón Social:</span>
              <span className="ml-2 text-sm font-medium">{clienteInfo.razonSocial || 'No especificado'}</span>
            </div>
          ) : (
            <div>
              <span className="text-sm text-muted-foreground">Nombre:</span>
              <span className="ml-2 text-sm font-medium">{getClientDisplayName()}</span>
            </div>
          )}
          <div>
            <span className="text-sm text-muted-foreground">Email:</span>
            <span className="ml-2 text-sm font-medium">{clienteInfo.email || 'No especificado'}</span>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">Teléfono:</span>
            <span className="ml-2 text-sm font-medium">{clienteInfo.telefono || 'No especificado'}</span>
          </div>
        </CardContent>
      </Card>

      {/* Selección de Documento */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documento a Emitir</CardTitle>
          <CardDescription>
            Selecciona el tipo de documento final
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de Documento</Label>
            <Select 
              value={selectedDocumentType} 
              onValueChange={setSelectedDocumentType}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getAvailableDocumentTypes().map(docType => (
                  <SelectItem key={docType.value} value={docType.value}>
                    {docType.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox 
              id="guide-checkbox"
              checked={generateGuide}
              disabled={!isGuideGenerationAllowed()}
              onCheckedChange={(checked) => {
                setGenerateGuide(checked === true);
                if (!checked) {
                  setSelectedTransportistId('');
                }
              }}
            />
            <Label 
              htmlFor="guide-checkbox"
              className={`text-sm ${isGuideGenerationAllowed() ? '' : 'text-muted-foreground'}`}
            >
              Generar guía de remisión
              {!isGuideGenerationAllowed() && (
                <span className="text-xs block text-muted-foreground">
                  No disponible para tickets
                </span>
              )}
            </Label>
          </div>

          {/* Transportista Selector */}
          {generateGuide && isGuideGenerationAllowed() && (
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg border">
              <Label className="flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Transportista para la Guía *
              </Label>
              <Select 
                value={selectedTransportistId} 
                onValueChange={setSelectedTransportistId}
                disabled={loadingTransportistas}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingTransportistas ? "Cargando..." : "Selecciona un transportista"} />
                </SelectTrigger>
                <SelectContent>
                  {transportistas.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nombre_empresa} - RUC: {t.ruc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Requerido para generar la guía de remisión
              </p>
            </div>
          )}

          <Button 
            onClick={handleEmit}
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            {isLoading ? 'Emitiendo...' : 'Emitir Documento'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
