# Referencias Científicas y Metodología de Cálculo
## EcoNexo - Sistema de Gestión Ambiental

---

## 📋 Metodología Base

### ISO 14067:2018
**Gases de efecto invernadero — Huella de carbono de productos**
- Estándar internacional para la cuantificación y comunicación de la huella de carbono
- Proporciona requisitos y directrices para cuantificar las emisiones de GEI
- Seguimiento del ciclo de vida del producto (ACV)

### Fuentes Locales (Chile)

#### Kyklos - Organización de Reciclaje Chilena
**URL**: https://kyklos.cl/las-eco-equivalencias-una-herramienta-para-traducir-los-impactos-del-reciclaje/

**Eco-equivalencias documentadas:**
- **Botellas PET**: 0.18 kWh ahorrados por botella
- **Aluminio**: 600 litros de petróleo virgen ahorrados por tonelada
- Datos actualizados y validados para el contexto chileno

---

## 🧮 Factores de Conversión Actuales (Implementados)

### 1. Huella de Carbono (CO₂e)
```
Factor: 2.5 kg CO₂e por kg de residuo reciclado
Fórmula: CO₂ evitado = Total Kg × 2.5
```
**Fuente**: EPA/DEFRA - Promedio para residuos reciclables mixtos

### 2. Agua Ahorrada
```
Factor: 20 litros por kg de residuo
Fórmula: Agua ahorrada = Total Kg × 20
```
**Fuente**: Promedios industriales de consumo de agua

### 3. Energía Ahorrada
```
Factor: 4 kWh por kg de residuo
Fórmula: Energía ahorrada = Total Kg × 4
```
**Fuente**: EPA - Ahorro energético en reciclaje

### 4. Árboles Equivalentes
```
Factor: 1 árbol absorbe ~22 kg CO₂/año
Fórmula: Árboles = CO₂ evitado / 22
```
**Fuente**: EPA - Captura de carbono forestal

---

## 🔬 Factores Específicos por Material (Kyklos)

### Plásticos (PET)
- **Energía**: 0.18 kWh por botella (~30g)
- **Equivalente**: 6 kWh por kg de PET
- **CO₂**: ~2.0 kg CO₂e por kg PET reciclado

### Aluminio
- **Petróleo**: 600 L por tonelada
- **Energía**: ~14 kWh por kg
- **CO₂**: ~9 kg CO₂e por kg de aluminio reciclado

### Papel/Cartón
- **Agua**: 26 L por kg
- **Energía**: 2.5 kWh por kg
- **CO₂**: ~1.5 kg CO₂e por kg

### Vidrio
- **Energía**: 0.5 kWh por kg
- **CO₂**: ~0.3 kg CO₂e por kg

### Metales (general)
- **Energía**: 8-10 kWh por kg
- **CO₂**: ~4 kg CO₂e por kg

---

## 📊 Recomendaciones de Mejora

### Implementación Diferenciada por Material
Para mayor precisión, se recomienda calcular por tipo de residuo:

```javascript
const materialFactors = {
  'Plásticos': { co2: 2.0, energy: 6, water: 15 },
  'Aluminio': { co2: 9.0, energy: 14, water: 10 },
  'Papel/Cartón': { co2: 1.5, energy: 2.5, water: 26 },
  'Vidrio': { co2: 0.3, energy: 0.5, water: 5 },
  'Metales': { co2: 4.0, energy: 9, water: 12 }
};
```

### Certificación ISO 14067
Para obtener certificación oficial, se requiere:
1. Análisis de Ciclo de Vida (ACV) completo
2. Verificación por terceros
3. Documentación de metodología de cálculo
4. Auditoría de datos de actividad

---

## 🌍 Referencias Internacionales Adicionales

1. **EPA (USA)**
   - Greenhouse Gas Equivalencies Calculator
   - WARM Model (Waste Reduction Model)

2. **IPCC** (Panel Intergubernamental sobre Cambio Climático)
   - Directrices para Inventarios Nacionales de GEI

3. **Ministerio del Medio Ambiente (Chile)**
   - Programa HuellaChile
   - Sistema Nacional de Inventarios de GEI

4. **DEFRA (UK)**
   - Government GHG Conversion Factors for Company Reporting

---

## ⚠️ Nota Importante

Los factores actuales son **promedios generales** adecuados para estimaciones iniciales. Para certificación oficial o reportes corporativos bajo ISO 14067, se recomienda:

- Realizar ACV específico por tipo de material
- Usar factores de emisión locales (Chile)
- Considerar el transporte y logística específica
- Incluir el mix energético nacional (matriz energética chilena)
- Auditoría externa de los cálculos

---

**Última actualización**: Enero 2026
**Versión**: 1.0
**Responsable**: EcoNexo SpA
