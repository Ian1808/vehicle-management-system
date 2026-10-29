"use client"

export type PreviewItem = { url: string; title: string }
export type PreviewState = { items: PreviewItem[]; index: number } | null

type PreviewModalProps = {
    preview: PreviewState
    onClose: () => void
    onDownload: (url: string, title: string) => void
    onNavigate: (index: number) => void
    isDark: boolean
}

export default function PreviewModal({ preview, onClose, onDownload, onNavigate, isDark }: PreviewModalProps) {
    if (!preview) return null

    const item = preview.items[preview.index]
    const count = preview.items.length
    const canPrev = count > 1 && preview.index > 0
    const canNext = count > 1 && preview.index < count - 1

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
                    {item.url.includes('.pdf') ? (
                        <iframe src={item.url} className="w-full h-[60vh] rounded-xl border-0" title={item.title} />
                    ) : (
                        <img
                            src={item.url}
                            alt={item.title}
                            className="max-h-[60vh] max-w-full w-auto object-contain rounded-xl shadow-md"
                        />
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
