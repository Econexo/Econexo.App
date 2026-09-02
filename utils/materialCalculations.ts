// Función compartida para normalizar tipos de materiales
// Usada tanto en Dashboard como en Impact para garantizar consistencia

/**
 * Coincidencia por palabra completa. Hace falta para las siglas cortas: con
 * `includes('pet')` una "carpeta de cartón" se clasificaba como plástico.
 */
const hasWord = (text: string, word: string): boolean =>
    new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`).test(text);

export const normalizeMaterialType = (item: any): string => {
    // Obtener todos los campos relevantes
    const typeStr = item.waste_type || item.type || '';
    const descStr = item.description || '';

    // Normalizar: lowercase y quitar acentos
    const normalize = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const combined = normalize(`${typeStr} ${descStr}`);

    // ── Destino final ───────────────────────────────────────────────────────
    // Van antes que todo a propósito: si el operario eligió esa categoría manda
    // ella, aunque la descripción mencione plásticos o metales ("residuos
    // domiciliarios con envases", "escombros con fierro"). Lo que importa ahí es
    // a dónde va el residuo, no de qué está hecho.
    if (combined.includes('domicil') || combined.includes('asimilable') || hasWord(combined, 'rsd')) return 'Domiciliarios';
    if (combined.includes('rescon') || combined.includes('escombro') || combined.includes('demolici') || combined.includes('construcci')) return 'RESCON';

    // ── Papel y cartón ──────────────────────────────────────────────────────
    // Se separan porque tienen precio y destino distintos, y el cliente necesita
    // verlos aparte. La categoría mixta se conserva solo para lo que de verdad
    // viene junto o para los certificados antiguos que se emitieron así.
    const tienePapel = combined.includes('papel') || combined.includes('diario') || combined.includes('revista');
    const tieneCarton = combined.includes('carton') || combined.includes('corrugado');
    if (tienePapel && tieneCarton) return 'Papel/Cartón';
    if (tieneCarton) return 'Cartón';
    if (tienePapel) return 'Papel';

    // ── Plásticos por resina ────────────────────────────────────────────────
    // Mismo criterio que con el aluminio frente a la chatarra: si el operario
    // precisa la resina, se contabiliza aparte.
    if (hasWord(combined, 'pet') || combined.includes('politereftalato')) return 'PET';
    if (hasWord(combined, 'hdpe') || hasWord(combined, 'pead') || combined.includes('polietileno de alta')) return 'Plástico HDPE';
    if (hasWord(combined, 'ldpe') || hasWord(combined, 'pebd') || combined.includes('polietileno de baja')
        || combined.includes('film') || combined.includes('strech') || combined.includes('stretch')) return 'Plástico Film';
    if (combined.includes('poliprop') || hasWord(combined, 'pp')) return 'Plástico PP';
    if (combined.includes('plast') || combined.includes('poliet')) return 'Plásticos';

    // ── Metales ─────────────────────────────────────────────────────────────
    if (combined.includes('aluminio')) return 'Aluminio';
    if (combined.includes('metal') || combined.includes('lata') || combined.includes('acer') || combined.includes('cobr') || combined.includes('chatarra') || combined.includes('fierro')) return 'Metales';

    // ── Resto ───────────────────────────────────────────────────────────────
    if (combined.includes('vidr') || combined.includes('cristal')) return 'Vidrio';
    if (combined.includes('electr') || combined.includes('raee') || combined.includes('comput') || combined.includes('bateria') || combined.includes('pila')) return 'Electrónicos';
    if (combined.includes('peligros') && !combined.includes('no peligros')) return 'Peligrosos';
    if (combined.includes('organ') || combined.includes('compost') || combined.includes('vegetal')) return 'Orgánicos';
    if (combined.includes('aceit') || combined.includes('lubric')) return 'Aceites';
    if (combined.includes('mader') || combined.includes('palet')) return 'Madera';
    if (combined.includes('textil') || combined.includes('ropa') || combined.includes('tela')) return 'Textiles';
    if (combined.includes('neumat') || combined.includes('cauch') || combined.includes('goma')) return 'Neumáticos';

    return 'Otros';
};

/** Materiales que son una subdivisión de otro, para agrupar cuando haga falta. */
export const MATERIAL_FAMILY: Record<string, string> = {
    'Papel': 'Papel y Cartón',
    'Cartón': 'Papel y Cartón',
    'Papel/Cartón': 'Papel y Cartón',
    'PET': 'Plásticos',
    'Plástico HDPE': 'Plásticos',
    'Plástico Film': 'Plásticos',
    'Plástico PP': 'Plásticos',
    'Plásticos': 'Plásticos',
    'Aluminio': 'Metales',
    'Metales': 'Metales',
};

/** Familia a la que pertenece un material, o el propio material si no tiene. */
export const familyOf = (material: string): string => MATERIAL_FAMILY[material] ?? material;

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
    // Por resina. PET es el de mejor recuperación; el film, el más bajo.
    'PET':            { co2: 1.85, water: 17.0, energy: 5.8 },
    'Plástico HDPE':  { co2: 1.60, water: 15.0, energy: 5.2 },
    'Plástico Film':  { co2: 1.20, water: 12.0, energy: 4.2 },
    'Plástico PP':    { co2: 1.45, water: 14.0, energy: 4.8 },

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
    // Cartón corrugado es el valor de referencia de WARM; el papel de oficina
    // ahorra algo menos de agua porque su pulpa ya viene blanqueada.
    'Cartón': { co2: 3.10, water: 26.0, energy: 4.0 },
    'Papel':  { co2: 2.90, water: 22.0, energy: 3.6 },

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

    // Destino final: no hay impacto evitado. Un residuo enterrado no ahorra
    // nada, así que aunque alguien los sume por error aportan cero.
    'Domiciliarios': { co2: 0, water: 0, energy: 0 },
    'RESCON':        { co2: 0, water: 0, energy: 0 },

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

// Paleta compartida por el donut de Impacto y el Panel Mensual: un mismo
// material debe tener siempre el mismo color en toda la app.
export const MATERIAL_COLORS: Record<string, string> = {
    'Plásticos':    '#eab308', // amarillo
    'Papel/Cartón': '#3b82f6', // azul
    'Cartón':       '#2563eb', // azul intenso
    'Papel':        '#93c5fd', // azul claro
    'PET':          '#f59e0b', // ámbar
    'Plástico HDPE':'#fbbf24', // ámbar claro
    'Plástico Film':'#fde68a', // ámbar pálido
    'Plástico PP':  '#d97706', // ámbar oscuro
    'Aluminio':     '#9ca3af', // gris claro
    'Vidrio':       '#22c55e', // verde
    'Metales':      '#6b7280', // gris
    'Electrónicos': '#ec4899', // rosa
    'Orgánicos':    '#84cc16', // verde lima
    'Peligrosos':   '#ef4444', // rojo
    'Aceites':      '#f97316', // naranja
    'Madera':       '#a16207', // café
    'Textiles':     '#14b8a6', // teal
    'Neumáticos':   '#374151', // gris oscuro
    'Domiciliarios': '#78716c', // piedra — va a relleno
    'RESCON':        '#a16207', // tierra — escombros
    'Otros':        '#94a3b8', // gris suave
};

export const materialColor = (name: string): string => MATERIAL_COLORS[name] ?? '#94a3b8';
