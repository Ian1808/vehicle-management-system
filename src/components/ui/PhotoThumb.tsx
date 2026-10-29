"use client"

type PhotoThumbProps = {
    url: string
    alt: string
    onClick: () => void
    className?: string
}

export default function PhotoThumb({ url, alt, onClick, className = 'h-24' }: PhotoThumbProps) {
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={url}
            alt={alt}
            onClick={onClick}
            loading="lazy"
            className={`w-full ${className} object-cover rounded-xl cursor-pointer hover:opacity-90 transition-opacity`}
        />
    )
}
