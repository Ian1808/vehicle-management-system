import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    try {
        const url = new URL(request.url)
        const plate = url.searchParams.get('plate')
        const nvic = url.searchParams.get('nvic')
        const make = url.searchParams.get('make')
        const year = url.searchParams.get('year')
        const model = url.searchParams.get('model')

        let paqarUrl = 'https://paqar.my/api/v1/valuation?'
        if (plate) {
            paqarUrl += `plate=${encodeURIComponent(plate.toUpperCase().trim())}`
        } else if (nvic && make && year && model) {
            paqarUrl += `nvic=${encodeURIComponent(nvic)}&make=${encodeURIComponent(make)}&year=${year}&model=${encodeURIComponent(model)}`
        } else {
            return NextResponse.json({ error: 'Missing required parameters (plate or nvic+make+year+model)' }, { status: 400 })
        }

        const paqarRes = await fetch(paqarUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'VehicleManagementSystem/1.0',
            },
        })

        const citationHeader = paqarRes.headers.get('X-Citation') || 'Paqar.my'

        if (!paqarRes.ok) {
            const errorText = await paqarRes.text()
            return NextResponse.json(
                { error: `Paqar API returned status ${paqarRes.status}`, details: errorText },
                { status: paqarRes.status }
            )
        }

        const data = await paqarRes.json()

        const response = NextResponse.json(data)
        response.headers.set('X-Citation', citationHeader)
        return response
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
    }
}