import { useState, useEffect } from 'react'

export function useVehicleCatalog() {
    const [makes, setMakes] = useState<string[]>([])
    const [models, setModels] = useState<string[]>([])
    const [allVehicles, setAllVehicles] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchJpjData() {
            try {
                const res = await fetch('https://api.data.gov.my/data-catalogue?id=registration_transactions_car&limit=10000')
                const data = await res.json()

                if (data && data.length > 0) {
                    setAllVehicles(data)
                    const uniqueMakes = Array.from(new Set(data.map((v: any) => v.maker)))
                        .filter(Boolean)
                        .sort() as string[]
                    setMakes(uniqueMakes)
                }
            } catch (error) {
                console.error("Failed to fetch JPJ data from data.gov.my", error)
            } finally {
                setLoading(false)
            }
        }
        fetchJpjData()
    }, [])

    const getModelsForMake = (selectedMake: string) => {
        const filtered = allVehicles.filter(v => v.maker === selectedMake)
        const uniqueModels = Array.from(new Set(filtered.map(v => v.model)))
            .filter(Boolean)
            .sort() as string[]
        setModels(uniqueModels)
    }

    return { makes, models, loading, getModelsForMake }
}
