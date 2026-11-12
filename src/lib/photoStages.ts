export type PhotoStageMode = 'edit' | 'readonly' | 'hidden'

export type PhotoStageRules = {
    before: PhotoStageMode
    after: PhotoStageMode
    additional: PhotoStageMode
}

// Controls which photo sections are visible and editable at each vehicle status.
// 'hidden'   — section is not rendered at all
// 'edit'     — section visible, technician can upload/remove
// 'readonly' — section visible as evidence only, no upload/remove
export const PHOTO_STAGE_RULES: Record<string, PhotoStageRules> = {
    intake: { before: 'hidden', after: 'hidden', additional: 'hidden' },
    pending_before_photos: { before: 'edit', after: 'hidden', additional: 'edit' },
    in_repair: { before: 'readonly', after: 'hidden', additional: 'edit' },
    pending_after_photos: { before: 'readonly', after: 'edit', additional: 'edit' },
    completed: { before: 'readonly', after: 'readonly', additional: 'readonly' },
    road_ready: { before: 'readonly', after: 'readonly', additional: 'readonly' },
}

export function getPhotoStageRules(status: string): PhotoStageRules {
    return PHOTO_STAGE_RULES[status] || { before: 'readonly', after: 'readonly', additional: 'readonly' }
}

export type PhotoGroupKey = 'before' | 'after' | 'additional'

// Which evidence tab should open first for a given vehicle status, so a technician
// lands directly on the stage that actually needs input instead of hunting for it.
export function getStageTab(status: string): PhotoGroupKey {
    switch (status) {
        case 'pending_before_photos': return 'before'
        case 'in_repair': return 'additional'   // 'after' is hidden until repair is finished
        case 'pending_after_photos': return 'after'
        case 'completed': return 'after'
        case 'road_ready': return 'after'
        default: return 'before'
    }
}
