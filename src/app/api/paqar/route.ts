import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const plate = searchParams.get('plate')

    if (!plate) {
        return NextResponse.json({ error: 'Plate number is required' }, { status: 400 })
    }

    try {
        const cleanedPlate = plate.toUpperCase().trim().replace(/[^A-Z0-9]/g, '')
        const paqarRes = await fetch(`https://paqar.my/api/v1/valuation?plate=${encodeURIComponent(cleanedPlate)}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        })

        if (!paqarRes.ok) {
            return NextResponse.json({ error: 'Plate not found on Paqar.my' }, { status: paqarRes.status })
        }

        const data = await paqarRes.json()
        return NextResponse.json(data)
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Failed to reach Paqar API' }, { status: 500 })
    }
}