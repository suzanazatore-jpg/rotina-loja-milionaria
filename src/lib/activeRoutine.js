// A rotina continua válida até a próxima publicação, inclusive em outro mês.
// As datas de execução acompanham a semana consultada, sem alterar a publicação
// nem reutilizar as marcações de tarefas feitas em semanas anteriores.
export async function loadActiveRoutine(supabase, weekStart, columns = '*') {
  const { data, error } = await supabase
    .from('rotinas')
    .select(columns)
    .lte('semana_inicio', weekStart)
    .order('semana_inicio', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    data: data ? { ...data, semana_publicacao: data.semana_inicio, semana_inicio: weekStart } : null,
    error,
  }
}
