import { useState, useEffect } from 'react'

const FALLBACK_CATALOG: Record<string, string[]> = {
    PERODUA: ['Myvi', 'Bezza', 'Axia', 'Ativa', 'Alza', 'Aruz', 'Kancil', 'Kelisa', 'Viva'],
    PROTON: ['Saga', 'Persona', 'Iriz', 'X50', 'X70', 'X90', 'Exura', 'Wira', 'Waja', 'Perdana'],
    TOYOTA: ['Vios', 'Yaris', 'Corolla', 'Camry', 'Hilux', 'Fortuner', 'Corolla Cross', 'Innova', 'Alphard', 'Vellfire'],
    HONDA: ['City', 'Civic', 'Accord', 'HR-V', 'CR-V', 'BR-V', 'Jazz'],
    MAZDA: ['Mazda 2', 'Mazda 3', 'Mazda 6', 'CX-3', 'CX-30', 'CX-5', 'CX-8', 'CX-9'],
    NISSAN: ['Almera', 'Navara', 'X-Trail', 'Serena'],
    MITSUBISHI: ['Triton', 'Xpander', 'Outlander'],
    BMW: ['3 Series', '5 Series', '7 Series', 'X1', 'X3', 'X5', 'X7', 'i4', 'iX'],
    MERCEDES_BENZ: ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'GLA', 'GLB', 'GLC', 'GLE'],
    FORD: ['Ranger', 'Everest'],
    HYUNDAI: ['Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'Staria'],
    KIA: ['Cerato', 'Seltos', 'Sportage', 'Carnival', 'EV6'],
    BYD: ['Atto 3', 'Seal', 'Dolphin']
}

export function useVehicleCatalog() {
    const [makes, setMakes] = useState<string[]>(Object.keys(FALLBACK_CATALOG))
    const [models, setModels] = useState<string[]>([])
    const [loading, setLoading] = useState(false)

    const getModelsForMake = (selectedMake: string) => {
        const list = FALLBACK_CATALOG[selectedMake] || []
        setModels(list)
    }

    return { makes, models, loading, getModelsForMake }
}