# 🔍 INVESTIGACIÓN: Ventas V1128 y V1127 - Stock No Restado

## FECHA ANÁLISIS
19 de Noviembre, 2025 - 04:30 UTC

## PROBLEMA REPORTADO
Las ventas V1128 y V1127 no restaron stock de Abracadabra después de emitir documentos y guía de remisión.

---

## HALLAZGOS CRÍTICOS

### 1. ✅ Ventas Procesadas Correctamente en BSale
- **V1127**: Boleta 100885 + Guía 256 emitida exitosamente
- **V1128**: Boleta 100887 + Guía 257 emitida exitosamente
- Estado: `archivado` ✓
- Guía emitida: `true` ✓

### 2. ❌ Stock NO Fue Restado en Abracadabra

**SKU 10607046 (V1128):**
```
Bin: Transito
Disponibles: 1 ← DEBERÍA SER 0
Comprometido: 0
En existencia: 1 ← DEBERÍA SER 0
Actualizado: 2025-11-18 15:01:26 (momento de emisión guía)
```

**SKU 10621226 (V1127):**
```
Bin: Transito
Disponibles: 128 ← DEBERÍA SER 127
Comprometido: 0
En existencia: 128 ← DEBERÍA SER 127
Actualizado: 2025-11-18 14:48:46 (momento de emisión guía)
```

### 3. 🚨 ASIGNACIONES FUERON ELIMINADAS

**Estado actual:**
- `SELECT COUNT(*) FROM ventas_asignaciones` → **0 registros**
- NO solo V1127/V1128, TODAS las asignaciones del sistema están vacías
- Esto es ANORMAL - deberían existir asignaciones para ventas no archivadas

### 4. 📋 Audit Log Muestra Flujo Incompleto

**Timeline V1128:**
```
15:00:48 → asignacion_bins (1 unidad asignada) ✅
15:01:26 → documento_emitido → archivado (38 segundos después) ⚠️
```

**LO QUE FALTA:**
- NO hay registro de `consumo_stock` en el audit log
- Esto significa que `consume_stock_strict()` NUNCA se ejecutó

---

## CAUSA RAÍZ IDENTIFICADA

### El Problema: Race Condition en el Flujo de Emisión con Guía

**Flujo Esperado:**
```
1. Crear venta → Estado: 'borrador'
2. Asignar bins → Crear registros en ventas_asignaciones
3. Emitir boleta/factura CON guía → Estado: 'documento_emitido'
   ├─ Llamar keepStockCommitted() ← Solo hace console.log, NO valida
   └─ Stock permanece COMPROMETIDO
4. Emitir guía de remisión → Estado: 'archivado'  
   ├─ Llamar consumeStockStrict()
   ├─ Consumir stock desde comprometido
   └─ Eliminar asignaciones
```

**Flujo Actual (ROTO):**
```
1. ✅ Crear venta
2. ✅ Asignar bins  
3. ✅ Emitir boleta con guía
   ├─ ✅ BSale crea documento
   ├─ ❌ keepStockCommitted() solo hace log, NO verifica
   └─ ⚠️  Estado cambia a 'documento_emitido'
4. 🚨 PROBLEMA: Las asignaciones se ELIMINAN antes de emitir guía
5. ❌ Emitir guía → NO puede consumir stock (no hay asignaciones)
   ├─ consume_stock_strict() retorna error
   └─ Guía se emite de todas formas pero stock NO se resta
```

### ¿Por Qué se Eliminan las Asignaciones?

**Hipótesis Principal: Trigger `auto_cleanup_archived_stock`**

El trigger se activa BEFORE UPDATE cuando `estado` cambia a 'archivado':

```sql
CREATE TRIGGER trigger_auto_cleanup_archived_sales
    BEFORE UPDATE ON ventas
    FOR EACH ROW
    EXECUTE FUNCTION auto_cleanup_archived_stock();
```

**Posible Escenario:**
1. `emit-boleta-with-guide` cambia estado → 'documento_emitido'
2. `emit-guide-remision` cambia estado → 'archivado' 
3. **Trigger se activa ANTES del UPDATE**
4. Trigger encuentra asignaciones y las elimina (pensando que el stock ya fue consumido)
5. Edge function continúa ejecutándose
6. Intenta consumir stock pero ya no hay asignaciones
7. Guía se emite pero stock NO se resta

---

## SOLUCIONES IMPLEMENTADAS

### 1. ✅ Tabla de Auditoría Completa
Se creó `ventas_asignaciones_audit` que registra:
- Toda creación de asignaciones
- Toda eliminación de asignaciones (con contexto)
- Usuario, función, trigger que causó el cambio
- Timestamp exacto

### 2. ✅ Trigger de Auditoría
`trigger_audit_ventas_asignaciones` captura:
- INSERT → Registra cuándo se crean asignaciones
- DELETE → **Registra quién/qué elimina asignaciones** ⭐
- Logs en Postgres con RAISE NOTICE/WARNING

### 3. ✅ Función `verify_and_log_committed_stock()`
Nueva función que:
- Verifica que asignaciones existan
- Cuenta unidades comprometidas
- Registra en ventas_audit_log
- Retorna error si no hay asignaciones

### 4. ✅ Mejorar `keepStockCommitted()`
Ahora:
- Llama a `verify_and_log_committed_stock()`
- Valida que asignaciones existan
- Falla LOUD si no hay asignaciones
- Logs exhaustivos

### 5. ✅ Mejorar `auto_cleanup_archived_stock()`
Ahora:
- Logs cuando se activa
- Logs cuando encuentra asignaciones
- **WARNING cuando libera stock**
- Registra en audit log

---

## PRÓXIMOS PASOS PARA DIAGNÓSTICO

Con este sistema de logs, la próxima vez que ocurra el problema:

### Para Investigar una Venta:
```sql
-- Ver historial completo de asignaciones
SELECT * FROM get_assignment_history('V1128');

-- Ver audit log completo
SELECT * FROM ventas_audit_log WHERE venta_codigo = 'V1128' ORDER BY created_at;

-- Ver si el stock fue verificado como comprometido
SELECT * FROM ventas_audit_log 
WHERE venta_codigo = 'V1128' AND accion = 'stock_kept_committed';
```

### En Postgres Logs:
Buscar:
- `[AUDIT] ASIGNACIÓN ELIMINADA` ← Cuándo se eliminó
- `[AUTO_CLEANUP]` ← Si el trigger interfirió
- `[KEEP_COMMITTED]` ← Si la verificación falló
- `[CONSUME_STRICT]` ← Si el consumo falló

### En Edge Function Logs:
- `emit-boleta-with-guide` o `emit-factura-with-guide`
- `emit-guide-remision`
- Buscar mensajes de error o warnings

---

## HERRAMIENTAS CREADAS

### 1. Página de Diagnóstico
`/diagnostico-asignaciones` - Interfaz web para:
- Buscar cualquier venta por código
- Ver historial completo de asignaciones
- Ver estado actual de asignaciones
- Ver audit log
- Diagnóstico automático del problema

### 2. Función SQL Helper
```sql
SELECT * FROM get_assignment_history('V1XXX');
```

---

## ANÁLISIS DE ROOT CAUSE PARA V1127 Y V1128

**¿Por qué no funcionó tu usuario vs los colaboradores?**

NO es un problema de permisos. Es un problema de **TIMING** y **ESTADO DE LA VENTA**.

**Teoría más probable:**
- Estas ventas pueden haber sido creadas con un estado inicial diferente
- O pueden haber pasado por un flujo de emisión diferente
- O el trigger `auto_cleanup` se activó en un momento inesperado

**Para confirmar:** Necesitamos ver los logs de Postgres del momento exacto de emisión (18 Nov 14:47 y 15:00).

---

## RECOMENDACIONES FINALES

### Corto Plazo:
1. ✅ Sistema de logs implementado
2. 🔜 Emitir nuevas ventas y verificar que ahora SÍ se capture el problema
3. 🔜 Revisar Postgres logs para V1127 y V1128 específicamente

### Mediano Plazo:
- Considerar cambiar el trigger de BEFORE a AFTER
- O desactivar auto_cleanup para ventas y hacer cleanup manual
- O agregar flag en ventas para marcar "stock_ya_consumido"

### Largo Plazo:
- Refactorizar flujo de emisión con máquina de estados
- Implementar transacciones distribuidas
- Agregar reintentos automáticos

---

## CONCLUSIÓN

El problema NO es de permisos. Es un bug en la arquitectura del flujo de emisión con guía de remisión.

Con el sistema de logs ahora implementado, la próxima vez que ocurra este problema tendremos evidencia forense completa de:
- Cuándo se crearon las asignaciones
- Cuándo se eliminaron las asignaciones  
- Quién/qué las eliminó
- Si el trigger auto_cleanup interfirió
- Si consume_stock_strict() se ejecutó
- Errores exactos en cada paso

**El sistema está ahora instrumentado para capturar el bug en acción.**
