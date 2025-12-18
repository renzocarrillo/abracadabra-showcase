import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Calendar, User, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface InventoryReport {
  id: string;
  bin_code: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  started_by_name: string;
  finished_by_name: string | null;
  report_url: string | null;
  notes: string | null;
}

export default function InventoryReports() {
  const [reports, setReports] = useState<InventoryReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchInventoryReports() {
      try {
        const { data, error } = await supabase
          .from('bin_inventories')
          .select(`
            id, bin_code, status, started_at, finished_at, 
            started_by_name, finished_by_name, report_url, notes
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;

        setReports(data || []);
      } catch (error) {
        console.error('Error fetching inventory reports:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchInventoryReports();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'iniciado':
        return <Badge variant="secondary">Iniciado</Badge>;
      case 'finalizado':
        return <Badge variant="default">Finalizado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const generateReport = async (inventoryId: string) => {
    try {
      const response = await fetch(`https://cflyvlkpbodtutyikfbk.supabase.co/functions/v1/generate-inventory-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmbHl2bGtwYm9kdHV0eWlrZmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0OTY1NTMsImV4cCI6MjA3MjA3MjU1M30.C9rhSTvKPl4eYnNA6ONTmyjwrrtssoVpJdcPKgI_i10`,
        },
        body: JSON.stringify({ inventoryId })
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }

      // Get the filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'inventario_reporte.html';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      // Download the HTML file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Update the report URL in the database to indicate it was generated
      await supabase
        .from('bin_inventories')
        .update({ report_url: 'generated' })
        .eq('id', inventoryId);

      // Refresh the reports list
      const { data: updatedReports } = await supabase
        .from('bin_inventories')
        .select(`
          id, bin_code, status, started_at, finished_at, 
          started_by_name, finished_by_name, report_url, notes
        `)
        .order('created_at', { ascending: false });

      if (updatedReports) {
        setReports(updatedReports);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Error al generar el reporte. Por favor, intenta de nuevo.');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Reportes de Inventario</h2>
          <p className="text-muted-foreground">Historial de inventarios realizados por bin</p>
        </div>
        <Card className="p-6 bg-card border-border">
          <div className="text-center text-muted-foreground">Cargando reportes...</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Reportes de Inventario</h2>
        <p className="text-muted-foreground">Historial de inventarios realizados por bin</p>
      </div>

      <div className="grid gap-4">
        {reports.map((report) => (
          <Card key={report.id} className="p-6 bg-card border-border">
            <div className="flex items-start justify-between">
              <div className="space-y-3 flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-foreground">
                    Inventario Bin: {report.bin_code}
                  </h3>
                  {getStatusBadge(report.status)}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Iniciado: {format(new Date(report.started_at), 'dd/MM/yyyy HH:mm', { locale: es })}</span>
                  </div>
                  
                  {report.finished_at && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>Finalizado: {format(new Date(report.finished_at), 'dd/MM/yyyy HH:mm', { locale: es })}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>Por: {report.started_by_name}</span>
                  </div>

                  {report.finished_by_name && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span>Finalizado por: {report.finished_by_name}</span>
                    </div>
                  )}
                </div>

                {report.notes && (
                  <div className="bg-muted/50 p-3 rounded-md">
                    <p className="text-sm text-muted-foreground">
                      <strong>Notas:</strong> {report.notes}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 ml-4">
                {report.report_url === 'generated' ? (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => generateReport(report.id)}
                    className="flex items-center gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    Descargar Reporte
                  </Button>
                ) : report.status === 'finalizado' ? (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => generateReport(report.id)}
                    className="flex items-center gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    Generar Reporte
                  </Button>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    En proceso
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        ))}

        {reports.length === 0 && (
          <Card className="p-12 bg-card border-border">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No hay reportes de inventario</h3>
              <p className="text-muted-foreground">
                Los reportes aparecerán aquí después de realizar inventarios por bin.
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}