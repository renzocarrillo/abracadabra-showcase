import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, ChevronRight, Package, AlertCircle, Play, Square, Snowflake } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { usePermissions } from '@/hooks/usePermissions'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useAuth } from '@/hooks/useAuth'

interface BinStock {
  id: string
  sku: string
  disponibles: number
  comprometido: number
  en_existencia: number
  nombreProducto?: string
  variante?: string
  costo?: number
}

interface BinInventory {
  id: string
  bin_code: string
  status: 'iniciado' | 'finalizado'
  started_by_name: string
  started_at: string
  finished_by_name?: string
  finished_at?: string
  notes?: string
}

interface InventoryChange {
  stock_id: string
  sku: string
  nombre_producto: string
  variante?: string
  previous_quantity: number
  new_quantity: number
  difference: number
  change_type: 'increase' | 'decrease' | 'no_change'
}

const Inventory = () => {
  const { hasPermission } = usePermissions()
  const { user, profile } = useAuth()
  
  // All hooks must be called before any conditional returns
  const [selectedBin, setSelectedBin] = useState<string>('')
  const [editingStock, setEditingStock] = useState<Record<string, number>>({})
  const [currentPage, setCurrentPage] = useState(1)
  const [activeInventory, setActiveInventory] = useState<BinInventory | null>(null)
  const [showValidationDialog, setShowValidationDialog] = useState(false)
  const [validationResult, setValidationResult] = useState<any>(null)
  const [inventoryChanges, setInventoryChanges] = useState<InventoryChange[]>([])
  const [showChangesPreview, setShowChangesPreview] = useState(false)
  const itemsPerPage = 20
  
  const queryClient = useQueryClient()
  
  const canManageInventory = hasPermission('manage_inventory') || 
    hasPermission('manage_stock') || 
    profile?.role === 'admin'

  const { data: bins, isLoading: binsLoading, error: binsError } = useQuery({
    queryKey: ['bins'],
    queryFn: async () => {
      console.log('Fetching bins...')
      const { data, error } = await supabase
        .from('bins')
        .select('bin_code, is_frozen, frozen_reason')
        .order('bin_code')
      
      console.log('Bins query result:', { data, error })
      if (error) {
        console.error('Bins query error:', error)
        throw error
      }
      return data
    }
  })

  const { data: currentInventoryData } = useQuery({
    queryKey: ['active-inventory', selectedBin],
    queryFn: async () => {
      if (!selectedBin) return null
      
      const { data, error } = await supabase
        .from('bin_inventories')
        .select('*')
        .eq('bin_code', selectedBin)
        .eq('status', 'iniciado')
        .maybeSingle()
      
      if (error) throw error
      return data
    },
    enabled: !!selectedBin
  })

  const { data: stockData, isLoading: stockLoading, error: stockError } = useQuery({
    queryKey: ['bin-stock', selectedBin, currentPage, activeInventory],
    queryFn: async () => {
      if (!selectedBin || !activeInventory) return { data: [], count: 0 }

      console.log('Fetching stock for bin:', selectedBin)

      // 1) Fetch stock for the bin (no joins to avoid PostgREST relationship ambiguity)
      const { data: stockRows, error: stockErr } = await supabase
        .from('stockxbin')
        .select('id, sku, disponibles, comprometido, en_existencia, bin')
        .eq('bin', selectedBin)
        .not('sku', 'is', null)
        .order('sku')

      if (stockErr) {
        console.error('Stock query error:', stockErr)
        throw stockErr
      }

      const skus = (stockRows || []).map(r => r.sku).filter(Boolean)
      console.log('Stock rows:', stockRows)

      // 2) Fetch variant info for those SKUs, then merge client-side
      let variantMap: Record<string, { nombreProducto?: string; variante?: string; costo?: number }> = {}
      if (skus.length > 0) {
        const { data: variantRows, error: varErr } = await supabase
          .from('variants')
          .select('sku, nombreProducto, variante, costo')
          .in('sku', skus as string[])

        if (varErr) {
          console.error('Variants query error:', varErr)
        } else {
          variantMap = Object.fromEntries(
            (variantRows || []).map(v => [v.sku, { nombreProducto: v.nombreProducto, variante: v.variante, costo: Number(v.costo) || 0 }])
          )
        }
      }

      const transformedData = (stockRows || []).map(item => ({
        ...item,
        nombreProducto: variantMap[item.sku]?.nombreProducto || item.sku || 'Producto desconocido',
        variante: variantMap[item.sku]?.variante || '',
        costo: variantMap[item.sku]?.costo || 0
      })) as BinStock[]

      console.log('Transformed stock data:', transformedData)

      return { data: transformedData, count: transformedData.length }
    },
    enabled: !!selectedBin && !!activeInventory
  })

  const startInventoryMutation = useMutation({
    mutationFn: async () => {
      console.log('🔄 Executing start_bin_inventory RPC with params:', {
        bin_code_param: selectedBin,
        started_by_param: user?.id,
        started_by_name_param: profile?.full_name || user?.email || 'Usuario desconocido'
      })
      
      const { data, error } = await supabase.rpc('start_bin_inventory', {
        bin_code_param: selectedBin,
        started_by_param: user?.id,
        started_by_name_param: profile?.full_name || user?.email || 'Usuario desconocido'
      })
      
      console.log('🔄 RPC Response:', { data, error })
      
      if (error) throw error
      return data
    },
    onSuccess: (data: any) => {
      console.log('✅ Mutation success:', data)
      if (data?.success) {
        queryClient.invalidateQueries({ queryKey: ['active-inventory'] })
        queryClient.invalidateQueries({ queryKey: ['bins'] })
        queryClient.invalidateQueries({ queryKey: ['bin-stock'] })
        toast({ title: 'Inventario iniciado', description: 'El bin ha sido congelado.' })
      } else {
        console.log('❌ Success but data indicates failure:', data)
        toast({ title: 'Error', description: data?.message || 'Error desconocido', variant: 'destructive' })
      }
    },
    onError: (error: any) => {
      console.error('❌ Mutation error:', error)
      toast({ title: 'Error', description: `Error al iniciar inventario: ${error.message}`, variant: 'destructive' })
    }
  })

  const validateBinForInventory = async (force = false) => {
    console.log('🔍 Starting inventory validation for bin:', selectedBin, 'force:', force)
    try {
      const { data, error } = await supabase.rpc('check_bin_can_start_inventory', {
        bin_code_param: selectedBin,
        force_param: force
      })
      
      console.log('✅ Validation result:', { data, error })
      
      if (error) throw error
      setValidationResult(data)
      
      if ((data as any)?.can_start) {
        console.log('🚀 Starting inventory mutation...')
        const { data: startData, error: startError } = await supabase.rpc('start_bin_inventory', {
          bin_code_param: selectedBin,
          started_by_param: user?.id,
          started_by_name_param: profile?.full_name || user?.email || 'Usuario desconocido',
          force_param: force
        })
        
        if (startError) throw startError
        
        if ((startData as any)?.success) {
          queryClient.invalidateQueries({ queryKey: ['active-inventory'] })
          queryClient.invalidateQueries({ queryKey: ['bins'] })
          queryClient.invalidateQueries({ queryKey: ['bin-stock'] })
          toast({ title: 'Inventario iniciado', description: 'El bin ha sido congelado.' })
        } else {
          toast({ title: 'Error', description: (startData as any)?.message || 'Error desconocido', variant: 'destructive' })
        }
      } else {
        console.log('❌ Cannot start inventory:', data)
        setShowValidationDialog(true)
      }
    } catch (error) {
      console.error('❌ Validation error:', error)
      toast({ title: 'Error', description: `Error al validar bin: ${error.message}`, variant: 'destructive' })
    }
  }

  const handleStockEdit = (stockId: string, newValue: number) => {
    setEditingStock(prev => ({ ...prev, [stockId]: newValue }))
  }

  const getDisplayValue = (stockId: string): number => {
    if (stockId in editingStock) return editingStock[stockId]
    const stock = stockData?.data?.find(s => s.id === stockId)
    return stock?.disponibles || 0
  }

  const isEdited = (stockId: string): boolean => stockId in editingStock
  const hasUnsavedChanges = (): boolean => Object.keys(editingStock).length > 0

  const getInventoryChanges = (): InventoryChange[] => {
    return Object.entries(editingStock).map(([stockId, newQuantity]) => {
      const originalStock = stockData?.data?.find(s => s.id === stockId)
      if (!originalStock) return null
      
      const difference = newQuantity - originalStock.disponibles
      return {
        stock_id: stockId,
        sku: originalStock.sku,
        nombre_producto: originalStock.nombreProducto,
        variante: originalStock.variante,
        previous_quantity: originalStock.disponibles,
        new_quantity: newQuantity,
        difference,
        change_type: difference > 0 ? 'increase' : difference < 0 ? 'decrease' : 'no_change'
      }
    }).filter(Boolean) as InventoryChange[]
  }

  const finishInventoryMutation = useMutation({
    mutationFn: async () => {
      if (!activeInventory) throw new Error('No hay inventario activo')
      
      const changes = getInventoryChanges()
      
      // Apply stock changes
      for (const change of changes) {
        if (change.change_type !== 'no_change') {
          await supabase.rpc('safe_update_stock_quantity', {
            stock_id: change.stock_id,
            new_disponibles: change.new_quantity
          })
        }
      }
      
      // Convert changes to JSON format for the RPC call
      const changesJson = changes.map(change => ({
        stock_id: change.stock_id,
        sku: change.sku,
        nombre_producto: change.nombre_producto,
        variante: change.variante || '',
        previous_quantity: change.previous_quantity,
        new_quantity: change.new_quantity,
        difference: change.difference,
        change_type: change.change_type
      }))
      
      // Finish inventory
      const { data, error } = await supabase.rpc('finish_bin_inventory', {
        inventory_id_param: activeInventory.id,
        finished_by_param: user?.id,
        finished_by_name_param: profile?.full_name || user?.email || 'Usuario desconocido',
        changes_param: changesJson as any
      })
      
      if (error) throw error
      
      // Sync changes to BSale if there are any changes
      if (changes.length > 0) {
        console.log('🔄 Sincronizando cambios con BSale...')
        try {
          const { data: syncData, error: syncError } = await supabase.functions.invoke('sync-inventory-to-bsale', {
            body: {
              changes: changesJson,
              inventory_id: activeInventory.id
            }
          })
          
          if (syncError) {
            console.error('❌ Error sincronizando con BSale:', syncError)
            toast({ 
              title: 'Inventario finalizado con advertencia', 
              description: 'El inventario se completó pero hubo problemas sincronizando con BSale',
              variant: 'destructive'
            })
          } else if (syncData?.success) {
            console.log('✅ BSale sync successful:', syncData)
            toast({ 
              title: 'Inventario y BSale sincronizados', 
              description: syncData.message || 'Cambios aplicados correctamente en BSale'
            })
          }
        } catch (syncError) {
          console.error('❌ Sync error:', syncError)
          toast({ 
            title: 'Inventario finalizado con advertencia', 
            description: 'El inventario se completó pero no se pudo sincronizar con BSale',
            variant: 'destructive'
          })
        }
      }
      
      return data
    },
    onSuccess: (data: any) => {
      if (data?.success) {
        queryClient.invalidateQueries({ queryKey: ['active-inventory'] })
        queryClient.invalidateQueries({ queryKey: ['bins'] })
        queryClient.invalidateQueries({ queryKey: ['bin-stock'] })
        setEditingStock({})
        setShowChangesPreview(false)
        toast({ title: 'Inventario finalizado', description: `${data.summary?.total_changes || 0} cambios aplicados` })
      } else {
        toast({ title: 'Error', description: data?.message || 'Error desconocido', variant: 'destructive' })
      }
    }
  })

  const handleFinishInventory = () => {
    const changes = getInventoryChanges()
    if (changes.length === 0) {
      // No changes - finish directly
      finishInventoryMutation.mutate()
    } else {
      // Show changes preview
      setInventoryChanges(changes)
      setShowChangesPreview(true)
    }
  }

  useEffect(() => {
    if (bins && bins.length > 0 && !selectedBin) {
      setSelectedBin(bins[0].bin_code)
    }
  }, [bins, selectedBin])

  useEffect(() => {
    if (currentInventoryData) {
      setActiveInventory(currentInventoryData)
    } else {
      setActiveInventory(null)
    }
  }, [currentInventoryData])

  const selectedBinData = bins?.find(b => b.bin_code === selectedBin)

  // Debug logging when needed
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Inventory Debug:', {
        hasViewPermission: hasPermission('view_inventory'),
        canManageInventory,
        binsLoading,
        binsError,
        binsData: bins,
        stockLoading,
        stockError,
        stockData: stockData?.data,
        selectedBin,
        activeInventory,
        userEmail: user?.email
      })
    }
  }, [hasPermission, canManageInventory, binsLoading, stockLoading, selectedBin, activeInventory])

  // Show errors if any
  if (binsError) {
    console.error('Bins error:', binsError)
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Error cargando bins: {binsError.message}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (stockError) {
    console.error('Stock error:', stockError)
  }

  // Check permissions after all hooks are called
  if (!hasPermission('view_inventory')) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>No tienes permisos para ver esta página.</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (binsLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader><CardTitle><Package className="h-5 w-5" />Inventario por Bin</CardTitle></CardHeader>
          <CardContent><Skeleton className="h-[400px] w-full" /></CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Inventario por Bin
            {activeInventory && (
              <Badge variant="secondary" className="ml-2">
                <Snowflake className="h-3 w-3 mr-1" />Inventario Activo
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6 space-y-4">
            <div className="flex items-center gap-4">
              <Select value={selectedBin} onValueChange={setSelectedBin} disabled={!!activeInventory}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="Selecciona un bin" />
                </SelectTrigger>
                <SelectContent>
                  {bins?.map((bin) => (
                    <SelectItem key={bin.bin_code} value={bin.bin_code}>
                      <div className="flex items-center gap-2">
                        {bin.bin_code}
                        {bin.is_frozen && <Badge variant="outline"><Snowflake className="h-3 w-3 mr-1" />Congelado</Badge>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {canManageInventory && selectedBin && !activeInventory && (
                <Button 
                  onClick={() => {
                    console.log('🖱️ Button clicked! canManageInventory:', canManageInventory, 'selectedBin:', selectedBin)
                    validateBinForInventory()
                  }} 
                  disabled={selectedBinData?.is_frozen || startInventoryMutation.isPending}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {startInventoryMutation.isPending ? 'Iniciando...' : 'Iniciar Inventario'}
                </Button>
              )}
              
              {canManageInventory && activeInventory && (
                <div className="flex gap-2">
                  <Button 
                    onClick={handleFinishInventory}
                    disabled={finishInventoryMutation.isPending}
                    variant="default"
                  >
                    <Square className="h-4 w-4 mr-2" />
                    {finishInventoryMutation.isPending ? 'Finalizando...' : 'Finalizar Inventario'}
                  </Button>
                  {hasUnsavedChanges() && (
                    <Button 
                      onClick={() => {
                        setInventoryChanges(getInventoryChanges())
                        setShowChangesPreview(true)
                      }}
                      variant="outline"
                    >
                      Previsualizar Cambios ({Object.keys(editingStock).length})
                    </Button>
                  )}
                </div>
              )}
            </div>
            
            {selectedBinData?.is_frozen && !activeInventory && (
              <Alert><Snowflake className="h-4 w-4" /><AlertDescription>Este bin está congelado: {selectedBinData.frozen_reason}</AlertDescription></Alert>
            )}
            
            {activeInventory && (
              <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>Inventario en proceso. Todos los productos están disponibles para edición.</AlertDescription></Alert>
            )}
          </div>

          {activeInventory && stockData && stockData.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Variante</TableHead>
                  <TableHead>Disponibles</TableHead>
                  <TableHead>Comprometido</TableHead>
                  <TableHead>En Existencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockData.data.map((stock) => (
                  <TableRow key={stock.id} className={isEdited(stock.id) ? 'bg-yellow-50 dark:bg-yellow-950' : ''}>
                    <TableCell>{stock.sku}</TableCell>
                    <TableCell>{stock.nombreProducto}</TableCell>
                    <TableCell>{stock.variante}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        value={getDisplayValue(stock.id)}
                        onChange={(e) => handleStockEdit(stock.id, parseInt(e.target.value) || 0)}
                        className="w-20"
                        disabled={selectedBinData?.is_frozen && !activeInventory}
                      />
                    </TableCell>
                    <TableCell>{stock.comprometido}</TableCell>
                    <TableCell>{stock.en_existencia}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : activeInventory && stockLoading ? (
            <div className="text-center py-8">
              <Skeleton className="h-[200px] w-full" />
            </div>
          ) : !activeInventory ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Inicia un inventario para ver los productos del bin</p>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {selectedBin ? `No hay productos en el bin ${selectedBin}` : 'Selecciona un bin para ver los productos'}
            </div>
          )}

          {activeInventory && stockData && (
            <div className="mt-4 text-sm text-muted-foreground text-center">
              Mostrando todos los {stockData.count} productos del bin
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showChangesPreview} onOpenChange={setShowChangesPreview}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Previsualizar Cambios de Inventario</DialogTitle>
            <DialogDescription>
              Revisa los cambios antes de finalizar el inventario. Solo se aplicarán los cambios mostrados.
            </DialogDescription>
          </DialogHeader>
          
          {inventoryChanges.length > 0 ? (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Cantidad Anterior</TableHead>
                    <TableHead>Cantidad Nueva</TableHead>
                    <TableHead>Diferencia</TableHead>
                    <TableHead>Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryChanges.map((change) => (
                    <TableRow key={change.stock_id}>
                      <TableCell>{change.sku}</TableCell>
                      <TableCell>{change.nombre_producto}</TableCell>
                      <TableCell>{change.previous_quantity}</TableCell>
                      <TableCell>{change.new_quantity}</TableCell>
                      <TableCell className={
                        change.difference > 0 ? 'text-green-600' : 
                        change.difference < 0 ? 'text-red-600' : 'text-gray-600'
                      }>
                        {change.difference > 0 ? '+' : ''}{change.difference}
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          change.change_type === 'increase' ? 'default' :
                          change.change_type === 'decrease' ? 'destructive' : 'secondary'
                        }>
                          {change.change_type === 'increase' ? 'Aumento' :
                           change.change_type === 'decrease' ? 'Disminución' : 'Sin cambio'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowChangesPreview(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={() => {
                    setShowChangesPreview(false)
                    finishInventoryMutation.mutate()
                  }}
                  disabled={finishInventoryMutation.isPending}
                >
                  Confirmar y Finalizar
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No hay cambios para aplicar.</p>
              <div className="flex justify-center gap-2 mt-4">
                <Button variant="outline" onClick={() => setShowChangesPreview(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => {
                  setShowChangesPreview(false)
                  finishInventoryMutation.mutate()
                }}>
                  Finalizar Sin Cambios
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>⚠️ Stock Comprometido Detectado</DialogTitle>
            <DialogDescription>
              No se puede iniciar el inventario porque hay stock comprometido en este bin.
            </DialogDescription>
          </DialogHeader>
          
          {validationResult && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {validationResult.message}
                </AlertDescription>
              </Alert>
              
              {validationResult.committed_stock > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Stock Comprometido: {validationResult.committed_stock} unidades</h4>
                  
                  {validationResult.active_orders && validationResult.active_orders.length > 0 && (
                    <div className="mb-3">
                      <h5 className="font-medium text-sm mb-1">Pedidos Activos:</h5>
                      <ul className="text-sm space-y-1">
                        {validationResult.active_orders.map((order: any, idx: number) => (
                          <li key={idx} className="flex justify-between">
                            <span>{order.pedido_id} ({order.estado})</span>
                            <span>SKU: {order.sku} - {order.stock_comprometido} unidades</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {validationResult.active_sales && validationResult.active_sales.length > 0 && (
                    <div className="mb-3">
                      <h5 className="font-medium text-sm mb-1">Ventas Activas:</h5>
                      <ul className="text-sm space-y-1">
                        {validationResult.active_sales.map((sale: any, idx: number) => (
                          <li key={idx} className="flex justify-between">
                            <span>{sale.venta_id} ({sale.estado})</span>
                            <span>SKU: {sale.sku} - {sale.stock_comprometido} unidades</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setShowValidationDialog(false)}>
                  Cancelar
                </Button>
                <div className="flex gap-2">
                  <Button 
                    variant="secondary"
                    onClick={() => {
                      setShowValidationDialog(false)
                      // Redirect to process orders/sales
                      toast({ 
                        title: 'Recomendación', 
                        description: 'Procese o archive los pedidos/ventas antes de continuar.' 
                      })
                    }}
                  >
                    Procesar Documentos
                  </Button>
                  <Button 
                    variant="destructive"
                    onClick={() => {
                      setShowValidationDialog(false)
                      validateBinForInventory(true) // Force start
                    }}
                  >
                    Forzar Inicio
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Inventory