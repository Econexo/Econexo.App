// Función compartida para normalizar tipos de materiales
// Usada tanto en Dashboard como en Impact para garantizar consistencia

export const normalizeMaterialType = (item: any): string => {
    // Obtener todos los campos relevantes
    const typeStr = item.waste_type || item.type || '';
    const descStr = item.description || '';

    // Normalizar: lowercase y quitar acentos
    const normalize = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const combined = normalize(`${typeStr} ${descStr}`);

    // Clasificación por orden de prioridad (más específico primero)
    if (combined.includes('aluminio')) return 'Aluminio';
    if (combined.includes('plast') || combined.includes('pet') || combined.includes('poliet') || combined.includes('poliprop')) return 'Plásticos';
    if (combined.includes('papel') || combined.includes('cart')) return 'Papel/Cartón';
    if (combined.includes('vidr') || combined.includes('cristal')) return 'Vidrio';
    if (combined.includes('metal') || combined.includes('lata') || combined.includes('acer') || combined.includes('cobr') || combined.includes('chatarra')) return 'Metales';
    if (combined.includes('electr') || combined.includes('raee') || combined.includes('comput') || combined.includes('bateria') || combined.includes('pila')) return 'Electrónicos';
    if (combined.includes('peligros') && !combined.includes('no peligros')) return 'Peligrosos';
    if (combined.includes('organ') || combined.includes('compost') || combined.includes('vegetal')) return 'Orgánicos';
    if (combined.includes('aceit') || combined.includes('lubric')) return 'Aceites';
    if (combined.includes('mader') || combined.includes('palet')) return 'Madera';
    if (combined.includes('textil') || combined.includes('ropa') || combined.includes('tela')) return 'Textiles';
    if (combined.includes('neumat') || combined.includes('cauch') || combined.includes('goma')) return 'Neumáticos';

    return 'Otros';
};

// Factores de conversión por material
// Fuente: EPA WARM v16 (2024) - "Avoided Emissions from Recycling vs Landfilling"
// Water Footprint Network (Avg global blue water footprint for industrial production)
// Energy: EPA WARM / avg industry data
export const materialFactors: { [key: string]: { co2: number; water: number; energy: number } } = {
    // 1. Plásticos (Mixed Plastics / PET weighted avg)
    // EPA WARM v16: ~1.50 kg CO2e/kg (Recycling avoids ~1.5kg compared to landfill)
    // Energy: ~5.0 kWh/kg saved
    // Water: ~15 L/kg
    'Plásticos': { co2: 1.50, water: 15.0, energy: 5.0 },

    // 2. Metales (Ferrous)
    // EPA WARM v16: ~1.80 kg CO2e/kg
    'Metales': { co2: 1.80, water: 12.0, energy: 2.0 },

    // 3. Aluminio (Aluminum Cans)
    // EPA WARM v16: ~9.13 kg CO2e/kg (Very high impact avoidance)
    // Energy: ~14.0 kWh/kg (approx 95% saving vs virgin)
    // Water: ~10.0 L/kg
    'Aluminio': { co2: 9.13, water: 10.0, energy: 14.0 },

    // 4. Papel y Cartón (Corrugated Containers)
    // EPA WARM v16: ~3.10 kg CO2e/kg (Includes carbon storage + avoided production)
    // Water: ~26 L/kg (Standard industry avg for recycled pulp vs virgin)
    'Papel/Cartón': { co2: 3.10, water: 26.0, energy: 4.0 },

    // 5. Vidrio
    // EPA WARM v16: ~0.28 kg CO2e/kg (Lower than popular belief, but accurate for certification)
    // Energy: ~0.5 kWh/kg
    // Water: ~5.0 L/kg
    'Vidrio': { co2: 0.28, water: 5.0, energy: 0.5 },

    // 6. Electrónicos (Mixed Electronics)
    // EPA WARM v16 (Personal Computers/Mixed): ~2-4 range. Using conserative avg.
    'Electrónicos': { co2: 3.5, water: 18.0, energy: 7.0 },

    // 7. Orgánicos (Composting)
    // EPA WARM v16: ~0.20 - 0.50 range depending on method.
    'Orgánicos': { co2: 0.5, water: 8.0, energy: 1.0 },

    // Others / Fallbacks
    'Peligrosos': { co2: 5.0, water: 20.0, energy: 10.0 }, // Estimate for handling avoidance
    'Aceites': { co2: 2.8, water: 10.0, energy: 8.0 },
    'Madera': { co2: 1.2, water: 15.0, energy: 2.0 },
    'Textiles': { co2: 1.8, water: 22.0, energy: 4.0 },
    'Neumáticos': { co2: 3.0, water: 12.0, energy: 6.0 },
    'Otros': { co2: 2.5, water: 20.0, energy: 4.0 }
};

// Factor de conversión para árboles
// Base: 1 árbol maduro absorbe aprox 22kg CO2/año
export const CO2_PER_TREE = 22;
