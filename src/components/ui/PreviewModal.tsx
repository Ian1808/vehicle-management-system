"use client"

import { useState, useEffect } from 'react'

export type PreviewItem = { url: string; title: string }
export type PreviewState = { items: PreviewItem[]; index: number } | null

type PreviewModalProps = {
    preview: PreviewState
    onClose: () => void
    onDownload: (url: string, title: string) => void
    onNavigate: (index: number) => void
    isDark: boolean
}

const ZOOM_LEVELS = [1, 1.5, 2, 3, 4]

export default function PreviewModal({ preview, onClose, onDownload, onNavigate, isDark }: PreviewModalProps) {
    const [zoomIdx, setZoomIdx] = useState(0)

    // Reset zoom whenever a different item is shown.
    useEffect(() => {
        setZoomIdx(0)
    }, [preview?.index])

    if (!preview) return null

    const item = preview.items[preview.index]
    const count = preview.items.length
    const canPrev = count > 1 && preview.index > 0
    const canNext = count > 1 && preview.index < count - 1
    const zoom = ZOOM_LEVELS[zoomIdx]
    const isPdf = item.url.includes('.pdf')

    return (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className={`border rounded-3xl shadow-2xl max-w-3xl w-full p-6 flex flex-col max-h-[90vh] ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
                }`}>
                <div className={`flex justify-between items-center gap-3 pb-4 border-b ${isDark ? 'border-slate-800 text-white' : 'border-slate-200 text-slate-900'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                        <h3 className="text-base font-extrabold truncate">{item.title}</h3>
                        {count > 1 && (
                            <span className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full border ${isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                                {preview.index + 1} / {count}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className={`shrink-0 rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                            }`}
                    >
                        &times;
                    </button>
                </div>

                <div className={`py-4 flex-1 overflow-auto flex items-center justify-center rounded-2xl my-4 border p-2 relative ${isDark ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-50 border-slate-200'
                    }`}>
                    {canPrev && (
                        <button
                            onClick={() => onNavigate(preview.index - 1)}
                            title="Previous"
                            className={`absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center text-xl font-black shadow-lg transition-colors cursor-pointer ${isDark ? 'bg-slate-800/95 hover:bg-slate-700 text-white' : 'bg-white/95 hover:bg-slate-100 text-slate-800'
                                }`}
                        >
                            ‹
                        </button>
                    )}
                    {isPdf ? (
                        <iframe src={item.url} className="w-full h-[60vh] rounded-xl border-0" title={item.title} />
                    ) : zoom === 1 ? (
                        <img
                            src={item.url}
                            alt={item.title}
                            onClick={() => setZoomIdx(1)}
                            title="Click to zoom in"
                            className="max-h-[60vh] max-w-full w-auto object-contain rounded-xl shadow-md cursor-zoom-in"
                        />
                    ) : (
                        <div className="w-full h-[60vh] overflow-auto rounded-xl bg-slate-950/50">
                            <img
                                src={item.url}
                                alt={item.title}
                                onClick={() => setZoomIdx(0)}
                                title="Click to reset zoom"
                                style={{ width: `${zoom * 100}%`, maxWidth: 'none', height: 'auto' }}
                                className="rounded-xl cursor-zoom-out"
                            />
                        </div>
                    )}
                    {canNext && (
                        <button
                            onClick={() => onNavigate(preview.index + 1)}
                            title="Next"
                            className={`absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center text-xl font-black shadow-lg transition-colors cursor-pointer ${isDark ? 'bg-slate-800/95 hover:bg-slate-700 text-white' : 'bg-white/95 hover:bg-slate-100 text-slate-800'
                                }`}
                        >
                            ›
                        </button>
                    )}
                </div>

                {!isPdf && (
                    <div className={`flex flex-wrap items-center justify-center gap-2 -mt-2 mb-1 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        <button
                            onClick={() => setZoomIdx(Math.max(0, zoomIdx - 1))}
                            disabled={zoomIdx === 0}
                            title="Zoom out"
                            className={`w-8 h-8 rounded-full text-sm font-black transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                                }`}
                        >
                            −
                        </button>
                        <span className={`text-[11px] font-bold px-2 py-1 rounded-lg border ${isDark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-600'}`}>
                            {Math.round(zoom * 100)}%
                        </span>
                        <button
                            onClick={() => setZoomIdx(Math.min(ZOOM_LEVELS.length - 1, zoomIdx + 1))}
                            disabled={zoomIdx === ZOOM_LEVELS.length - 1}
                            title="Zoom in"
                            className={`w-8 h-8 rounded-full text-sm font-black transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                                }`}
                        >
                            +
                        </button>
                        {zoomIdx > 0 && (
                            <button
                                onClick={() => setZoomIdx(0)}
                                title="Reset to fit"
                                className={`px-3 h-8 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                                    }`}
                            >
                                ⟲ Fit
                            </button>
                        )}
                        <span className={`text-[10px] font-semibold ml-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Click photo to toggle zoom · drag scroll to pan</span>
                    </div>
                )}

                <div className={`flex flex-wrap justify-end gap-3 pt-2 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
                    <button
                        onClick={() => onDownload(item.url, item.title)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                    >
                        💾 Save File
                    </button>
                    <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                    >
                        ↗️ Open in New Tab
                    </a>
                    <button
                        onClick={onClose}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                            }`}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}
