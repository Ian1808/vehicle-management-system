// Paqar Public API Service (https://paqar.my/api-docs)

export async function fetchPaqarValuationByPlate(plateNumber: string) {
    try {
        const cleanedPlate = plateNumber.toUpperCase().trim().replace(/[^A-Z0-9]/g, '')
        const res = await fetch(`https://paqar.my/api/v1/valuation?plate=${encodeURIComponent(cleanedPlate)}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        })

        if (!res.ok) {
            if (res.status === 404) {
                return { error: 'Plate number not found on Paqar.my.' }
            }
            throw new Error(`Paqar API error: status ${res.status}`)
        }

        const data = await res.json()
        return data
    } catch (error) {
        console.error("Failed to fetch from Paqar API:", error)
        return null
    }
}