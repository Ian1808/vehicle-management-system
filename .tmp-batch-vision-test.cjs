const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

// stub of the vehicle DB makes (as used by the component)
const MAKES = ['HONDA', 'NISSAN', 'MERCEDES BENZ', 'TOYOTA', 'PERODUA', 'PROTON', 'BMW', 'HYUNDAI', 'MAZDA', 'MITSUBISHI', 'FORD', 'VOLKSWAGEN', 'KIA', 'SUZUKI', 'SUBARU', 'LEXUS', 'AUDI', 'VOLVO', 'PORSCHE', 'RENAULT', 'PEUGEOT']
const normalizeKey = s => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
const getVehicleMakes = () => MAKES

// --- exact copy of the current parseGrantText from VehicleIntakeModal.tsx
function parseGrantText(raw) {
    const lines = raw.toUpperCase().replace(/\r/g, '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
    const result = { plate: '', chassis: '', make: '', model: '', variant: '', spec: '', year: '' }
    const LABELS = [
        { type: 'TAHUN', re: /(?:TAHUN|DIBUAT)/ },
        { type: 'TARIKH', re: /TARIKH/ },
        { type: 'KEUPAYAAN', re: /(?:KUUP|KUASA|KEUPAY)\w*\s*(?:ENJIN)?/ },
        { type: 'CHASIS', re: /CHASS?IS|CHESIS|ENJIN/ },
        { type: 'SYARAT', re: /SYARAT/ },
        { type: 'PENDAFTARAN', re: /PENDAFTARAN/ },
        { type: 'MODEL', re: /(?:BUATAN|BUSTAN|NAMA|NEMA)\s*MODE[!LI1]*|BUATAN|BUSTAN|MODEL|MODE[!LI1]*/ },
        { type: 'BAHAN', re: /BAHAN/ },
        { type: 'STATUS', re: /STATUS/ },
        { type: 'KELAS', re: /KELAS/ },
        { type: 'BDM', re: /B\.?\s*D\.?\s*M/ },
        { type: 'PEMUNYA', re: /PEMUNYA|PENUNYA/ },
        { type: 'ALAMAT', re: /ALAMAT/ },
        { type: 'ID', re: /(?:^|[^A-Z0-9])ID(?:$|[^A-Z0-9])/ },
    ]
    const labels = []
    const values = []
    const cleanValue = s => s.replace(/[^A-Z0-9 .()/-]/g, ' ').replace(/\s+/g, ' ').trim()
    for (const line of lines) {
        const entry = LABELS.find(l => { l.re.lastIndex = 0; return l.re.test(line) })
        if (!entry) { values.push(cleanValue(line.replace(/^\s*:\s*/, ''))); continue }
        let lastEnd = -1
        entry.re.lastIndex = 0
        let m
        while ((m = entry.re.exec(line)) !== null) {
            lastEnd = m.index + m[0].length
            if (entry.re.lastIndex === m.index) entry.re.lastIndex++
        }
        labels.push(entry.type)
        const tail = cleanValue(line.slice(lastEnd).replace(/^\s*:\s*/, ''))
        if (tail) values.push(tail)
    }
    const idxOf = type => labels.lastIndexOf(type)
    const strip = s => s.replace(/[^A-Z0-9]/g, '')
    for (const v of values) {
        const t = v.replace(/\s/g, '')
        if (/^[A-Z]{1,3}\d{1,4}[A-Z]?$/.test(t)) { result.plate = t; break }
    }
    const chassisLabelIdx = idxOf('CHASIS')
    if (chassisLabelIdx !== -1) {
        let bestC = ''
        let bestDist = Infinity
        for (let d = 0; d <= 3 && !bestC; d++) {
            for (const i of [chassisLabelIdx - d, chassisLabelIdx + d]) {
                if (i < 0 || i >= values.length) continue
                const v = values[i]
                if (v.split(/\s+/).filter(t => t !== '/').length > 2) continue
                const t = strip(v.split('/')[0])
                const c = t.length > 18 ? t.slice(0, 17) : t
                if (c.length >= 12 && /[A-Z]/.test(c) && /\d/.test(c) && Math.abs(i - chassisLabelIdx) < bestDist) {
                    bestC = c
                    bestDist = Math.abs(i - chassisLabelIdx)
                }
            }
        }
        result.chassis = bestC
    }
    if (!result.chassis) {
        for (const v of values) {
            if (v.split(/\s+/).filter(t => t !== '/').length > 2) continue
            const t = strip(v.split('/')[0])
            if (t.length >= 12 && /[A-Z]/.test(t) && /\d/.test(t)) { result.chassis = t.length > 18 ? t.slice(0, 17) : t; break }
        }
    }
    let mmValIdx = -1
    const mmLabelIdx = idxOf('MODEL')
    if (mmLabelIdx !== -1) {
        const rankedMakes = [...getVehicleMakes()].sort((a, b) => normalizeKey(b).length - normalizeKey(a).length)
        let bestScore = -Infinity
        for (let d = 0; d <= 3; d++) {
            for (const i of [mmLabelIdx - d, mmLabelIdx + d]) {
                if (i < 0 || i >= values.length) continue
                const v = values[i]
                const tokens = v.split(/\s+/).filter(Boolean)
                if (tokens.length < 2) continue
                if (/^\d+$/.test(v.replace(/[^0-9]/g, ''))) continue
                const norm = normalizeKey(v)
                let score = -d * 0.5
                if (rankedMakes.some(mk => norm.startsWith(normalizeKey(mk)))) score += 3
                if (v.includes('/')) score += 1.5
                if (tokens.length <= 5) score += 1
                if (score > bestScore) { bestScore = score; mmValIdx = i }
            }
        }
        if (mmValIdx !== -1) {
            const v = values[mmValIdx]
            const parts = v.split('/').map(s => s.trim()).filter(Boolean)
            if (parts.length >= 2) {
                result.make = parts[0]
                result.model = parts.slice(1).join(' / ')
            } else {
                const tk = v.split(/\s+/).filter(Boolean)
                result.make = tk[0]
                result.model = tk.slice(1).join(' ')
            }
        }
    }
    const specLabelIdx = idxOf('KEUPAYAAN')
    if (specLabelIdx !== -1) {
        for (let d = 0; d <= 3 && !result.spec; d++) {
            for (const i of [specLabelIdx - d, specLabelIdx + d]) {
                if (i < 0 || i >= values.length || i === mmValIdx) continue
                const digits = values[i].replace(/[^0-9]/g, '')
                if (digits.length === 3 || digits.length === 4) { result.spec = digits; break }
                if (digits.length === 5) { result.spec = digits.slice(-4); break }
            }
        }
    }
    if (!result.spec) {
        for (let i = 0; i < values.length; i++) {
            if (i === mmValIdx) continue
            const digits = values[i].replace(/[^0-9]/g, '')
            if (digits.length === 3 || digits.length === 4) { result.spec = digits; break }
            if (digits.length === 5) { result.spec = digits.slice(-4); break }
        }
    }
    const findYear = (from, to) => {
        for (let i = from; i <= to; i++) {
            const v = values[i] || ''
            if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(v)) continue
            const m = v.match(/(?:^|[^0-9])((?:19|20)\d{2})(?:$|[^0-9])/)
            if (m) return m[1]
        }
        return ''
    }
    const yearLabelIdx = idxOf('TAHUN')
    if (yearLabelIdx !== -1) result.year = findYear(Math.max(0, yearLabelIdx - 2), Math.min(values.length - 1, yearLabelIdx + 3))
    if (!result.year) result.year = findYear(0, values.length - 1)
    const modelTokens = result.model.split(/\s+/).filter(Boolean)
    if (modelTokens.length >= 2) result.variant = modelTokens.slice(1).join(' ')
    return result
}

const IMAGES = [
    { name: 'HR-V (182306)', path: 'C:\\Users\\Ian\\Downloads\\Screenshot 2026-10-28 182306.png', expect: { plate: 'PNX7474', chassis: 'PMHR5850JD603382', make: 'HONDA', model: 'HR-V 1.8L E', spec: '1799', year: '2019' } },
    { name: 'Civic sideways (174351)', path: 'C:\\Users\\Ian\\Downloads\\Screenshot 2026-10-28 174351.png', expect: { plate: 'PNP176', chassis: 'PMHFC6620JD301256', make: 'HONDA', model: 'CIVIC 1.8L I-VTEC (A)', spec: '1799', year: '2018' } },
    { name: 'Mercedes (174324)', path: 'C:\\Users\\Ian\\Downloads\\Screenshot 2026-10-28 174324.png', expect: { plate: 'KEK8282', chassis: 'WDD2221576L004367', make: 'MERCEDES BENZ', model: 'S400L HYBRID', spec: '3498', year: '2015' } },
    { name: 'Nissan (174257)', path: 'C:\\Users\\Ian\\Downloads\\Screenshot 2026-10-28 174257.png', expect: { plate: 'VEQ166', chassis: 'PN8EBAC27TCA12350', make: 'NISSAN', model: 'SERENA', spec: '1997', year: '2020' } },
    { name: 'Civic upright (024420)', path: 'C:\\Users\\Ian\\Downloads\\Screenshot 2026-10-28 024420.png', expect: { plate: 'PNP176', chassis: 'PMHFC6620JD301256', make: 'HONDA', model: 'CIVIC 1.8L I-VTEC (A)', spec: '1799', year: '2018' } },
]

async function compressForCloud(filePath) {
    const meta = await sharp(filePath).metadata()
    const MAX = 2000
    const scale = Math.min(1, MAX / Math.max(meta.width, meta.height))
    const buf = await sharp(filePath)
        .resize({ width: Math.round(meta.width * scale), height: Math.round(meta.height * scale) })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 95 })
        .toBuffer()
    return buf.toString('base64')
}

const normModel = s => s.toUpperCase().replace(/1-VTEC/g, 'I-VTEC').trim()

;(async () => {
    const envRaw = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8')
    const key = (envRaw.match(/^GOOGLE_VISION_API_KEY\s*=\s*(.+)$/m) || [])[1]?.trim() || ''
    let passCount = 0
    for (const img of IMAGES) {
        try {
            console.log(`[${img.name}] compressing...`)
            const imageBase64 = await compressForCloud(img.path)
            console.log(`[${img.name}] calling Vision (${(imageBase64.length / 1024).toFixed(0)} KB base64)...`)
            const ac = new AbortController()
            const timer = setTimeout(() => ac.abort(), 90000)
            const resp = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requests: [{ image: { content: imageBase64 }, features: [{ type: 'TEXT_DETECTION' }] }] }),
                signal: ac.signal,
            })
            clearTimeout(timer)
            const data = await resp.json()
            const text = data.responses?.[0]?.fullTextAnnotation?.text || ''
            if (!text) { console.log(`\n[${img.name}] NO TEXT`); continue }
            const r = parseGrantText(text)
            const checks = []
            checks.push(`plate:${r.plate === img.expect.plate ? '✓' : `✗(${r.plate || '∅'} vs ${img.expect.plate})`}`)
            checks.push(`chassis:${r.chassis === img.expect.chassis ? '✓' : `✗(${r.chassis || '∅'} vs ${img.expect.chassis})`}`)
            checks.push(`make:${r.make === img.expect.make ? '✓' : `✗(${r.make || '∅'} vs ${img.expect.make})`}`)
            checks.push(`model:${normModel(r.model).startsWith(img.expect.model) ? '✓' : `✗(${r.model || '∅'} vs ${img.expect.model})`}`)
            checks.push(`spec:${r.spec === img.expect.spec ? '✓' : `✗(${r.spec || '∅'} vs ${img.expect.spec})`}`)
            checks.push(`year:${r.year === img.expect.year ? '✓' : `✗(${r.year || '∅'} vs ${img.expect.year})`}`)
            const allOk = checks.every(c => c.includes('✓'))
            if (allOk) passCount++
            console.log(`\n[${img.name}] ${allOk ? 'PASS' : 'FAIL'}`)
            console.log('   ', checks.join('  '))
            console.log('   parsed:', JSON.stringify(r))
            if (!allOk) console.log('   --- vision text ---\n' + text.split('\n').map(l => '   | ' + l).join('\n'))
        } catch (e) {
            console.log(`\n[${img.name}] ERROR: ${e.message}`)
        }
    }
    console.log(`\n===== CLOUD: ${passCount}/${IMAGES.length} PASSED =====`)

    // offline regressions (Tesseract-style)
    const samples = {
        browserMang: `NO. PENDAFTARAN : PNP176
NO. CHESIS / NO. ENJIN : PHHFC662000301256 / R13Z11571258
NAMA MODE! : HONDA / CIVIC 1.8L I-VIEC (A)
KEUPAYAAN ENJIN 11799
JENIS BADAN / TAHUN DIBUAT : MOTOKAR / 2018`,
        nodeGray2x: `NO. PENDAFTARAN : PNP176
NO. CHESIS / NO. ENJIN : PMHFC6620JD301256 / R13Z11571258
BUATAN / NAMA MODEL © HONDA / CIVIC 1.8L I-VIEC (A)
KEUPAYZAN ENJIN 11799
JENIS BADAN / TAHUN DIBUAT : MOTOKAR / 2018`,
        nissan: `N43 Ti Ne. Pendaftaran © VEQ166 | CEE §
LO Ne ona in © PNGEBACZTICA12360 / WR20674310C = |
NN © Bustan/Nems Model NISSAN / SERENA 2.0L CVT HWS FE LW
ie © Keupayaan Enjin S197 i = |
: Jenis Baden/Tahun Dibust - WINDOW VAN / 2020 i Vile |`,
        honda: `No. Pendaftaran PNP176
No. Chasis / No. Enjin PMHF6620JD301256 / R13Z1571258
Buatan / Nama Model HONDA / CIVIC 1.8L I-VTEC (A)
Kuupayan Enjin 1799
Jenis Badan / Tahun Dibuat MOTOKAR / 2018`,
    }
    const expectations = {
        browserMang: { plate: 'PNP176', make: 'HONDA', model: 'CIVIC 1.8L I-VIEC (A)', year: '2018', spec: '1799' },
        nodeGray2x: { plate: 'PNP176', make: 'HONDA', model: 'CIVIC 1.8L I-VIEC (A)', year: '2018', spec: '1799' },
        nissan: { plate: 'VEQ166', make: 'NISSAN', model: 'SERENA 2.0L CVT HWS FE LW', year: '2020' },
        honda: { plate: 'PNP176', make: 'HONDA', model: 'CIVIC 1.8L I-VTEC (A)', year: '2018', spec: '1799' },
    }
    let regPass = 0
    for (const [name, sample] of Object.entries(samples)) {
        const r = parseGrantText(sample)
        const exp = expectations[name]
        const s = Object.entries(exp).every(([k, v]) => r[k] === v)
        console.log(`offline ${name}: ${s ? 'PASS' : 'FAIL'}`, JSON.stringify(r))
        if (s) regPass++
    }
    console.log(`===== OFFLINE REGRESSION: ${regPass}/${Object.keys(samples).length} PASSED =====`)
})().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
