import { NextRequest, NextResponse } from 'next/server'

// Server-side proxy to Google Cloud Vision (TEXT_DETECTION) for grant OCR.
// The API key stays in .env.local and never reaches the browser. The client
// sends the compressed photo as base64; we return the extracted text and the
// client reuses the same parseGrantText parser as the offline fallback.
export async function POST(req: NextRequest) {
    const key = process.env.GOOGLE_VISION_API_KEY?.trim()
    if (!key) {
        return NextResponse.json(
            { error: 'no_key', message: 'GOOGLE_VISION_API_KEY is not configured in .env.local' },
            { status: 503 }
        )
    }

    let imageBase64 = ''
    try {
        const body = await req.json()
        imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64 : ''
    } catch {
        return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body' }, { status: 400 })
    }
    if (!imageBase64) {
        return NextResponse.json({ error: 'bad_request', message: 'imageBase64 is required' }, { status: 400 })
    }

    let resp: Response
    try {
        resp = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requests: [
                    {
                        image: { content: imageBase64 },
                        features: [{ type: 'TEXT_DETECTION' }],
                    },
                ],
            }),
        })
    } catch {
        return NextResponse.json({ error: 'vision_unreachable', message: 'Could not reach Google Vision API' }, { status: 502 })
    }

    const data = await resp.json().catch(() => null)
    if (!resp.ok || !data) {
        const message = data?.error?.message || `Google Vision HTTP ${resp.status}`
        return NextResponse.json({ error: 'vision_error', message }, { status: 502 })
    }

    const annotation = data.responses?.[0]
    if (annotation?.error) {
        return NextResponse.json({ error: 'vision_error', message: annotation.error.message }, { status: 502 })
    }

    const text: string = annotation?.fullTextAnnotation?.text || ''
    if (!text.trim()) {
        return NextResponse.json({ error: 'no_text', message: 'No text detected in the image' }, { status: 422 })
    }

    return NextResponse.json({ text })
}
