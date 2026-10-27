"use client"

type ConfirmModalProps = {
    title: string
    message: string
    confirmText?: string
    confirmVariant?: 'primary' | 'danger' | 'success'
    onConfirm: () => void
    onCancel: () => void
    isDark: boolean
}

export default function ConfirmModal({
    title,
    message,
    confirmText = 'Confirm',
    confirmVariant = 'primary',
    onConfirm,
    onCancel,
    isDark,
}: ConfirmModalProps) {
    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-fadeIn">
            <div className={`border rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'
                }`}>
                <div className={`w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center text-xl font-bold border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
                    }`}>
                    {confirmVariant === 'danger' ? '⚠️' : confirmVariant === 'success' ? '✅' : '❓'}
                </div>
                <h3 className={`text-base font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>{title}</h3>
                <p className={`text-xs mt-2 font-medium leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{message}</p>

                <div className="flex gap-3 mt-6">
                    <button
                        type="button"
                        onClick={onCancel}
                        className={`w-1/2 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${isDark ? 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200'
                            }`}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={`w-1/2 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-all cursor-pointer ${confirmVariant === 'danger'
                                ? 'bg-rose-600 hover:bg-rose-500'
                                : confirmVariant === 'success'
                                    ? 'bg-emerald-600 hover:bg-emerald-500'
                                    : 'bg-blue-600 hover:bg-blue-500'
                            }`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    )
}