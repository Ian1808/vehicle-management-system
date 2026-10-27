// Client-side service calling our Next.js API proxy to avoid browser CORS errors

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
            return { error: 'Plate number not found on Paqar.my.' }
        }

        const data = await res.json()
        return data
    } catch (error) {
        console.error("Failed to fetch via proxy:", error)
        return null
    }
}