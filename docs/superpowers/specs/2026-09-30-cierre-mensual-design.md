# Cierre mensual por gestor — diseño

**Fecha:** 2026-09-30
**Estado:** aprobado en conversación, pendiente de revisión escrita

## Objetivo

Cada fin de mes, el gestor (hoy GCR; mañana también SOREPA u otro) necesita el
detalle de kilos y residuos de cada empresa para emitir sus certificados. Hoy
eso se arma a mano. El cierre mensual lo arma solo desde los retiros del mes,
deja elegir a qué gestor va cada empresa, guarda lo enviado y descarga el
detalle listo para mandar.

**Éxito:** en menos de un minuto el admin revisa el mes, confirma los gestores
(precargados del mes anterior), cierra y descarga un Excel y un PDF por gestor
cuyos totales cuadran con los certificados de transporte.

## Alcance

Incluye:
- Pestaña «Cierre mensual» en el Panel mensual (`screens/MonthlyPanel.tsx`), solo admin.
- Asignación de gestor **por empresa** (no por residuo).
- Guardado del cierre por período y gestor, con copia fija de los datos.
- Aviso cuando los retiros del mes cambiaron después de cerrar, y re-cierre.
- Exportación por gestor: Excel (.xls) y PDF.

Fuera de alcance:
- Asignar gestor por residuo o por retiro individual.
- Enviar el cierre por correo desde la app.
- Que el cliente vea los cierres.
- Cambios en el flujo de emisión de CT.

## Datos de entrada

Los mismos documentos que ya usa el Panel mensual: `documents` con
`type IN WASTE_DOC_TYPES` y `verified = true`, dentro de `monthRange(año, mes)`
(`utils/dateRange.ts`, en hora de Chile).

**Empresa de cada retiro:** `metadata.unregistered_client_id ?? user_id`. Los
retiros de clientes manuales quedan a nombre del operario; sin esta regla el
cierre se los atribuiría al operario.

**Nombre y RUT:** registrados desde `profiles (company_name, rut)`; manuales desde
`documents` de tipo `UNREGISTERED_CLIENT` (`metadata.company_name`, `metadata.rut`),
igual que en `screens/Admin.tsx`.

**Residuos y kilos:** `wasteItemsOf(doc)` + `parseQuantity` + `normalizeMaterialType`
(las mismas funciones que el panel), agrupados por material dentro de cada empresa.
Solo entra lo marcado como **valorización** en el CT: lo que va a RESCON o a
relleno sanitario no lo recibe el gestor, y sumarlo descuadraba el cierre con el
que devuelve GCR (caso madera → RESCON, 2026-10-01). Eso se muestra aparte, como
informativo, y no entra al Excel ni al PDF. Los CT sin nada valorizado no se listan.

**N° de CT:** `metadata.cert_number` de cada documento, pasado por
`toTransportLabel` para que diga CT y no CR.

**Gestores:** la tabla existente `cgm_destinations` (`active = true`).

## Lógica pura — `utils/monthlyClosure.ts`

Sin Supabase ni DOM, con tests en `utils/monthlyClosure.test.ts`.

```ts
interface ClosureCompany {
  companyId: string;        // profile id o id del UNREGISTERED_CLIENT
  name: string;
  rut: string;
  isManual: boolean;
  materials: { material: string; kg: number }[];  // kg truncados a 1 decimal
  totalKg: number;          // suma de las filas truncadas (sumTruncated)
  certNumbers: string[];    // CT del mes, ordenados
}

buildClosureCompanies(docs, companiesById): ClosureCompany[]
groupByDestination(companies, assignment: Record<companyId, destinationId | null>)
  → Map<destinationId, ClosureCompany[]>   // null = «No incluir», queda fuera
defaultAssignment(companies, lastSnapshots) → Record<companyId, destinationId | null>
  // gestor del cierre más reciente en que aparece la empresa; si no hay, null
snapshotFingerprint(companies) → string
  // huella estable (empresa, material, kg, CT) para detectar cambios después del cierre
```

Los kilos se truncan y suman igual que en `utils/formatKg.ts`, para que el total
del cierre coincida con lo que el gestor suma a mano de los CT.

## Persistencia — `monthly_closures`

Migración nueva `supabase/migrations/20260930_create_monthly_closures.sql`, que
se corre a mano en el SQL Editor.

| columna          | tipo        | nota |
|------------------|-------------|------|
| id               | uuid pk     | |
| period           | text        | 'YYYY-MM' |
| destination_id   | uuid        | FK `cgm_destinations(id)` |
| destination_name | text        | copia, por si el gestor cambia de nombre |
| companies        | jsonb       | `ClosureCompany[]` enviados a ese gestor |
| total_kg         | numeric     | |
| fingerprint      | text        | `snapshotFingerprint` del mes completo al cerrar |
| closed_by        | uuid        | `auth.uid()` |
| closed_at        | timestamptz | default now() |

`UNIQUE (period, destination_id)`: re-cerrar hace upsert y reemplaza.
RLS: select, insert, update y delete solo para admin (`public.is_admin()`, definida en `20260824_security_hardening.sql`).

Al cerrar un mes se hace upsert de un registro por cada gestor con al menos una
empresa asignada, y se borran los registros de ese período cuyo gestor ya no
tenga empresas.

## Pantalla

Pestaña «Cierre mensual» junto a la vista actual del panel, visible solo si
`isAdmin`. Usa el mismo selector de período.

- **Estado del mes:** «Sin cerrar» / «Cerrado el dd-mm-aaaa por …» /
  «Cambió desde el cierre» (la huella actual no coincide con la guardada).
- **Lista de empresas** con retiros en el mes: nombre, RUT, total kg, n° de CT,
  detalle de residuos desplegable y un selector de gestor (gestores activos +
  «No incluir»), precargado con `defaultAssignment`.
- **Resumen por gestor:** empresas y kg totales que van a cada uno.
- **Botón «Cerrar mes»** (o «Volver a cerrar»): guarda y deja habilitadas las
  descargas.
- **Descargas por gestor** (desde el cierre guardado, no desde el estado en
  pantalla): Excel y PDF.

Si alguna empresa queda sin gestor elegido, «Cerrar mes» pide confirmar que
esas empresas quedan fuera.

## Exportación

**Excel (.xls)** — TSV con BOM, la misma técnica que ya usa `screens/Documents.tsx`, sin
dependencias nuevas. Columnas: Empresa · RUT · Residuo · Kg · N° CT. Subtotal por
empresa y total general. Nombre: `Cierre_<Gestor>_<YYYY-MM>.xls`.

**PDF** — jsPDF + autoTable, como el PDF del panel: encabezado verde EcoNexo,
gestor con RUT y resolución, período, tabla por empresa con subtotales y total.
Nombre: `Cierre_<Gestor>_<YYYY-MM>.pdf`.

## Errores

- Falla la carga: toast «No se pudo cargar el cierre» y la pestaña queda vacía.
- Falla el guardado: toast con el error y nada queda a medio cerrar (upserts
  primero; el borrado de gestores sobrantes solo si todos los upserts salieron bien).
- Mes sin retiros: mensaje «No hay retiros en <mes>» y botón deshabilitado.
- Sin gestores activos: aviso con enlace a administrar gestores.

## Tests

`utils/monthlyClosure.test.ts` (vitest, con `TZ=America/Santiago`):
- Retiro de cliente manual se atribuye al cliente, no al operario.
- Agrupa por material dentro de la empresa; total = suma de filas truncadas.
- Retiro del último día del mes entra; el del día 1 del mes siguiente no.
- `groupByDestination` deja fuera las empresas con `null`.
- `defaultAssignment` toma el gestor del cierre más reciente.
- `snapshotFingerprint` cambia si cambia un kg o aparece un CT; no cambia si solo
  cambia el orden de los documentos.

Pantalla y exportes se verifican a mano en la app (build + prueba con un mes real).
