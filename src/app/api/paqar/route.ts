import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    try {
        const url = new URL(request.url)
        const plate = url.searchParams.get('plate')

        if (!plate) {
            return NextResponse.json({ error: 'Plate number is required' }, { status: 400 })
        }

        const cleanedPlate = plate.toUpperCase().trim().replace(/[^A-Z0-9]/g, '')
        const paqarUrl = `https://paqar.my/api/v1/valuation?plate=${encodeURIComponent(cleanedPlate)}`

        const paqarRes = await fetch(paqarUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'VehicleManagementSystem/1.0',
            },
        })

        if (!paqarRes.ok) {
            const errorText = await paqarRes.text()
            return NextResponse.json(
                { error: `Paqar API returned status ${paqarRes.status}`, details: errorText },
                { status: paqarRes.status }
            )
        }

        const data = await paqarRes.json()
        return NextResponse.json(data)
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
    }
}