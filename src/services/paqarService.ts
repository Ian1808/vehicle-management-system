// Paqar API Service (https://paqar.my/api-docs)

export async function fetchPaqarValuationByPlate(plateNumber: string) {
    try {
        const cleanedPlate = plateNumber.toUpperCase().trim().replace(/[^A-Z0-9]/g, '')
        const res = await fetch(`/api/paqar?plate=${encodeURIComponent(cleanedPlate)}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        })

        if (!res.ok) {
            if (res.status === 404) {
                return { error: 'Plate number not found on Paqar.my.' }
            }
            return { error: `Paqar API error (${res.status})` }
        }

        const data = await res.json()
        return data
    } catch (error) {
        console.error("Failed to fetch Paqar valuation via proxy:", error)
        return { error: 'Failed to connect to valuation service.' }
    }
}

export async function fetchPaqarVariants(make: string, model: string) {
    try {
        const res = await fetch(`https://paqar.my/api/v1/variants/${encodeURIComponent(make)}/${encodeURIComponent(model)}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
        })
        if (!res.ok) return null
        return await res.json()
    } catch (error) {
        console.error("Failed to fetch variant ladder:", error)
        return null
    }
}