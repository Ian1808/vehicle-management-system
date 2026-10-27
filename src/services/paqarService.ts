// Paqar API Integration Service (https://paqar.my/api-docs)

export async function fetchPaqarVehicleByPlate(plateNumber: string) {
    try {
        const cleanedPlate = plateNumber.toUpperCase().trim().replace(/[^A-Z0-9]/g, '')
        const res = await fetch(`https://paqar.my/api/v1/vehicle?plate=${encodeURIComponent(cleanedPlate)}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        })

        if (!res.ok) {
            throw new Error(`Paqar API responded with status ${res.status}`)
        }

        const data = await res.json()
        return data
    } catch (error) {
        console.error("Failed to fetch vehicle from Paqar API:", error)
        return null
    }
}

export async function fetchPaqarValuation(make: string, model: string, year: number, variant?: string) {
    try {
        let url = `https://paqar.my/api/v1/valuation?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${year}`
        if (variant) {
            url += `&variant=${encodeURIComponent(variant)}`
        }

        const res = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
        })

        if (!res.ok) return null
        const data = await res.json()
        return data
    } catch (error) {
        console.error("Failed to fetch Paqar valuation:", error)
        return null
    }
}