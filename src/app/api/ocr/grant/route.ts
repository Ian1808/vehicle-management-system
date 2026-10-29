import { NextRequest, NextResponse } from 'next/server'
import https from 'node:https'

// Server-side proxy to Google Gemini (gemini-3.8-flash, low thinking) for
// grant OCR. The API key stays in .env.local and never reaches the browser.
// The client sends the compressed photo as base64; Gemini returns structured
// JSON fields + a per-field confidence score + a plain transcription.
//
// Each request opens a FRESH connection (Connection: close) with a hard
// timeout — reusing undici's keep-alive pool could hang on a stale socket, and
// an unbounded request would leave the scanner spinning forever.
const MODEL = 'gemini-3.8-flash'

// Vercel: scans take ~6-9s against Gemini, so raise the function timeout above
// the 10s default (Hobby allows up to 60s).
export const maxDuration = 60

const PROMPT = `You are reading a Malaysian JPJ vehicle ownership certificate (SIJIL PEMILIKAN KENDERAAN / vehicle grant) from a photo. The photo may be rotated in any orientation — orient it yourself.

Extract these fields and return STRICT JSON only (no markdown, no commentary):
- plate: registration plate number (No. Pendaftaran), e.g. "PNP176". Empty string if not readable.
- chassis: chassis / VIN number (No. Chasis), typically 17 characters. Empty if unreadable.
- make: car make (Buatan), e.g. "HONDA". Empty if unreadable.
- model: model name (Nama Model), e.g. "CIVIC 1.8L I-VTEC (A)". Empty if unreadable.
- variant: the variant/spec portion that follows the base model name, e.g. "1.8L I-VTEC (A)". Empty if none exists.
- spec: engine capacity in cc (Keupayaan Enjin), digits only, e.g. "1799". Empty if unreadable.
- year: manufacturing year (Tahun Dibuat), 4 digits, e.g. "2018". Empty if unreadable.
- confidence: an object with the SAME 7 keys, each an integer 0-100 rating how certain you are that the value is correct (0 = not readable at all, 100 = fully clear).
- text: a plain transcription of ALL text visible on the certificate, one line per line (labels and values).

Rules:
- Never invent values. If a field is not readable, use an empty string and confidence 0.
- Digits matter: 0/O, 1/I, 8/B, 5/S are easily confused — transcribe exactly what you see.
- The chassis/VIN and engine number often share a line separated by "/" — the chassis is the part before the slash.
- The "Tahun Dibuat" (year made) row is separate from "Tarikh Pendaftaran" (registration date) — never use the date as the year.`

async function callGemini(key: string, imageBase64: string, mimeType: string) {
    const payload = JSON.stringify({
        contents: [
            {
                role: 'user',
                parts: [
                    { text: PROMPT },
                    { inline_data: { mime_type: mimeType, data: imageBase64 } },
                ],
            },
        ],
        generationConfig: {
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingLevel: 'low' },
        },
    })

    return new Promise<{ text: string; model: string }>((resolve, reject) => {
        const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`)
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
                        let message = `Gemini HTTP ${res.statusCode}`
                        try {
                            message = JSON.parse(data)?.error?.message || message
                        } catch {
                            /* keep fallback message */
                        }
                        reject(Object.assign(new Error(message), { statusCode: res.statusCode }))
                        return
                    }
                    let response: {
                        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
                        error?: { message?: string }
                    } | null = null
                    try {
                        response = JSON.parse(data)
                    } catch {
                        reject(new Error('Gemini returned invalid JSON'))
                        return
                    }
                    if (response?.error?.message) {
                        reject(new Error(response.error.message))
                        return
                    }
                    const parts = response?.candidates?.[0]?.content?.parts || []
                    const text = parts.map(p => p.text || '').join('')
                    if (!text.trim()) {
                        reject(new Error('Gemini returned an empty response'))
                        return
                    }
                    resolve({ text, model: MODEL })
                })
            }
        )
        request.on('timeout', () => {
            request.destroy(new Error('Gemini request timed out'))
        })
        request.on('error', (err) => reject(err))
        request.write(payload)
        request.end()
    })
}

export async function POST(req: NextRequest) {
    const key = process.env.GEMINI_API_KEY?.trim()
    if (!key) {
        return NextResponse.json(
            { error: 'no_key', message: 'GEMINI_API_KEY is not configured in .env.local' },
            { status: 503 }
        )
    }

    let imageBase64 = ''
    let mimeType = 'image/jpeg'
    try {
        const body = await req.json()
        imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64 : ''
        mimeType = typeof body?.mimeType === 'string' && body.mimeType ? body.mimeType : 'image/jpeg'
    } catch {
        return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body' }, { status: 400 })
    }
    if (!imageBase64) {
        return NextResponse.json({ error: 'bad_request', message: 'imageBase64 is required' }, { status: 400 })
    }

    let geminiText = ''
    let apiError: Error & { statusCode?: number } | null = null
    try {
        const res = await callGemini(key, imageBase64, mimeType)
        geminiText = res.text
    } catch (err) {
        apiError = err instanceof Error ? err : new Error('Could not reach Gemini API')
    }

    if (apiError) {
        const status = apiError.statusCode === 401 || apiError.statusCode === 403 ? 503 : 502
        return NextResponse.json(
            { error: 'gemini_error', message: apiError.message },
            { status }
        )
    }

    // Gemini is asked for strict JSON; guard against stray markdown fences.
    const cleaned = geminiText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    let fields: {
        plate?: unknown
        chassis?: unknown
        make?: unknown
        model?: unknown
        variant?: unknown
        spec?: unknown
        year?: unknown
        confidence?: unknown
        text?: unknown
    } | null = null
    try {
        fields = JSON.parse(cleaned)
    } catch {
        return NextResponse.json({ error: 'parse_failed', message: 'Gemini output was not valid JSON' }, { status: 422 })
    }
    if (!fields || typeof fields !== 'object') {
        return NextResponse.json({ error: 'parse_failed', message: 'Gemini output was not an object' }, { status: 422 })
    }

    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const confidence: Record<string, number> = {}
    if (fields.confidence && typeof fields.confidence === 'object') {
        for (const k of ['plate', 'chassis', 'make', 'model', 'variant', 'spec', 'year']) {
            const v = (fields.confidence as Record<string, unknown>)[k]
            confidence[k] = typeof v === 'number' && v >= 0 ? Math.min(100, Math.round(v)) : 0
        }
    }

    return NextResponse.json({
        fields: {
            plate: str(fields.plate),
            chassis: str(fields.chassis),
            make: str(fields.make),
            model: str(fields.model),
            variant: str(fields.variant),
            spec: str(fields.spec),
            year: str(fields.year),
        },
        confidence,
        text: str(fields.text),
        model: MODEL,
    })
}
