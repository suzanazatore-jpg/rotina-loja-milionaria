export const TUTORIAL_COVER_BUCKET = 'course-covers'
export const TUTORIAL_COVER_MAX_BYTES = 3 * 1024 * 1024
export const TUTORIAL_COVER_TYPES = ['image/jpeg', 'image/png']

export function isTutorialCoverPath(path, moduleKey) {
  if (typeof path !== 'string' || typeof moduleKey !== 'string') return false
  const parts = path.split('/')
  return parts.length === 3 && parts[0] === 'tutorial-videos' && parts[1] === moduleKey
    && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|png)$/.test(parts[2])
}

export function withTutorialCoverUrl(supabase, video) {
  const coverPath = isTutorialCoverPath(video.cover_image_path, video.module_key) ? video.cover_image_path : null
  return {
    ...video,
    cover_image_path: coverPath,
    cover_image_url: coverPath ? supabase.storage.from(TUTORIAL_COVER_BUCKET).getPublicUrl(coverPath).data.publicUrl : null,
  }
}
