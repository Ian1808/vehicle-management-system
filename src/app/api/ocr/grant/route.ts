import { NextRequest, NextResponse } from 'next/server'
import https from 'node:https'

// Server-side proxy to Google Cloud Vision (TEXT_DETECTION) for grant OCR.
// The API key stays in .env.local and never reaches the browser. The client
// sends the compressed photo as base64; we return the extracted text and the
// client reuses the same parseGrantText parser as the offline fallback.
//
// Each request opens a FRESH connection (Connection: close) with a hard
// timeout — reusing undici's keep-alive pool could hang on a stale socket, and
// an unbounded request would leave the scanner spinning forever.
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

    const payload = JSON.stringify({
        requests: [
            {
                image: { content: imageBase64 },
                features: [{ type: 'TEXT_DETECTION' }],
            },
        ],
    })

    let text = ''
    let apiError: string | null = null
    try {
        text = await new Promise<string>((resolve, reject) => {
            const url = new URL('https://vision.googleapis.com/v1/images:annotate')
            url.searchParams.set('key', key)
            const request = https.request(
                url,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload),
                        Connection: 'close',
                    },
                    timeout: 30000,
                },
                (res) => {
                    let data = ''
                    res.setEncoding('utf8')
                    res.on('data', (chunk) => {
                        data += chunk
                    })
                    res.on('end', () => {
                        if (res.statusCode !== 200) {
                            let message = `Google Vision HTTP ${res.statusCode}`
                            try {
                                message = JSON.parse(data)?.error?.message || message
                            } catch {
                                /* keep fallback message */
                            }
                            reject(Object.assign(new Error(message), { statusCode: res.statusCode }))
                            return
                        }
                        let annotation: { error?: { message?: string }; fullTextAnnotation?: { text?: string } } | null = null
                        try {
                            annotation = JSON.parse(data)?.responses?.[0] ?? null
                        } catch {
                            /* fall through to empty text */
                        }
                        if (annotation?.error?.message) {
                            reject(new Error(annotation.error.message))
                        } else {
                            resolve(annotation?.fullTextAnnotation?.text || '')
                        }
                    })
                }
            )
            request.on('timeout', () => {
                request.destroy(new Error('Google Vision request timed out'))
            })
            request.on('error', (err) => reject(err))
            request.write(payload)
            request.end()
        })
    } catch (err) {
        apiError = err instanceof Error ? err.message : 'Could not reach Google Vision API'
    }

    if (apiError) {
        return NextResponse.json({ error: 'vision_error', message: apiError }, { status: 502 })
    }

    if (!text.trim()) {
        return NextResponse.json({ error: 'no_text', message: 'No text detected in the image' }, { status: 422 })
    }

    return NextResponse.json({ text })
}
