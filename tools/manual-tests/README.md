# ⚠️ HERRAMIENTAS DE TESTING OPERATIVO

**ADVERTENCIA CRÍTICA:** Estos scripts tocan datos REALES en Supabase y modifican tablas de producción. NO ejecutar en producción sin supervisión y entorno controlado.

## 🚨 Riesgos

- **Consumen stock real** de `stockxbin`
- **Crean sesiones de picking libre** en producción
- **Generan registros en audit logs** con datos de prueba
- **Pueden dejar "sesiones zombie"** si se interrumpen
- **Invocan edge functions reales** que llaman a APIs externas (Bsale)

## 📋 Requisitos

1. **Entorno de pruebas separado:**
   - Configurar archivo `.env.test` con credenciales de staging/test
   - NUNCA usar credenciales de producción

2. **Dependencias:**
   ```bash
   npm install tsx --save-dev
   ```

3. **Limpieza post-ejecución:**
   - Revisar y eliminar sesiones de prueba creadas
   - Verificar estado de stock en bins usados
   - Limpiar registros de `picking_libre_audit_log`

## 🛠️ Scripts Disponibles

### 1. Load Testing (`loadTesting.ts`)

Simula usuarios concurrentes ejecutando flujo completo de picking libre.

**Operaciones:**
- Crear sesiones de picking
- Escanear productos (5 por usuario)
- Finalizar sesiones

**Ejecución:**
```bash
npm run tools:load-test
```

**Configuración:**
```typescript
// Ejecutar con 10 usuarios concurrentes
runLoadTest(10)

// Ejecutar test incremental (1, 5, 10, 20 usuarios)
runIncrementalLoadTest()

// Stress test (incrementa usuarios hasta 5% error rate)
runStressTest()
```

**Datos generados:**
- Sesiones con `created_by: "load-test-user-{N}"`
- SKUs: `TEST-SKU-{0-99}`
- Bins: `A{0-9}-0{1-9}`

### 2. Chaos Engineering (`chaosEngineering.ts`)

Inyecta fallos controlados para validar resiliencia del sistema.

**Escenarios:**
- ❌ Fallos de Bsale API (stores inválidas)
- ⏱️ Lock timeouts en base de datos
- 🐌 Latencia de red (delays artificiales)
- 🧟 Sesiones zombie inducidas

**Ejecución:**
```bash
npm run tools:chaos
```

**Configuración:**
```typescript
// Ejecutar todos los escenarios
runAllChaosTests()

// Ejecutar escenario específico
simulateBsaleFailure()
simulateLockTimeout()
simulateNetworkLatency(3000) // 3 segundos de delay
simulateZombieSession()
```

**Datos generados:**
- Sesiones con `created_by: "chaos-test"`
- SKUs: `CHAOS-SKU-*`, `ZOMBIE-SKU`
- Bins: `Z9-99`, `Z1-01`

### 3. Integration Tests (`integration/`)

Tests de integridad que validan comportamiento correcto bajo condiciones adversas.

#### `pickingLibreIdempotency.ts`
Valida que reintentos de emisión no causen duplicados.

**Tests:**
- ✅ Cache de respuestas con mismo `idempotency_key`
- ✅ Respeto de MAX_RETRIES (3 intentos máximo)
- ✅ Registro correcto de estados (pending, completed, failed)
- ✅ Unicidad de `idempotency_key`

#### `pickingLibreRaceConditions.ts`
Valida prevención de race conditions en operaciones concurrentes.

**Tests:**
- ✅ Prevención de doble finalización (doble clic)
- ✅ Consumo atómico de stock (sin sobreventa)
- ✅ Detección de conflictos con `data_version`
- ✅ Manejo correcto de locks de DB

**Ejecución:**
```bash
# Ejecutar con vitest (requiere configurar vitest)
npx vitest run tools/manual-tests/integration/
```

## 🧹 Limpieza Post-Ejecución

Después de ejecutar cualquier script, limpiar los datos de prueba:

```sql
-- Eliminar sesiones de prueba
DELETE FROM picking_libre_sessions 
WHERE created_by IN ('load-test-user-%', 'chaos-test', 'test-user-id');

-- Eliminar items escaneados de prueba
DELETE FROM picking_libre_items 
WHERE sku LIKE 'TEST-SKU-%' OR sku LIKE 'CHAOS-SKU-%' OR sku LIKE 'ZOMBIE-SKU%';

-- Limpiar emissions fallidas
DELETE FROM picking_libre_emissions 
WHERE emission_type = 'traslado_interno' 
  AND status = 'failed' 
  AND created_at < NOW() - INTERVAL '1 hour';

-- Limpiar audit logs de prueba
DELETE FROM picking_libre_audit_log 
WHERE user_id IN ('load-test-user-%', 'chaos-test', 'test-user-id');

-- Restaurar stock en bins de prueba (si es necesario)
UPDATE stockxbin 
SET disponibles = en_existencia, comprometido = 0, reservado = 0 
WHERE bin LIKE 'Z%';
```

## 📊 Métricas Esperadas

### Load Testing
- **Tasa de éxito:** >95% con 10 usuarios concurrentes
- **Tiempo promedio:** <500ms por operación
- **P95:** <1000ms
- **P99:** <2000ms

### Chaos Engineering
- **Recovery:** 100% de escenarios deben recuperarse
- **Error logging:** Todos los fallos deben registrarse en audit log
- **Stock integrity:** Stock nunca debe quedar negativo

## 🔒 Seguridad

- **NUNCA** commitear credenciales reales
- **NUNCA** ejecutar contra producción sin backup
- **SIEMPRE** revisar y limpiar datos residuales
- **SIEMPRE** usar entorno de staging/test

## 📞 Soporte

Si algún script deja el sistema en estado inconsistente:
1. Ejecutar scripts de limpieza SQL
2. Correr `recover-zombie-sessions` edge function
3. Verificar integridad de stock con `check-picking-libre-health`

---

**Última actualización:** 2025-11-27  
**Mantenedor:** Equipo de Infraestructura
