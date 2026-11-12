"use client"

import PhotoThumb from '@/components/ui/PhotoThumb'

type MediaItem = {
    id: string
    category: string
    file_url: string
    media_type: string
    vehicle_id: string
}

type AdditionalPhotosGridProps = {
    isDark: boolean
    mediaItems: MediaItem[]
    vehiclePlate: string
    accent?: 'purple' | 'blue'
    onView: (url: string, title: string) => void
    onRemove?: (item: MediaItem) => void
    pendingRemovalIds?: string[]
}

function additionalLabel(category: string): string {
    return category.replace(/^extra_/, '').replace(/_[a-f0-9]{8}$/i, '').replace(/_/g, ' ')
}

export default function AdditionalPhotosGrid({ isDark, mediaItems, vehiclePlate, accent = 'purple', onView, onRemove, pendingRemovalIds }: AdditionalPhotosGridProps) {
    const additional = mediaItems.filter(m => m.media_type === 'photo_additional')
    const isBlue = accent === 'blue'
    const capturedColor = isBlue ? (isDark ? 'text-blue-300' : 'text-blue-600') : (isDark ? 'text-purple-300' : 'text-purple-600')

    return (
        <div className={`rounded-3xl border p-6 sm:p-8 shadow-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
            <h3 className={`text-sm font-extrabold uppercase tracking-wider mb-6 pb-4 border-b ${isDark ? 'border-slate-800/50' : 'border-slate-200'}`}>
                Additional Evidence Photos ({additional.length} Captured)
            </h3>
            {additional.length === 0 ? (
                <p className={`text-sm font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    No additional photos uploaded by technician.
                </p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {additional.map((item) => (
                        <div key={item.id} className={`border rounded-2xl p-4 flex flex-col justify-between gap-3 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                            <div>
                                <p className="text-xs font-extrabold uppercase tracking-wider mb-1">{additionalLabel(item.category)}</p>
                                <p className={`text-xs font-semibold ${capturedColor}`}>✓ Captured</p>
                            </div>
                            <PhotoThumb
                                url={item.file_url}
                                alt={`${vehiclePlate} - ${additionalLabel(item.category)} (Additional)`}
                                onClick={() => onView(item.file_url, `${vehiclePlate} - ${additionalLabel(item.category)} (Additional)`)}
                                className="h-24"
                            />
                            {onRemove && (
                                <button
                                    type="button"
                                    onClick={() => onRemove(item)}
                                    className={`w-full py-1.5 rounded-lg text-[10px] font-bold border cursor-pointer transition-colors ${isDark ? 'bg-rose-950 hover:bg-rose-900 text-rose-300 border-rose-900' : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'}`}
                                >
                                    {pendingRemovalIds?.includes(item.id) ? '✓ Staged to Remove' : '🗑️ Remove'}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
