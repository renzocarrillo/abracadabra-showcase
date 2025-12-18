# 📝 Instrucciones para actualizar package.json

## Scripts npm a agregar

Dado que `package.json` es un archivo de solo lectura en este proyecto, agregar manualmente los siguientes scripts al archivo `package.json`:

```json
{
  "scripts": {
    "tools:load-test": "echo '\n⚠️  ADVERTENCIA: Este script toca datos REALES en Supabase\n⚠️  NO ejecutar contra producción sin supervisión\n' && tsx tools/manual-tests/loadTesting.ts",
    "tools:chaos": "echo '\n⚠️  ADVERTENCIA: Inyecta fallos controlados en sistema REAL\n⚠️  Solo ejecutar en entorno de testing\n' && tsx tools/manual-tests/chaosEngineering.ts",
    "tools:integration-tests": "echo '\n⚠️  ADVERTENCIA: Tests de integración contra datos reales\n' && vitest run tools/manual-tests/integration/"
  }
}
```

## Dependencia necesaria

Si no está instalada, agregar `tsx` como dependencia de desarrollo:

```bash
npm install --save-dev tsx
```

## Uso

Después de agregar los scripts:

```bash
# Load testing
npm run tools:load-test

# Chaos engineering
npm run tools:chaos

# Integration tests
npm run tools:integration-tests
```

## Notas

- Las advertencias en `echo` son intencionales para recordar los riesgos
- `tsx` permite ejecutar TypeScript directamente sin compilar
- Los scripts **NO** deben agregarse al script `test` estándar

---

**Fecha:** 2025-11-27  
**Contexto:** Reorganización de herramientas operativas de testing
