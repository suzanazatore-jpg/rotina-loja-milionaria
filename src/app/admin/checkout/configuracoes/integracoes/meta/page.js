import MetaIntegration from './MetaIntegration'
export default async function MetaPage({searchParams}) {
 const query=await searchParams
 const initialTab=['users','adaccounts','pixels','ads','audit'].includes(query?.tab)?query.tab:'users'
 return <MetaIntegration initialTab={initialTab}/>
}
