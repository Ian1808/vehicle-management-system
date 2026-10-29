import { getVehicleMakes } from '../services/vehicleDatabaseService'

export type ParsedGrant = {
    plate: string
    chassis: string
    make: string
    model: string
    variant: string
    spec: string
    year: string
}

export type BBox = { x0: number; y0: number; x1: number; y1: number }

export type OcrLine = { text: string; bbox?: BBox }

export type ClassifiedLine = {
    text: string // normalized line text as OCR saw it
    valueText?: string // for value lines: the exact text stored in the values list
    kind: 'label' | 'value'
    labelType?: string
    bbox?: BBox
    field?: string // which parsed field consumed this line (set during extraction)
}

export type GrantClassification = {
    parsed: ParsedGrant
    lineRecords: ClassifiedLine[]
    sources: Record<string, string> // field key → source value text ('' if none)
}

export type RegionBand = { field: 'plate' | 'chassis' | 'makeModel' | 'spec' | 'year'; bbox?: BBox }

export type GrantInspect = {
    engine: 'cloud' | 'offline'
    model?: string
    score?: number // 0-100 overall confidence from the cloud model
    confidence?: Record<string, number> // per-field 0-100
    rotation: number
    refined: string[]
    fields: Array<{ key: string; label: string; value: string; source: string; refined: boolean; confidence?: number }>
    lines: Array<{ text: string; kind: 'label' | 'value'; labelType?: string; field?: string }>
}

export const FIELD_LABELS: Record<string, string> = {
    plate: 'Plate',
    chassis: 'Chassis (VIN)',
    make: 'Make',
    model: 'Model',
    variant: 'Variant',
    spec: 'Spec (cc)',
    year: 'Year',
}

export function normalizeKey(s: string) {
    return s.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Parses OCR lines from a Malaysian vehicle grant (SIJIL PEMILIKAN KENDERAAN).
// Both OCR engines (Gemini, Tesseract) mangle the Malay labels and can
// return the label column and value column as separate blocks, as interleaved
// rows, or as mangled single lines. Strategy: classify every line as a known
// label or a value, then find each field's value NEAR its label's position,
// verifying it by the value's distinctive SHAPE (plate / VIN / digits / year).
// `lines` may carry per-line bounding boxes (from Tesseract) so the caller can
// later re-scan the exact row region of each field.
export function classifyGrantLines(lines: OcrLine[]): GrantClassification {
    const rawLines = lines
        .map(l => ({ ...l, text: l.text.toUpperCase().replace(/\r/g, '').replace(/\s+/g, ' ').trim() }))
        .filter(l => l.text.length > 0)
    const result: ParsedGrant = { plate: '', chassis: '', make: '', model: '', variant: '', spec: '', year: '' }

    // Known grant labels, in priority order (a line can match several — e.g.
    // "Tarikh Pendaftaran" is a date label, not the plate label). All regexes
    // MUST be global ("g") — the classification loop relies on exec() advancing
    // lastIndex; a non-global exec returns the same first match forever.
    const LABELS: Array<{ type: string; re: RegExp }> = [
        { type: 'TAHUN', re: /(?:TAHUN|DIBUAT)/g },
        { type: 'TARIKH', re: /TARIKH/g },
        { type: 'KEUPAYAAN', re: /(?:KUUP|KUASA|KEUPAY)\w*\s*(?:ENJIN)?/g },
        { type: 'CHASIS', re: /CHASS?IS|CHESIS|ENJIN/g },
        { type: 'SYARAT', re: /SYARAT/g },
        { type: 'PENDAFTARAN', re: /PENDAFTARAN/g },
        { type: 'MODEL', re: /(?:BUATAN|BUSTAN|NAMA|NEMA)\s*MODE[!LI1]*|BUATAN|BUSTAN|MODEL|MODE[!LI1]*/g },
        { type: 'BAHAN', re: /BAHAN/g },
        { type: 'STATUS', re: /STATUS/g },
        { type: 'KELAS', re: /KELAS/g },
        { type: 'BDM', re: /B\.?\s*D\.?\s*M/g },
        { type: 'PEMUNYA', re: /PEMUNYA|PENUNYA/g },
        { type: 'ALAMAT', re: /ALAMAT/g },
        { type: 'ID', re: /(?:^|[^A-Z0-9])ID(?:$|[^A-Z0-9])/g },
    ]

    // Split every line into a label (if it contains a known field name) or a
    // value. Vision's text order varies per photo — labels may come first as a
    // block with all values after (with watermark noise lines before them), or
    // label/value pairs may be interleaved. So each field is extracted by
    // searching VALUES ordered by proximity to its label, verifying the value
    // by its SHAPE (plate / VIN / digits / year) rather than by fixed position.
    const labels: string[] = []
    const values: string[] = []
    const lineRecords: ClassifiedLine[] = []
    const cleanValue = (s: string) =>
        s.replace(/[^A-Z0-9 .()/-]/g, ' ').replace(/\s+/g, ' ').trim()
    for (const line of rawLines) {
        const entry = LABELS.find(l => {
            l.re.lastIndex = 0
            return l.re.test(line.text)
        })
        if (!entry) {
            const v = cleanValue(line.text.replace(/^\s*:\s*/, ''))
            // Keep the (possibly empty) entry in `values` — matches the original
            // parser's index positions, which proximity scoring relies on.
            values.push(v)
            if (v) lineRecords.push({ text: line.text, valueText: v, kind: 'value', bbox: line.bbox })
            continue
        }
        // Inline value ("LABEL : VALUE" or "LABEL VALUE") = text after the
        // LAST label keyword occurrence on the line.
        let lastEnd = -1
        entry.re.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = entry.re.exec(line.text)) !== null) {
            lastEnd = m.index + m[0].length
            if (entry.re.lastIndex === m.index) entry.re.lastIndex++
        }
        const rec: ClassifiedLine = { text: line.text, kind: 'label', labelType: entry.type, bbox: line.bbox }
        labels.push(entry.type)
        const tail = cleanValue(line.text.slice(lastEnd).replace(/^\s*:\s*/, ''))
        // Only keep the tail as a value when it looks like one: it must not
        // itself contain another label word ("Syarat Pendaftaran 1" → tail
        // "Pendaftaran 1" is a label fragment, not a value), and it needs a
        // digit, a "/" separator, or 2+ words ("Berdaftar"/"Bakar"/"Asal" are
        // label fragments too).
        if (tail) {
            const containsLabel = LABELS.some(l => {
                l.re.lastIndex = 0
                return l.re.test(tail)
            })
            if (!containsLabel && (/\d/.test(tail) || tail.includes('/') || tail.split(/\s+/).filter(Boolean).length >= 2)) {
                values.push(tail)
                // The line is still a LABEL (it names the field) but also
                // carries an inline value — keep both facts on the record.
                rec.valueText = tail
            }
        }
        lineRecords.push(rec)
    }

    const idxOf = (type: string) => labels.lastIndexOf(type)
    // Value indices ordered by distance from the label position (-1 = all).
    const near = (labelIdx: number): number[] => {
        const idx = Array.from({ length: values.length }, (_, i) => i)
        if (labelIdx === -1) return idx
        return idx.sort((a, b) => Math.abs(a - labelIdx) - Math.abs(b - labelIdx))
    }
    const isBodyTypeLine = (v: string) => v.includes('MOTOKAR') || v.includes('WINDOW')

    // --- plate: the first value containing a plate-shaped token
    let plateIdx = -1
    for (let i = 0; i < values.length && plateIdx === -1; i++) {
        for (const t of values[i].split(/[^A-Z0-9]+/).filter(Boolean)) {
            if (/^[A-Z]{1,3}\d{1,4}[A-Z]?$/.test(t)) {
                result.plate = t
                plateIdx = i
                break
            }
        }
    }

    // --- chassis: the VIN-shaped token nearest the chassis label (14+ alnum,
    // letters AND digits, found inside the line). Chassis+engine often merge
    // without a separator, so keep the first 17 chars (standard VIN length).
    const chassisLabelIdx = idxOf('CHASIS')
    let chassisIdx = -1
    for (const i of near(chassisLabelIdx)) {
        const v = values[i]
        // The part before a "/" separator is the chassis when engine number
        // shares the line; OCR junk may also prefix the VIN on the same line.
        const m = v.split('/')[0].match(/(?:^|[^A-Z0-9])([A-Z][A-Z0-9]{13,})(?:$|[^A-Z0-9])/)
        if (!m) continue
        const t = m[1]
        const c = t.length > 18 ? t.slice(0, 17) : t
        if (/[A-Z]/.test(c) && /\d/.test(c)) {
            result.chassis = c
            chassisIdx = i
            break
        }
    }

    // --- make/model: prefer the value nearest the MODEL label that starts
    // with a known make; only if none exists, fall back to a proximity score.
    const mmLabelIdx = idxOf('MODEL')
    let mmValIdx = -1
    const mmCandidates = near(mmLabelIdx)
        .map(i => ({ i, v: values[i] }))
        .filter(({ v }) => {
            const tokens = v.split(/\s+/).filter(Boolean)
            // 2+ words, and not an all-digits line (ID number / capacity).
            return tokens.length >= 2 && !/^[0-9\s]+$/.test(v)
        })
    const rankedMakes = [...getVehicleMakes()].sort((a, b) => normalizeKey(b).length - normalizeKey(a).length)
    let knownHit: { i: number; v: string } | null = null
    let knownDist = Infinity
    for (const c of mmCandidates) {
        const norm = normalizeKey(c.v)
        if (rankedMakes.some(mk => norm.startsWith(normalizeKey(mk)))) {
            const d = mmLabelIdx === -1 ? c.i : Math.abs(c.i - mmLabelIdx)
            if (d < knownDist) {
                knownDist = d
                knownHit = c
            }
        }
    }
    const mmHit = knownHit ?? mmCandidates.reduce<{ i: number; v: string; score: number } | null>(
        (best, c) => {
            const d = mmLabelIdx === -1 ? c.i : Math.abs(c.i - mmLabelIdx)
            let score = -d * 0.5
            if (c.v.includes('/')) score += 1.5
            if (c.v.split(/\s+/).length <= 5) score += 1
            return !best || score > best.score ? { ...c, score } : best
        },
        null
    )
    if (mmHit) {
        mmValIdx = mmHit.i
        const parts = mmHit.v.split('/').map(s => s.trim()).filter(Boolean)
        if (parts.length >= 2) {
            result.make = parts[0]
            result.model = parts.slice(1).join(' / ')
        } else {
            const tk = mmHit.v.split(/\s+/).filter(Boolean)
            result.make = tk[0]
            result.model = tk.slice(1).join(' ')
        }
    }

    // --- spec: engine capacity near the KEUPAYAAN label. Values already
    // claimed by plate/chassis/make-model and body-type lines are excluded.
    // Prefer a STANDALONE digit line ("3498") over digits embedded in an
    // address ("977 JALAN ... 6 ..."), and OCR sometimes prepends a junk
    // digit ("11799" for 1799) — then the last 4 digits of the label's own
    // line are used.
    const specLabelIdx = idxOf('KEUPAYAAN')
    const specSkip = (i: number) =>
        i === plateIdx || i === mmValIdx || i === chassisIdx || isBodyTypeLine(values[i])
    let specValIdx = -1
    const standaloneDigits = (v: string) => /^[0-9\s]+$/.test(v)
    for (const i of near(specLabelIdx)) {
        if (specSkip(i)) continue
        const v = values[i]
        const digits = v.replace(/[^0-9]/g, '')
        if ((digits.length === 3 || digits.length === 4) && standaloneDigits(v)) {
            result.spec = digits
            specValIdx = i
            break
        }
    }
    if (!result.spec) {
        for (const i of near(specLabelIdx)) {
            if (specSkip(i)) continue
            const digits = values[i].replace(/[^0-9]/g, '')
            if (digits.length === 3 || digits.length === 4) {
                result.spec = digits
                specValIdx = i
                break
            }
        }
    }
    if (!result.spec) {
        for (const i of near(specLabelIdx)) {
            if (specSkip(i)) continue
            const digits = values[i].replace(/[^0-9]/g, '')
            if (digits.length !== 5) continue
            const d = specLabelIdx === -1 ? i : Math.abs(i - specLabelIdx)
            if (d <= 1) {
                result.spec = digits.slice(-4)
                specValIdx = i
                break
            }
        }
    }

    // --- year: the standalone 19xx/20xx token nearest the TAHUN label (never
    // a date, never a value already claimed by another field).
    const yearLabelIdx = idxOf('TAHUN')
    let yearIdx = -1
    for (const i of near(yearLabelIdx)) {
        if (i === plateIdx || i === mmValIdx || i === chassisIdx || i === specValIdx) continue
        const v = values[i] || ''
        if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(v)) continue
        const m = v.match(/(?:^|[^0-9])((?:19|20)\d{2})(?:$|[^0-9])/)
        if (m) {
            result.year = m[1]
            yearIdx = i
            break
        }
    }

    // Variant = everything after the base model name, e.g. "CIVIC 1.8L I-VTEC (A)" → "1.8L I-VTEC (A)".
    const modelTokens = result.model.split(/\s+/).filter(Boolean)
    if (modelTokens.length >= 2) {
        result.variant = modelTokens.slice(1).join(' ')
    }

    // Attach each field to the line that produced it, and record source texts.
    const sources: Record<string, string> = {
        plate: values[plateIdx] || '',
        chassis: values[chassisIdx] || '',
        make: values[mmValIdx] || '',
        model: values[mmValIdx] || '',
        variant: values[mmValIdx] || '',
        spec: values[specValIdx] || '',
        year: values[yearIdx] || '',
    }
    const mark = (sourceText: string, field: string) => {
        if (!sourceText) return
        const rec = lineRecords.find(r => r.valueText === sourceText)
        if (rec && !rec.field) rec.field = field
    }
    mark(sources.plate, 'plate')
    mark(sources.chassis, 'chassis')
    mark(sources.make, 'make')
    mark(sources.spec, 'spec')
    mark(sources.year, 'year')

    return { parsed: result, lineRecords, sources }
}

// Wrapper for callers that only have the raw OCR text (no line geometry).
export function parseGrantText(raw: string): ParsedGrant {
    return classifyGrantLines(
        raw
            .replace(/\r/g, '')
            .split('\n')
            .map(l => ({ text: l }))
    ).parsed
}

// Higher = the OCR result looks more like a readable grant. Used to pick the
// best rotation and to stop early when the upright pass already parsed well.
export function scoreGrant(p: ParsedGrant): number {
    let s = 0
    if (p.plate) s += 2
    if (p.chassis) s += 2
    if (p.make) s += 1
    if (p.model) s += 1
    if (p.year) s += 1
    if (p.spec) s += 1
    return s
}

// Plans one crop region per field row, using the line bounding boxes that the
// winning orientation's OCR pass produced. Each band is later re-scanned at a
// higher zoom so only that row's text is read — faster and immune to
// cross-section mixups (e.g. an address's digits stealing the spec field).
export function planRegionBands(c: GrantClassification): RegionBand[] {
    const bandFor = (field: RegionBand['field'], sourceText: string): RegionBand => {
        const rec = sourceText ? c.lineRecords.find(r => r.valueText === sourceText) : undefined
        return { field, bbox: rec?.bbox }
    }
    return [
        bandFor('plate', c.sources.plate),
        bandFor('chassis', c.sources.chassis),
        bandFor('makeModel', c.sources.make || c.sources.model),
        bandFor('spec', c.sources.spec),
        bandFor('year', c.sources.year),
    ]
}

// Extracts ONE field from a row-crop's OCR text. Shape-verified like the main
// parser, but restricted to the given field so a neighboring row can never
// steal the value. Returns an empty partial when the crop is unusable.
export function extractBandFields(band: RegionBand['field'], rawText: string): Partial<ParsedGrant> {
    // A row crop reads either "LABEL : VALUE" or just "VALUE" — drop any label
    // prefix so value shapes are matched on the value text alone.
    const lines = rawText
        .toUpperCase()
        .replace(/\r/g, '')
        .split('\n')
        .map(l => l.replace(/\s+/g, ' ').trim())
        .map(l => (l.includes(':') ? l.slice(l.lastIndexOf(':') + 1).trim() : l))
        .filter(Boolean)
    if (band === 'plate') {
        for (const l of lines) {
            for (const t of l.split(/[^A-Z0-9]+/).filter(Boolean)) {
                if (/^[A-Z]{1,3}\d{1,4}[A-Z]?$/.test(t)) return { plate: t }
            }
        }
        return {}
    }
    if (band === 'chassis') {
        for (const l of lines) {
            const m = l.split('/')[0].match(/(?:^|[^A-Z0-9])([A-Z][A-Z0-9]{13,})(?:$|[^A-Z0-9])/)
            if (!m) continue
            const c = m[1].length > 18 ? m[1].slice(0, 17) : m[1]
            if (/[A-Z]/.test(c) && /\d/.test(c)) return { chassis: c }
        }
        return {}
    }
    if (band === 'makeModel') {
        const rankedMakes = [...getVehicleMakes()].sort((a, b) => normalizeKey(b).length - normalizeKey(a).length)
        let bestLine = lines[0] || ''
        for (const l of lines) {
            const norm = normalizeKey(l)
            if (rankedMakes.some(mk => norm.startsWith(normalizeKey(mk)))) {
                bestLine = l
                break
            }
        }
        const startsKnown = (s: string) =>
            rankedMakes.some(mk => normalizeKey(s).startsWith(normalizeKey(mk)))
        if (lines.length > 1 && !startsKnown(bestLine)) {
            bestLine = lines.reduce((a, b) => (b.length > a.length ? b : a))
        }
        if (!bestLine) return {}
        const parts = bestLine.split('/').map(s => s.trim()).filter(Boolean)
        if (parts.length >= 2) {
            const model = parts.slice(1).join(' / ')
            const modelTokens = model.split(/\s+/).filter(Boolean)
            return {
                make: parts[0],
                model,
                variant: modelTokens.length >= 2 ? modelTokens.slice(1).join(' ') : '',
            }
        }
        const tk = bestLine.split(/\s+/).filter(Boolean)
        if (tk.length < 2) return {}
        const model = tk.slice(1).join(' ')
        return { make: tk[0], model, variant: tk.slice(2).join(' ') }
    }
    if (band === 'spec') {
        for (const l of lines) {
            if (/^[0-9\s]+$/.test(l)) {
                const digits = l.replace(/[^0-9]/g, '')
                if (digits.length === 3 || digits.length === 4) return { spec: digits }
            }
        }
        return {}
    }
    // year — never a date, never from a line containing other digits (safe on a row crop)
    for (const l of lines) {
        if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(l)) continue
        const m = l.match(/(?:^|[^0-9])((?:19|20)\d{2})(?:$|[^0-9])/)
        if (m) return { year: m[1] }
    }
    return {}
}

// Builds the inspect snapshot shown in the intake modal: what each field was
// filled with, the line it came from, and every OCR line tagged as label/value.
// `extras` carries cloud-model metadata (model id, overall score, per-field
// confidence) so the UI can monitor how well the model is performing.
export function buildGrantInspect(
    c: GrantClassification,
    engine: 'cloud' | 'offline',
    rotation: number,
    refined: string[] = [],
    extras: { model?: string; score?: number; confidence?: Record<string, number> } = {}
): GrantInspect {
    return {
        engine,
        rotation,
        refined,
        model: extras.model,
        score: extras.score,
        confidence: extras.confidence,
        fields: Object.keys(FIELD_LABELS).map(key => ({
            key,
            label: FIELD_LABELS[key],
            value: (c.parsed as Record<string, string>)[key] || '',
            source: c.sources[key] || '',
            refined: refined.includes(key),
            confidence: extras.confidence ? extras.confidence[key] || 0 : undefined,
        })),
        lines: c.lineRecords.map(r => ({ text: r.text, kind: r.kind, labelType: r.labelType, field: r.field })),
    }
}
