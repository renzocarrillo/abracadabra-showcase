import { getVentaAssignments } from './document-helpers.ts'

// ==================================================================================
// SISTEMA DE 2 ESTADOS: disponibles ↔ reservado
// ==================================================================================
// Usado por: Ventas (Sistema unificado con Picking Libre)
// ==================================================================================

// Consume stock from RESERVED state (new 2-state system)
// Used by all document emissions (boleta, factura, ticket, guide)
export async function consumeStockFromReserved(supabase: any, saleId: string) {
  console.log('🔵 [CONSUME_FROM_RESERVED] Consuming stock from reserved state')
  
  const { data: consumeResult, error: consumeError } = await supabase.rpc(
    'consume_stock_from_reserved',
    { sale_id_param: saleId }
  )

  if (consumeError) {
    console.error('❌ CRITICAL: Failed to consume stock:', consumeError)
    throw new Error(`Stock consumption failed: ${consumeError.message}`)
  }

  if (!consumeResult || !consumeResult.success) {
    console.error('❌ CRITICAL: Stock consumption returned failure:', consumeResult)
    throw new Error(consumeResult?.error || 'Stock consumption failed without error details')
  }

  console.log('✅ Stock consumed successfully from reserved:', consumeResult)
  
  return consumeResult
}

// Verify stock is reserved (does NOT consume it)
// Used by documents with guide requirement - verifies but keeps stock reserved
export async function verifyStockReserved(supabase: any, saleId: string) {
  console.log(`🔵 [VERIFY_RESERVED] ==========================================`)
  console.log(`🔵 [VERIFY_RESERVED] Verificando stock reservado para venta ${saleId}`)
  console.log(`🔵 [VERIFY_RESERVED] Timestamp: ${new Date().toISOString()}`)
  
  try {
    const { data: verifyResult, error: verifyError } = await supabase.rpc(
      'verify_stock_reserved',
      { sale_id_param: saleId }
    )
    
    if (verifyError) {
      console.error('❌ [VERIFY_RESERVED] Error verificando stock reservado:', verifyError)
      throw new Error(`Failed to verify reserved stock: ${verifyError.message}`)
    }
    
    if (!verifyResult || !verifyResult.success) {
      console.error('❌ [VERIFY_RESERVED] CRÍTICO - Stock NO está reservado:', verifyResult)
      console.error('❌ [VERIFY_RESERVED] Error:', verifyResult?.error)
      throw new Error(`Stock no está reservado: ${verifyResult?.error}`)
    }
    
    console.log('✅ [VERIFY_RESERVED] Stock verificado y reservado correctamente:')
    console.log(`   - Asignaciones: ${verifyResult.assignment_count}`)
    console.log(`   - Unidades totales: ${verifyResult.total_units_reserved}`)
    console.log(`   - Siguiente paso: ${verifyResult.next_action}`)
    console.log('✅ [VERIFY_RESERVED] El stock será consumido cuando se emita la guía de remisión')
    console.log(`🔵 [VERIFY_RESERVED] ==========================================`)
    
    return verifyResult
  } catch (error) {
    console.error('❌ [VERIFY_RESERVED] Error fatal:', error)
    throw error
  }
}

// Release stock reservation (moves reserved → available)
// Used when sale is cancelled or document emission fails
export async function releaseStockReservation(supabase: any, saleId: string) {
  console.log(`🔵 [RELEASE_RESERVATION] Liberando reservas para venta ${saleId}`)
  
  try {
    const { data: releaseResult, error: releaseError } = await supabase.rpc(
      'release_sale_reservation',
      { sale_id_param: saleId }
    )
    
    if (releaseError) {
      console.error('❌ [RELEASE_RESERVATION] Error liberando reservas:', releaseError)
      throw new Error(`Failed to release reservation: ${releaseError.message}`)
    }
    
    if (!releaseResult || !releaseResult.success) {
      console.error('❌ [RELEASE_RESERVATION] Liberación falló:', releaseResult)
      throw new Error(releaseResult?.error || 'Release failed')
    }
    
    console.log('✅ [RELEASE_RESERVATION] Reservas liberadas:', releaseResult)
    return releaseResult
  } catch (error) {
    console.error('❌ [RELEASE_RESERVATION] Error fatal:', error)
    throw error
  }
}

// ==================================================================================
// FASE 2 COMPLETADA: Sistema de 3 Estados Deprecado Eliminado
// ==================================================================================
// Todas las funciones deprecadas han sido removidas:
// - keepStockCommitted() ❌ ELIMINADO
// - consumeStockStrict() ❌ ELIMINADO
// - verify_and_log_committed_stock (RPC) ❌ NO USAR
//
// Sistema actual: disponibles ↔ reservado → consumido (2 estados + consumo final)
// ==================================================================================
