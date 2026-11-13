// The integration identity is independent from the traffic-management client registry.
export async function readCentralMeta({token, version='v25.0', fetcher=fetch, tab='users'}={}) {
  if (!token) return {rows:[],configured:false,message:'Nenhuma conta Meta conectada à Central.'}
  if (!/^v\d+\.0$/.test(version)) throw new Error('Versão da conexão Meta inválida.')
  async function get(path,fields) {
    const url=new URL(`https://graph.facebook.com/${version}/${path}`)
    url.searchParams.set('fields',fields)
    const response=await fetcher(url,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(12000)})
    const body=await response.json()
    if (!response.ok || body.error) throw new Error('Não foi possível verificar a conta conectada. Confira a autorização da integração Meta.')
    return body
  }
  const user=await get('me','id,name')
  if (!user.id) throw new Error('A Meta não identificou a conta da integração.')
  // Never enumerate every account managed by this user as a Central connection.
  if (tab==='users') return {configured:true,rows:[{id:user.id,name:user.name || 'Conta Meta',email:null,connected_at:null}],message:null}
  return {configured:true,rows:[],message:'As contas de anúncio precisam de vínculo próprio com esta integração. As contas do módulo de gestão de tráfego não são importadas automaticamente.'}
}
