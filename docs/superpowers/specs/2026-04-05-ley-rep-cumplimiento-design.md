# Diseño: Pantalla de Cumplimiento Ley REP

**Fecha:** 2026-04-05  
**Estado:** Aprobado  
**Alcance:** Nueva pantalla `LeyREP.tsx` con seguimiento de metas legales por material y DS

---

## Contexto

Econexo gestiona retiros de residuos de empresas chilenas. La Ley REP (Ley 20.920) obliga a productores/importadores de ciertas categorías de productos a cumplir metas de recolección y valorización. La app ya registra los materiales recuperados en Certificados de Recepción (CRs). Esta pantalla cruza esos datos con las metas legales de cada DS para mostrar el estado de cumplimiento.

**Categorías cubiertas:**
- DS 12/2021 — Envases y Embalajes
- DS 8/2021 — Neumáticos
- DS 10/2021 — RAEE (Aparatos Eléctricos y Electrónicos)

**Excluidas** (residuos peligrosos): Pilas/baterías, aceites lubricantes.

---

## Gate de Acceso

La pantalla verifica `is_ley_rep` del perfil del usuario (campo existente en tabla `profiles`).

- **`is_ley_rep = false`:** Muestra banner informativo con explicación de qué es Ley REP, cuándo aplica, y botón "Ir a Perfil" para activarlo. No muestra datos de cumplimiento.
- **`is_ley_rep = true`:** Muestra pantalla completa.

---

## Layout (is_ley_rep = true)

```
[ Header: "Cumplimiento Ley REP" ]
[ Selector de año ]

[ Tarjeta: Resumen General ]
  → Badge por categoría: Envases | Neumáticos | RAEE
  → Cada badge: cumpliendo / en_riesgo / incumpliendo / sin_datos

[ Sección: DS 12/2021 — Envases y Embalajes ]
  → MaterialCard: Papel/Cartón
  → MaterialCard: Plástico
  → MaterialCard: Vidrio
  → MaterialCard: Metales

[ Sección: DS 8/2021 — Neumáticos ]
  → MaterialCard: Neumáticos

[ Sección: DS 10/2021 — RAEE ]
  → MaterialCard: Aparatos eléctricos/electrónicos

[ BaselineInput ]
  → Inputs opcionales: kg puesto en mercado por categoría/año
  → Guardado en localStorage
  → Nota: "Sin esta cifra, solo se muestra kg recuperado"
```

---

## Metas Legales Hardcodeadas

### DS 12/2021 — Envases y Embalajes (% recolección/valorización)

| Año  | Papel/Cartón | Plástico | Vidrio | Metales |
|------|-------------|----------|--------|---------|
| 2023 | 10%         | 5%       | 10%    | 10%     |
| 2024 | 18%         | 12%      | 15%    | 18%     |
| 2025 | 25%         | 20%      | 20%    | 25%     |
| 2030 | 60%         | 55%      | 50%    | 60%     |

### DS 8/2021 — Neumáticos (% recolección)

| Año  | Meta |
|------|------|
| 2022 | 5%   |
| 2023 | 15%  |
| 2024 | 25%  |
| 2025 | 35%  |
| 2030 | 75%  |

### DS 10/2021 — RAEE (% recolección)

| Año  | Meta |
|------|------|
| 2023 | 10%  |
| 2025 | 20%  |
| 2030 | 50%  |

**Años intermedios:** usar el valor del año declarado más cercano anterior.  
**Nota:** Verificar valores contra texto oficial SMA antes de implementar.

---

## Mapeo de Materiales CR → Categorías REP

| Material en CR (normalizado) | Categoría REP |
|------------------------------|---------------|
| Papel, Cartón, Papel y cartón | DS12 → Papel/Cartón |
| Plástico, PET, HDPE, PP, PS | DS12 → Plástico |
| Vidrio | DS12 → Vidrio |
| Metal, Aluminio, Acero, Chatarra, Cobre | DS12 → Metales |
| Neumático, Goma, Caucho | DS8 → Neumáticos |
| RAEE, Electrónico, Computador, Electrónica, Aparato | DS10 → RAEE |

El mapeo es case-insensitive y usa coincidencia parcial (includes).

---

## Lógica de Cálculo

```
kg_recuperado = suma de CRs verificados del año seleccionado, por material mapeado

Si baseline ingresado (kg_puesto_mercado > 0):
  porcentaje_cumplimiento = (kg_recuperado / kg_puesto_mercado) × 100
  
  estado:
    ≥ meta_legal           → "cumpliendo"   (verde)
    ≥ meta_legal × 0.8     → "en_riesgo"    (amarillo)
    < meta_legal × 0.8     → "incumpliendo" (rojo)

Si no hay baseline:
  Muestra kg_recuperado + meta_legal_%
  estado → "sin_datos" (gris)
  Mensaje: "Ingresa tu volumen puesto en mercado para calcular % de cumplimiento"
```

---

## Componentes

### Archivos nuevos
- `screens/LeyREP.tsx` — pantalla principal
- `utils/leyRepTargets.ts` — tablas de metas + función de interpolación por año
- `utils/materialMapping.ts` — mapeo materiales CR → categorías REP

### Archivos modificados
- `App.tsx` — agregar ruta `/ley-rep`
- `components/Navbar.tsx` — agregar ítem de navegación con ícono `policy`

### Componentes internos de LeyREP.tsx
| Componente | Responsabilidad |
|---|---|
| `LeyRepGate` | Verifica is_ley_rep, muestra banner si false |
| `ResumenCumplimiento` | Tarjeta general con badges por categoría |
| `SeccionDS` | Sección reutilizable por DS (título, año, tarjetas) |
| `MaterialCard` | Tarjeta individual: kg, meta %, barra de progreso, estado |
| `BaselineInput` | Inputs opcionales kg puesto en mercado (localStorage) |

---

## Persistencia

- **Supabase:** CRs verificados (lectura, tabla `documents`)
- **localStorage:** Baseline de kg puesto en mercado por categoría y año  
  Clave: `eco_ley_rep_baseline_${userId}_${year}`
- **profiles:** `is_ley_rep` (lectura, campo existente)

---

## UX / Diseño Visual

- Consistente con pantalla Impact (mismos patrones glassmorphism, blob animations)
- Íconos Material Symbols: `policy` para navbar, `check_circle` / `warning` / `cancel` para estados
- Colores de estado: verde (`text-green-600`), amarillo (`text-yellow-500`), rojo (`text-red-500`), gris (`text-gray-400`)
- Responsive: misma lógica `lg:ml-64` del resto de la app
- Dark mode: soporte completo con clases `dark:`

---

## Fuera de Alcance (esta versión)

- Conexión directa con plataforma SMA (futura integración)
- Pilas, baterías, aceites lubricantes (residuos peligrosos)
- Cálculo automático de baseline desde datos externos
- Exportación en formato SMA/RETC (mejora separada del roadmap)
