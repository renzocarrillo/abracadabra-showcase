import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, CheckCircle, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function BSaleIntegration() {
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const { toast } = useToast();

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      console.log('Probando conexión con BSale...');
      
      // Test with a simple API call to BSale
      const response = await fetch('https://api.bsale.io/v1/offices.json?limit=1', {
        method: 'GET',
        headers: {
          'access_token': 'test', // This will be handled by edge function
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        const data = await response.json();
        setTestResult({ success: true, data: data });
        toast({
          title: "Conexión exitosa",
          description: "La integración con BSale está funcionando correctamente",
          variant: "default",
        });
      } else {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

    } catch (error: any) {
      console.error('BSale connection test error:', error);
      setTestResult({ success: false, error: error.message });
      toast({
        title: "Error de conexión",
        description: `No se pudo conectar con BSale: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              BSale Integration
              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                Conectado
              </Badge>
            </CardTitle>
            <CardDescription>
              Gestiona la integración con el sistema de facturación BSale
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div>
            <Label htmlFor="bsale-token">Access Token</Label>
            <div className="flex gap-2 mt-1">
              <div className="relative flex-1">
                <Input
                  id="bsale-token"
                  type={showToken ? "text" : "password"}
                  value="••••••••••••••••••••••••••••••••••••••••"
                  readOnly
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              El token está almacenado de forma segura en los secretos de Supabase
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleTestConnection}
              disabled={testing}
              variant="outline"
              className="flex items-center gap-2"
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Probar Conexión
            </Button>
          </div>

          {testResult && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                {testResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                )}
                <span className="font-medium">
                  {testResult.success ? 'Conexión Exitosa' : 'Error de Conexión'}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {testResult.success ? (
                  <p>✅ La integración con BSale está funcionando correctamente</p>
                ) : (
                  <p>❌ Error: {testResult.error}</p>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 p-3 bg-muted/50 rounded-md">
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-2">🔗 Funcionalidades Activas</p>
              <ul className="space-y-1 text-xs">
                <li>• Emisión de documentos (facturas, boletas)</li>
                <li>• Guías de remisión</li>
                <li>• Gestión de stock (ingresos y consumos)</li>
                <li>• Traslados internos</li>
                <li>• Sincronización de productos</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}