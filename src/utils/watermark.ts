import { PDFDocument, rgb, degrees } from 'pdf-lib'

// --- 1. WATERMARK IMAGE FILES (Canvas Method) ---
async function addWatermarkToImage(file: File, watermarkText: string): Promise<File> {
    return new Promise((resolve) => {
        const img = new Image()
        const objectUrl = URL.createObjectURL(file)

        img.onload = () => {
            URL.revokeObjectURL(objectUrl)

            const canvas = document.createElement('canvas')
            canvas.width = img.width
            canvas.height = img.height
            const ctx = canvas.getContext('2d')

            if (!ctx) {
                resolve(file)
                return
            }

            ctx.drawImage(img, 0, 0)

            const fontSize = Math.max(18, Math.floor(canvas.width / 22))
            ctx.font = `bold ${fontSize}px sans-serif`
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'
            ctx.lineWidth = Math.max(1, fontSize / 14)

            ctx.translate(canvas.width / 2, canvas.height / 2)
            ctx.rotate((-30 * Math.PI) / 180)

            const textWidth = ctx.measureText(watermarkText).width + 80
            const stepX = textWidth
            const stepY = fontSize * 4.5

            for (let y = -canvas.height * 1.5; y < canvas.height * 1.5; y += stepY) {
                for (let x = -canvas.width * 1.5; x < canvas.width * 1.5; x += stepX) {
                    ctx.strokeText(watermarkText, x, y)
                    ctx.fillText(watermarkText, x, y)
                }
            }

            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        resolve(file)
                        return
                    }
                    resolve(new File([blob], file.name, { type: file.type || 'image/jpeg', lastModified: Date.now() }))
                },
                file.type || 'image/jpeg',
                0.92
            )
        }

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl)
            resolve(file)
        }

        img.src = objectUrl
    })
}

// --- 2. WATERMARK PDF FILES (pdf-lib Method) ---
async function addWatermarkToPDF(file: File, watermarkText: string): Promise<File> {
    try {
        const arrayBuffer = await file.arrayBuffer()
        const pdfDoc = await PDFDocument.load(arrayBuffer)
        const pages = pdfDoc.getPages()

        for (const page of pages) {
            const { width, height } = page.getSize()
            const fontSize = Math.max(16, Math.floor(width / 25))

            // Draw semi-transparent rotated watermark across every page
            page.drawText(watermarkText, {
                x: width / 6,
                y: height / 2.5,
                size: fontSize,
                color: rgb(0.6, 0.6, 0.6),
                opacity: 0.35,
                rotate: degrees(35),
            })

            page.drawText(watermarkText, {
                x: width / 4,
                y: height / 1.5,
                size: fontSize,
                color: rgb(0.6, 0.6, 0.6),
                opacity: 0.35,
                rotate: degrees(35),
            })
        }

        const pdfBytes = await pdfDoc.save()
        // Cast pdfBytes to any to avoid TypeScript Uint8Array<ArrayBufferLike> type error
        return new File([pdfBytes as any], file.name, { type: 'application/pdf', lastModified: Date.now() })
    } catch (err) {
        console.error('PDF Watermark error:', err)
        return file
    }
}

// --- 3. MAIN WATERMARK ENTRYPOINT ---
export async function addWatermarkToFile(file: File, watermarkText: string): Promise<File> {
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        return await addWatermarkToPDF(file, watermarkText)
    } else if (file.type.startsWith('image/')) {
        return await addWatermarkToImage(file, watermarkText)
    }
    return file
}