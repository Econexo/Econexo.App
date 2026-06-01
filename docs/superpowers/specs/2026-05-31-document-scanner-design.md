# Diseño — Escáner de documentos (tipo Adobe Scan)

Fecha: 2026-05-31

## Objetivo

Permitir escanear documentos en papel desde la cámara del teléfono dentro de la
propia PWA EcoNexo, evitando apps externas (Adobe Scan). El escaneo detecta el
documento automáticamente, corrige la perspectiva, aplica un filtro de documento
(B/N), arma un PDF multi-página y lo guarda en la sección Documentos.

## Decisiones tomadas

- **Nivel de escaneo:** automático tipo Adobe, usando OpenCV.js (detección de
  contorno + corrección de perspectiva), cargado de forma diferida.
- **Enfoque técnico:** captura una foto y *luego* detecta el contorno (no stream
  en vivo con auto-disparo). Las 4 esquinas detectadas son ajustables por el
  usuario antes de confirmar.
- **Multi-página:** sí. El usuario captura varias hojas, las ve como lista
  (miniaturas), puede reordenar/eliminar/reescanear, y al final se arma un solo
  PDF.
- **Destino:** guardar en Documentos (subir el PDF a Supabase Storage + crear
  fila en la tabla `documents`). No se ofrece "solo descargar".

## Arquitectura y componentes

Pantalla nueva `screens/Scan.tsx` (ruta `/scan`), accesible desde un botón en
`Documents.tsx`. La lógica de visión vive en módulos aislados para mantener los
archivos enfocados y testeables:

- **`services/opencvLoader.ts`** — carga OpenCV.js una sola vez (script desde
  `public/` o CDN), expone estado de carga (`loading | ready | error`).
- **`services/docScanner.ts`** — funciones puras sobre `<canvas>`/`ImageData`:
  - `detectCorners(img)` → contorno del documento (4 puntos).
  - `warpPerspective(img, corners)` → imagen enderezada.
  - `applyFilter(img, mode)` → `bw` (documento B/N), `gray`, `color`.
- **`services/scanToPdf.ts`** — recibe la lista de páginas procesadas y arma el
  PDF con jspdf (ya instalado).
- **`services/documentUpload.ts`** — sube el PDF al bucket privado `documents` e
  inserta la fila en la tabla `documents`.

`Scan.tsx` orquesta el flujo y mantiene el estado de las páginas; ninguna lógica
de visión vive dentro del componente.

## Flujo de datos

1. Usuario entra a `/scan` → se dispara la carga diferida de OpenCV.js.
2. Captura foto con `<input type="file" accept="image/*" capture="environment">`
   (mismo patrón que `screens/Analyze.tsx`).
3. `docScanner.detectCorners` detecta el documento → preview con las 4 esquinas
   ajustables (arrastrables) → al confirmar, `warpPerspective` + `applyFilter`.
4. La página procesada entra a una **lista** de miniaturas: reordenar, eliminar,
   reescanear, "añadir página".
5. Al finalizar: el usuario elige **carpeta** (Econexo/Gestores), **tipo** y
   **título** → `scanToPdf` arma el PDF → `documentUpload` sube a Storage e
   inserta la fila → navega a Documentos con toast de éxito.

## Modelo de datos y seguridad (Zero Trust)

- **Bucket nuevo `documents`, privado** (no público). Migración SQL nueva en
  `supabase/migrations/` con políticas RLS calcadas de `avatars`
  (`20260102_storage_policies.sql`): cada usuario solo lee/escribe en su carpeta
  `documents/{auth.uid()}/...`.
- Fila en la tabla `documents` (esquema existente: `id, user_id, title, type,
  content_url, metadata, created_at, verified`):
  - `type` según la carpeta elegida, encajando con los filtros actuales de
    `Documents.tsx` (p. ej. `declaration` / `custom` para Gestores).
  - `verified: false`.
  - `content_url` = **ruta** del objeto en Storage (no URL pública).
- **Descarga vía signed URL:** el bucket es privado, así que `handleDownload` en
  `Documents.tsx` (hoy hace `window.open(content_url)`) se ajusta para generar
  una signed URL bajo demanda cuando `content_url` es una ruta de Storage. Se
  mantiene compatibilidad con documentos antiguos que ya traen URL absoluta.
- Sin credenciales hardcodeadas; todo usa el cliente Supabase ya autenticado.

## Fuera de alcance (YAGNI)

- **OCR / texto buscable:** no se incluye (metería Tesseract.js, pesado, sin
  valor para guardar certificados como PDF). Reconsiderar solo si se pide.
- **Auto-disparo en vivo** (stream con detección por frame): descartado por
  costo de rendimiento/batería en móvil.

## Pruebas

- `docScanner` y `scanToPdf` son funciones puras → tests con imágenes de muestra
  (entrada conocida → esquinas / PDF esperado).
- Verificación manual en navegador móvil: capturar un certificado real, ajustar
  esquinas, multi-página, guardar, y confirmar que aparece en Documentos y se
  abre correctamente (signed URL).
