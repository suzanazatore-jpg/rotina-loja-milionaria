import { MAX_PROTOCOL_PRODUCTS } from '@/lib/protocolProducts'

export default function ProductEditor({products,setProducts,busy}) {
  const total=products.reduce((sum,item)=>sum+(Number(item.quantity)||0),0)
  return <div className="pro-products-editor">
    <p>Adicione cada produto e a quantidade de peças que deseja vender. Pode cadastrar 20, 30 ou mais produtos.</p>
    {products.map((item,index)=><div className="pro-product-row" key={index}>
      <label>Produto {index+1}<input disabled={busy} maxLength={120} value={item.name} placeholder="Ex.: vestido floral M" onChange={e=>setProducts(current=>current.map((p,i)=>i===index?{...p,name:e.target.value}:p))} /></label>
      <label>Quantidade<input disabled={busy} type="number" min="1" max="100000" step="1" inputMode="numeric" value={item.quantity} placeholder="Ex.: 5" onChange={e=>setProducts(current=>current.map((p,i)=>i===index?{...p,quantity:e.target.value}:p))} /></label>
      <button type="button" className="pro-quiet pro-remove-product" disabled={busy||products.length===1} aria-label={`Remover produto ${index+1}`} onClick={()=>setProducts(current=>current.filter((_,i)=>i!==index))}>Remover</button>
    </div>)}
    <button type="button" className="pro-add-product" disabled={busy||products.length>=MAX_PROTOCOL_PRODUCTS} onClick={()=>setProducts(current=>[...current,{name:'',quantity:''}])}>+ Adicionar produto</button>
    <p aria-live="polite"><strong>{products.filter(item=>item.name.trim()).length} produtos · {total} peças no total</strong></p>
  </div>
}
