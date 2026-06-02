# Diseño — Escáner de documentos (tipo Adobe Scan)

Fecha: 2026-05-31

## Objetivo

Permitir que el **administrador** escanee documentos en papel desde la cámara del
teléfono dentro de la propia PWA EcoNexo, evitando apps externas (Adobe Scan), y
los **asigne a un cliente**. El escaneo detecta el documento automáticamente,
corrige la perspectiva, aplica un filtro de documento (B/N), arma un PDF
multi-página y lo guarda asociado al cliente elegido (igual que el flujo actual
"Subir Documento" del panel de admin).

## Decisiones tomadas

- **Ubicación:** dentro del **panel de Admin** (`screens/Admin.tsx`), como una
  nueva acción rápida "Escanear Documento". No vive en la pantalla Documentos del
  usuario final. La ruta `/scan` queda protegida para administradores.
- **Destinatario:** el documento escaneado se **asigna a un cliente** elegido por
  el admin, reutilizando exactamente el patrón del modal "Subir Documento":
  selector de empresa, origen (Gestor/EcoNexo), tipo y fecha, vía la RPC
  `create_admin_document` + notificación al cliente (`createNotification`).
- **Nivel de escaneo:** automático tipo Adobe, usando OpenCV.js (detección de
  contorno + corrección de perspectiva), cargado de forma diferida.
- **Enfoque técnico:** captura una foto y *luego* detecta el contorno (no stream
  en vivo con auto-disparo). Las 4 esquinas detectadas son ajustables por el
  usuario antes de confirmar.
- **Multi-página:** sí. El admin captura varias hojas, las ve como lista
  (miniaturas), puede reordenar/eliminar/reescanear, y al final se arma un solo
  PDF.
- **Destino:** guardar el PDF en un **bucket nuevo privado** y crear la fila en
  la tabla `documents` asociada al cliente. No se ofrece "solo descargar".

## Arquitectura y componentes

Pantalla nueva `screens/Scan.tsx` (ruta `/scan`, protegida para admin),
accesible desde un botón "Escanear Documento" en las acciones rápidas de
`screens/Admin.tsx`. La lógica de visión vive en módulos aislados para mantener
los archivos enfocados y testeables:

- **`services/opencvLoader.ts`** — carga OpenCV.js una sola vez (script desde
  `public/` o CDN), expone estado de carga (`loading | ready | error`).
- **`services/docScanner.ts`** — funciones sobre `<canvas>`/`ImageData`:
  - `detectDocument(cv, canvas)` → contorno del documento (4 puntos) o `null`.
  - `warpDocument(cv, canvas, corners)` → imagen enderezada.
  - `applyFilter(cv, canvas, mode)` → `bw` (documento B/N), `gray`, `color`.
- **`services/scanGeometry.ts`** y **`services/pdfGeometry.ts`** — funciones
  puras de geometría (ordenar esquinas, tamaño de salida, ajuste A4) con tests.
- **`services/scanToPdf.ts`** — recibe la lista de páginas procesadas y arma el
  PDF con jspdf (ya instalado).
- **`services/documentUpload.ts`** — sube el PDF al **bucket nuevo privado**
  `scanned-docs` (carpeta del cliente), crea la fila vía RPC
  `create_admin_document` y notifica al cliente. Reutiliza el mismo patrón que
  `handleUploadDocument` de `Admin.tsx`.

`Scan.tsx` orquesta el flujo, mantiene el estado de las páginas y, al finalizar,
muestra los selectores de cliente/origen/tipo/fecha; ninguna lógica de visión ni
de subida vive dentro del componente.

## Flujo de datos

1. Admin entra a `/scan` (desde "Escanear Documento" en Admin) → se dispara la
   carga diferida de OpenCV.js.
2. Captura foto con `<input type="file" accept="image/*" capture="environment">`
   (mismo patrón que `screens/Analyze.tsx`).
3. `docScanner.detectDocument` detecta el documento → preview con las 4 esquinas
   ajustables (arrastrables) → al confirmar, `warpDocument` + `applyFilter`.
4. La página procesada entra a una **lista** de miniaturas: reordenar, eliminar,
   reescanear, "añadir página".
5. Al finalizar: el admin elige **cliente (empresa)**, **origen** (Gestor/EcoNexo),
   **tipo** y **fecha** (mismos selectores que el modal "Subir Documento") →
   `scanToPdf` arma el PDF → `documentUpload` sube al bucket privado en la carpeta
   del cliente, crea la fila vía `create_admin_document` y notifica al cliente →
   navega de vuelta al panel de Admin con toast de éxito.

## Modelo de datos y seguridad (Zero Trust)

- **Bucket nuevo `scanned-docs`, privado** (no público), **separado** del bucket
  `documents` existente (que sigue siendo público e intacto, junto con sus
  documentos actuales). Migración SQL nueva en `supabase/migrations/` con
  políticas RLS:
  - **Lectura (SELECT):** el dueño de la carpeta (`scanned-docs/{client_id}/...`,
    es decir `(storage.foldername(name))[1] = auth.uid()::text`) **o** un admin
    (`profiles.is_admin = true` / email `econexo.hub@gmail.com`). Necesario para
    que el cliente abra su PDF por signed URL y el admin pueda previsualizar.
  - **Escritura (INSERT/UPDATE/DELETE):** solo admin, porque el admin sube a la
    carpeta de cualquier cliente. Patrón calcado de
    `20251231_admin_documents_policy.sql`.
- Fila en la tabla `documents` (esquema existente: `id, user_id, title, type,
  content_url, metadata, created_at, verified`), creada vía la RPC
  `create_admin_document` (igual que el flujo actual):
  - `user_id` = cliente elegido.
  - `type` según origen/tipo elegidos (mismos valores que "Subir Documento").
  - `content_url` = **ruta** del objeto en `scanned-docs` (no URL pública).
  - `metadata.source = 'scanner'` (+ datos del archivo).
- **Descarga vía signed URL:** como el bucket es privado, `handleDownload` en
  `Documents.tsx` (hoy hace `window.open(content_url)`) se ajusta: si
  `content_url` es una URL absoluta (`http(s)://`, documentos antiguos del bucket
  público) abre directo; si es una ruta de Storage, genera una signed URL bajo
  demanda desde el bucket `scanned-docs`.
- Sin credenciales hardcodeadas; todo usa el cliente Supabase ya autenticado.

## Fuera de alcance (YAGNI)

- **OCR / texto buscable:** no se incluye (metería Tesseract.js, pesado, sin
  valor para guardar certificados como PDF). Reconsiderar solo si se pide.
- **Auto-disparo en vivo** (stream con detección por frame): descartado por
  costo de rendimiento/batería en móvil.

## Pruebas

- `scanGeometry` y `pdfGeometry` son funciones puras → tests unitarios (entrada
  conocida → esquinas ordenadas / tamaño A4 esperado).
- Verificación manual en navegador móvil (como admin): capturar un certificado
  real, ajustar esquinas, multi-página, elegir cliente/origen/tipo/fecha,
  guardar, y confirmar (a) que el admin vuelve al panel con toast de éxito y
  (b) que al iniciar sesión como ese cliente el PDF aparece en Documentos y se
  abre correctamente vía signed URL.
