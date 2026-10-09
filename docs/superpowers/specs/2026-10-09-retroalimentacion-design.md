# Retroalimentación Econexo → Empresas — diseño

**Fecha:** 2026-10-09
**Estado:** aprobado en conversación, pendiente de revisión escrita

## Objetivo

Econexo revisa periódicamente (por lo general cada mes) cómo gestiona sus
residuos cada empresa cliente y quiere entregarle hallazgos, sugerencias y
reconocimientos por escrito, dentro de la app, con constancia de que la empresa
los leyó. Hoy eso no existe o va por fuera (correo, WhatsApp).

**Éxito:** el admin redacta y publica la retroalimentación de una empresa desde
su ficha en pocos minutos; la empresa recibe aviso (push + correo), la ve en su
Dashboard y el admin sabe si ya fue leída.

## Alcance (Fase 1)

Incluye:
- Tabla `feedback_reports` con RLS.
- Editor en la ficha de empresa del admin (`components/ClientOverviewModal.tsx`):
  crear, editar borrador, publicar, eliminar; lista de informes de esa empresa
  con estado y fecha de lectura.
- Aviso a la empresa al publicar, con el `createNotification` existente.
- Tarjeta en el Dashboard del cliente con la última retroalimentación publicada.
- Pantalla `/retroalimentacion` con el historial de la empresa.
- Marcar como leído al abrir un informe.

Fuera de alcance (Fase 2):
- PDF descargable del informe.
- Pestaña de seguimiento en el Panel mensual (qué empresas con retiros ya tienen
  su retroalimentación del mes).
- Estado por punto («resuelto») o respuestas de la empresa.
- «Sugerir con IA» a partir de los retiros del mes.
- Clientes manuales (`UNREGISTERED_CLIENT`): no tienen cuenta donde leerla.

## Modelo de datos

### Tabla `public.feedback_reports`

| Columna        | Tipo        | Notas |
|----------------|-------------|-------|
| `id`           | uuid PK     | `gen_random_uuid()` |
| `company_id`   | uuid        | `REFERENCES auth.users(id) ON DELETE CASCADE` (= `profiles.id`) |
| `period_start` | date        | primer día del período |
| `period_end`   | date        | último día; `CHECK (period_end >= period_start)` |
| `period_label` | text        | lo que ve la empresa: «Septiembre 2026», «T3 2026», o texto libre |
| `summary`      | text        | resumen general, puede ir vacío |
| `items`        | jsonb       | `'[]'`; ver forma abajo |
| `status`       | text        | `'draft' \| 'published'`, `CHECK` |
| `published_at` | timestamptz | se fija al publicar |
| `read_at`      | timestamptz | primera lectura de la empresa |
| `created_by`   | uuid        | `REFERENCES auth.users(id)` |
| `created_at`   | timestamptz | `now()` |
| `updated_at`   | timestamptz | `now()`, lo actualiza el cliente al guardar |

Índice: `(company_id, period_start DESC)`.

Se guarda un rango de fechas y no un `YYYY-MM` porque la cadencia puede ser
mensual, trimestral o libre; `period_label` evita recalcular el texto.

### Forma de `items`

```ts
type FeedbackItemType = 'hallazgo' | 'sugerencia' | 'logro';
type FeedbackPriority = 'alta' | 'media' | 'baja';

interface FeedbackItem {
  id: string;                 // crypto.randomUUID(), estable para keys de React
  type: FeedbackItemType;
  title: string;              // obligatorio
  detail: string;             // puede ir vacío
  priority?: FeedbackPriority; // solo en 'hallazgo'; por defecto 'media'
}
```

Los puntos viven en JSON (como `monthly_closures.companies`) porque en Fase 1
siempre se leen y escriben juntos con su informe.

### RLS

- Admin (`public.is_admin()`): SELECT, INSERT, UPDATE, DELETE sobre todo.
- Empresa: SELECT donde `company_id = auth.uid() AND status = 'published'`.
- La empresa **no** tiene UPDATE. Marca la lectura con una función
  `public.mark_feedback_read(report_id uuid)` `SECURITY DEFINER` que hace
  `UPDATE ... SET read_at = now() WHERE id = report_id AND company_id = auth.uid()
  AND status = 'published' AND read_at IS NULL`. Así la empresa no puede tocar
  el contenido.

La migración repite `CREATE OR REPLACE FUNCTION public.is_admin()` (como la de
cierres) y se corre a mano en el SQL Editor; termina con la consulta de
comprobación a `pg_policies`.

## Lógica pura — `utils/feedback.ts`

Sin Supabase ni DOM, con tests en `utils/feedback.test.ts`.

```ts
defaultPeriod(today: Date): { start: string; end: string; label: string }
  // mes anterior completo, en hora de Chile (reutiliza utils/dateRange.ts)
monthPeriod(year, month): { start, end, label }   // «Septiembre 2026»
quarterPeriod(year, q): { start, end, label }     // «T3 2026»
validateReport(draft): string | null
  // error si: no hay puntos, algún punto sin título, rango inválido
sortItems(items): FeedbackItem[]
  // hallazgos (alta → media → baja), luego sugerencias, luego logros
countByType(items): Record<FeedbackItemType, number>
```

## Acceso a datos — `services/feedbackService.ts`

```ts
listCompanyReports(companyId, { includeDrafts }): FeedbackReport[]
latestPublished(companyId): FeedbackReport | null
saveDraft(report): FeedbackReport           // insert o update; status 'draft'
publish(report, company): FeedbackReport    // valida, status 'published',
                                            // published_at = now(), notifica
deleteReport(id)
markRead(id)                                // rpc('mark_feedback_read')
```

`publish` llama a `createNotification` con `type: 'report'` (ya tiene CTA
«Ver reporte →» al Dashboard en `send-email`, así que no hay que redesplegar
funciones), título «Nueva retroalimentación de Econexo» y mensaje
`«{period_label}: N hallazgos, N sugerencias, N logros»`, con
`metadata: { feedback_id, company_name }`. Si la notificación falla, el informe
queda publicado igual y se muestra un toast de advertencia.

Republicar un informe ya publicado (editar y volver a publicar) actualiza el
contenido sin reenviar aviso ni borrar `read_at`.

## Interfaz

### Admin — `components/admin/FeedbackManager.tsx`

Se abre con un botón «Retroalimentación» en `ClientOverviewModal` (junto a
«Generar CR» / «Generar CGM»). Modal a pantalla completa en móvil con dos vistas:

1. **Lista** de informes de la empresa: período, estado (Borrador / Publicado /
   Leído el dd-mm), conteo por tipo. Botón «Nueva retroalimentación».
2. **Editor**:
   - Período: selector Mes / Trimestre / Personalizado. Por defecto el mes
     anterior. Personalizado pide fechas y etiqueta.
   - Resumen (textarea).
   - Puntos: lista editable; cada uno con tipo (chips Hallazgo / Sugerencia /
     Logro), título, detalle y prioridad (solo hallazgos). Agregar, quitar,
     reordenar no es necesario (se ordena con `sortItems` al mostrar).
   - Acciones: «Guardar borrador», «Publicar» (con confirmación usando
     `useConfirm`), «Eliminar» (solo con confirmación).

Solo aparece para empresas registradas (la ficha ya es de un `profile`).

### Empresa — tarjeta en `screens/Dashboard.tsx`

Si hay al menos un informe publicado: tarjeta «Retroalimentación de Econexo ·
{period_label}» con los conteos por tipo y un punto/indicador «Nuevo» si
`read_at` es null. Al tocarla navega a `/retroalimentacion`. Si no hay
informes, no se muestra nada.

### Empresa — `screens/Feedback.tsx` en `/retroalimentacion`

- Ruta protegida igual que las demás en `App.tsx` (lazy).
- Lista de informes publicados, más reciente primero; el primero viene abierto.
- Cada informe: período, fecha de publicación, resumen y puntos agrupados por
  tipo con su icono (`search` hallazgo, `lightbulb` sugerencia,
  `check_circle` logro) y etiqueta de prioridad en los hallazgos.
- Al abrir un informe no leído llama a `markRead`.
- No se agrega al Navbar (ya está lleno); se entra desde la tarjeta del
  Dashboard y desde la notificación.

## Errores

- Fallo al guardar/publicar: toast de error, el editor conserva lo escrito.
- Validación (`validateReport`) antes de publicar; el borrador puede guardarse
  incompleto excepto el período.
- Si la migración no está aplicada, el servicio devuelve error y la tarjeta del
  Dashboard simplemente no aparece (no rompe la pantalla).

## Pruebas

- `utils/feedback.test.ts` (vitest): períodos (mes anterior en enero → diciembre
  del año previo, trimestres, etiquetas), validación, orden y conteos.
- Verificación manual tras aplicar la migración: admin crea borrador, publica,
  la empresa ve la tarjeta y la notificación, abre el informe, el admin ve
  «Leído». Comprobar con una segunda empresa que no ve informes ajenos ni
  borradores.
- `npm run build` y `npm test` en verde antes del PR; merge y verificación del
  deploy en Vercel.
