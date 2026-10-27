import { useState } from 'react'

export function useJPJPlate() {
    const [plate, setPlate] = useState('')
    const [error, setError] = useState('')

    const handlePlateChange = (value: string) => {
        const cleaned = value.toUpperCase().trim().replace(/[^A-Z0-9]/g, '')

        if (!cleaned) {
            setPlate('')
            setError('Plate number cannot be empty.')
            return
        }

        const standardPattern = /^[A-Z]{1,3}[0-9]{1,4}[A-Z]{0,2}$/
        const specialWordPattern = /^(MADANI|MALAYSIA|1MALAYSIA|PUTRAJAYA|LANGKAWI|SUKOM|BAMBEE|PATRIOT|G1M|A1M|VIP|GOLD|PERFECT|RIMAU|SMS|US|XX|YY|ZZ|FF|BHP)[0-9]{1,4}$/

        if (standardPattern.test(cleaned) || specialWordPattern.test(cleaned)) {
            setPlate(cleaned)
            setError('')
        } else {
            setPlate(cleaned)
            setError('Invalid JPJ format. E.g., WXY1234A, V1234, MADANI123')
        }
    }

    return { plate, setPlate, error, handlePlateChange }
}
