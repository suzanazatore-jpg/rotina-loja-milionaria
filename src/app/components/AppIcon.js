'use client'

const paths = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5M9.5 20v-6h5v6"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  courses: <><path d="m3 7 9-4 9 4-9 4-9-4Z"/><path d="M7 9.5V15c3 2 7 2 10 0V9.5M21 7v7"/></>,
  plans: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
  campaigns: <><path d="m3 11 16-7v16L3 13v-2Z"/><path d="M11.6 16.8 10 21H6l1.4-5.7M19 9v6"/></>,
  routine: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 9l1.2 1.2L12 8M8.5 14l1.2 1.2L12 13M14 10h2M14 15h2"/></>,
  goals: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  banners: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 15 5-5 4 4 3-3 6 6M16 8h.01"/></>,
  carousel: <><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M2 8v8M22 8v8M9 9h6M9 13h6"/></>,
  comments: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"/><path d="M8 9h8M8 13h5"/></>,
  support: <><path d="M4 13a8 8 0 0 1 16 0"/><path d="M4 13v4a2 2 0 0 0 2 2h2v-7H4ZM20 13v4a2 2 0 0 1-2 2h-2v-7h4ZM16 19c0 2-2 2-4 2"/></>,
  broadcast: <><path d="M4 5h16v12H7l-3 3V5Z"/><path d="M8 9h8M8 13h5"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.09A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.57 15 1.7 1.7 0 0 0 3 14H3v-4h.09A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.57 1.7 1.7 0 0 0 10 3V3h4v.09a1.7 1.7 0 0 0 1.06 1.51 1.7 1.7 0 0 0 1.88-.34L17 4.2 19.83 7l-.06.06A1.7 1.7 0 0 0 19.43 9 1.7 1.7 0 0 0 21 10h.09v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  profile: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  content: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/></>,
  assistant: <><path d="M12 3v3M5.6 5.6l2.1 2.1M18.4 5.6l-2.1 2.1"/><rect x="4" y="8" width="16" height="12" rx="4"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><path d="M9 17h6"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  quickCalendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01"/></>,
  quickCampaigns: <><path d="M4 11.2v1.6a2.2 2.2 0 0 0 2.2 2.2H8l8.6 4.2V4.8L8 9H6.2A2.2 2.2 0 0 0 4 11.2Z"/><path d="M8 15v3.2A1.8 1.8 0 0 0 9.8 20h.7M20 8l1.5-1.5M20 12h2M20 16l1.5 1.5"/></>,
  quickRoutine: <><rect x="5" y="4.5" width="14" height="16.5" rx="2.5"/><path d="M9 4.5V3h6v1.5M8.5 10l1.2 1.2 2.3-2.5M14 10h2M8.5 15.5l1.2 1.2 2.3-2.5M14 15.5h2"/></>,
  quickTeam: <><circle cx="12" cy="8" r="3.2"/><circle cx="5.5" cy="10" r="2.2"/><circle cx="18.5" cy="10" r="2.2"/><path d="M6.5 20v-1.2A5.5 5.5 0 0 1 12 13.3a5.5 5.5 0 0 1 5.5 5.5V20M2.5 19v-.8a3.8 3.8 0 0 1 3.8-3.8M21.5 19v-.8a3.8 3.8 0 0 0-3.8-3.8"/></>,
  quickCourses: <><path d="m2.5 8 9.5-4.5L21.5 8 12 12.5 2.5 8Z"/><path d="M6 10v5.3c3.6 2.6 8.4 2.6 12 0V10M21.5 8v6"/></>,
  quickAssistant: <><path d="M20.5 13.2a7.7 7.7 0 0 1-8.1 7.3 8.4 8.4 0 0 1-3.2-.7L4 21l1.3-4.2A7.5 7.5 0 0 1 3.5 12c0-4.7 4-8.5 8.9-8.5"/><path d="m17.5 3 .7 2.1L20.5 6l-2.3.8-.7 2.2-.8-2.2L14.5 6l2.2-.9.8-2.1ZM12 8.5l.5 1.4 1.5.6-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.6.5-1.4Z"/></>,
}

export default function AppIcon({ name, size = 22, strokeWidth = 1.8, className }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.content}</svg>
}
