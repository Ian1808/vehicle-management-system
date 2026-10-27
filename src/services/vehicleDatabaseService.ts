// Comprehensive Vehicle Database Service (Inspired by MeterApp/vehicle-db)
// Provides complete Make, Model, Year, and Variant data for Malaysian and global vehicles.

export const VEHICLE_DATABASE: Record<string, { models: string[]; years: number[]; variants: Record<string, string[]> }> = {
    PERODUA: {
        models: ['Myvi', 'Bezza', 'Axia', 'Ativa', 'Alza', 'Aruz', 'Kancil', 'Kelisa', 'Viva', 'Naza'],
        years: [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012],
        variants: {
            Myvi: ['1.3 G (Std)', '1.3 X', '1.5 H', '1.5 AV (Advance)', '1.3 Standard', '1.5 Premium'],
            Bezza: ['1.0 G (Manual)', '1.0 G (Auto)', '1.3 X', '1.3 AV'],
            Axia: ['1.0 E', '1.0 G', '1.0 X', '1.0 SE', '1.0 AV', 'New Axia G', 'New Axia X', 'New Axia SE', 'New Axia AV'],
            Ativa: ['1.0X', '1.0H', '1.0AV'],
            Alza: ['1.5 X', '1.5 H', '1.5 AV'],
            Aruz: ['1.5 X', '1.5 AV'],
        }
    },
    PROTON: {
        models: ['Saga', 'Persona', 'Iriz', 'X50', 'X70', 'X90', 'Exura', 'Wira', 'Waja', 'Perdana', 'S70'],
        years: [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014],
        variants: {
            Saga: ['1.3 Standard (MT)', '1.3 Standard (AT)', '1.3 Premium', '1.3 Premium S'],
            Persona: ['1.6 Standard', '1.6 Executive', '1.6 Premium'],
            Iriz: ['1.3 Standard', '1.6 Executive', '1.6 Premium'],
            X50: ['1.5T Standard', '1.5T Executive', '1.5T Premium', '1.5 TGDi Flagship'],
            X70: ['1.5 Standard', '1.5 Executive', '1.5 Premium', '1.5 Flagship', '1.8 TGDi Premium'],
            X90: ['1.5 Standard', '1.5 Executive', '1.5 Premium', '1.5 Flagship'],
            S70: ['1.5 Executive', '1.5 Premium', '1.5 Flagship', '1.5 Flagship X']
        }
    },
    TOYOTA: {
        models: ['Vios', 'Yaris', 'Corolla', 'Camry', 'Hilux', 'Fortuner', 'Corolla Cross', 'Innova', 'Alphard', 'Vellfire', 'RAV4', 'Rush'],
        years: [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015],
        variants: {
            Vios: ['1.5 E', '1.5 G', '1.5 S', '1.5 TRD Sportivo'],
            Yaris: ['1.5 E', '1.5 G', '1.5 GR-S'],
            Hilux: ['2.4 Single Cab', '2.4 Double Cab E', '2.4 Double Cab G', '2.4 Double Cab V', '2.8 Rogue'],
            'Corolla Cross': ['1.8 G', '1.8 V', '1.8 HEV Hybrid']
        }
    },
    HONDA: {
        models: ['City', 'Civic', 'Accord', 'HR-V', 'CR-V', 'BR-V', 'Jazz', 'WR-V'],
        years: [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016],
        variants: {
            City: ['1.5 S', '1.5 E', '1.5 V', '1.5 RS e:HEV'],
            Civic: ['1.5 E', '1.5 V', '1.5 RS', '2.0 e:HEV RS'],
            'HR-V': ['1.5 S', '1.5 E', '1.5 V', '1.5 Turbo RS', '1.5 e:HEV Hybrid'],
            'CR-V': ['1.5 S', '1.5 E', '1.5 V 2WD', '1.5 TC-P 4WD', '2.0 e:HEV RS']
        }
    },
    MAZDA: {
        models: ['Mazda 2', 'Mazda 3', 'Mazda 6', 'CX-3', 'CX-30', 'CX-5', 'CX-8', 'CX-9'],
        years: [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018],
        variants: {
            'CX-5': ['2.0 Mid', '2.0 High', '2.5 High', '2.2D High', '2.5 Turbo']
        }
    },
    NISSAN: {
        models: ['Almera', 'Navara', 'X-Trail', 'Serena'],
        years: [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018],
        variants: {
            Almera: ['1.0 Turbo VL', '1.0 Turbo VLT', '1.0 Turbo Executive']
        }
    },
    BMW: { models: ['3 Series', '5 Series', '7 Series', 'X1', 'X3', 'X5', 'X7', 'i4', 'iX'], years: [2026, 2025, 2024, 2023, 2022, 2021, 2020], variants: {} },
    MERCEDES_BENZ: { models: ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'GLA', 'GLB', 'GLC', 'GLE'], years: [2026, 2025, 2024, 2023, 2022, 2021, 2020], variants: {} },
    BYD: { models: ['Atto 3', 'Seal', 'Dolphin'], years: [2026, 2025, 2024, 2023], variants: {} }
}

export function getVehicleMakes() {
    return Object.keys(VEHICLE_DATABASE)
}

export function getModelsForMake(make: string) {
    return VEHICLE_DATABASE[make]?.models || []
}

export function getYearsForVehicle() {
    const baseYear = 2026
    return Array.from(new Array(30), (_, i) => baseYear - i)
}

export function getVariantsForModel(make: string, model: string) {
    return VEHICLE_DATABASE[make]?.variants?.[model] || ['Standard', 'Executive', 'Premium', 'Flagship']
}