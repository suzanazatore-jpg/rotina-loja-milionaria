// Protocol enrollment takes precedence over general app notification audiences.
export async function protocolNotificationUserIds(db, userIds) {
  const ids = [...new Set(userIds)].filter(Boolean)
  const protocolUsers = new Set()
  const now = new Date().toISOString()
  for (let start = 0; start < ids.length; start += 200) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from('enrollments')
        .select('id,profile_id,courses!inner(protocol_enabled)')
        .in('profile_id', ids.slice(start, start + 200)).eq('status', 'active')
        .eq('courses.protocol_enabled', true)
        .or(`expires_at.is.null,expires_at.gt.${now}`).order('id').range(offset, offset + 499)
      if (error) throw error // Fail closed: never send a general message if access lookup fails.
      for (const row of data || []) protocolUsers.add(row.profile_id)
      if (!data || data.length < 500) break
    }
  }
  return protocolUsers
}

export async function withoutProtocolStudents(db, rows) {
  const blocked = await protocolNotificationUserIds(db, rows.map(row => row.user_id))
  return rows.filter(row => !blocked.has(row.user_id))
}
