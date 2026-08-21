import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
function db() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }) }
async function user(request, supabase) { const token = request.headers.get('authorization')?.replace('Bearer ', ''); if (!token) return null; const { data: { user } } = await supabase.auth.getUser(token); return user }

export async function GET(request) {
  const supabase = db(), usuario = await user(request, supabase); if (!usuario) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const { data: tickets, error } = await supabase.from('support_tickets').select('*').eq('user_id', usuario.id).order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = (tickets || []).map(item => item.id)
  const { data: mensagens } = ids.length ? await supabase.from('support_messages').select('*').in('ticket_id', ids).order('created_at') : { data: [] }
  return NextResponse.json({ tickets: (tickets || []).map(item => ({ ...item, mensagens: (mensagens || []).filter(msg => msg.ticket_id === item.id) })) })
}
export async function POST(request) {
  const supabase = db(), usuario = await user(request, supabase); if (!usuario) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  try { const body = await request.json(); const texto = String(body.message || '').trim()
    if (body.ticket_id) { const { data: ticket } = await supabase.from('support_tickets').select('id,status').eq('id', body.ticket_id).eq('user_id', usuario.id).maybeSingle(); if (!ticket) throw new Error('Chamado não encontrado.'); if (!texto) throw new Error('Escreva sua mensagem.'); await supabase.from('support_messages').insert({ ticket_id: ticket.id, author_id: usuario.id, body: texto, is_admin: false }); await supabase.from('support_tickets').update({ status: 'aberto', updated_at: new Date().toISOString() }).eq('id', ticket.id); return NextResponse.json({ success: true }) }
    const subject = String(body.subject || '').trim(); if (subject.length < 3 || !texto) throw new Error('Preencha o assunto e a mensagem.')
    const { data: ticket, error } = await supabase.from('support_tickets').insert({ user_id: usuario.id, subject, category: body.category || 'duvida' }).select().single(); if (error) throw error
    const inserted = await supabase.from('support_messages').insert({ ticket_id: ticket.id, author_id: usuario.id, body: texto, is_admin: false }); if (inserted.error) { await supabase.from('support_tickets').delete().eq('id', ticket.id); throw inserted.error }
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}
