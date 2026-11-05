'use client'
import {useRef, useState} from 'react'

const addressFields = [
  ['street','Rua','address-line1',128], ['district','Bairro',undefined,64],
  ['city','Cidade','address-level2',64], ['state','Estado (UF)','address-level1',2],
]

export default function BillingAddressFields({compact, progressive = false, postalOnly = false}) {
  const [zip,setZip] = useState('')
  const [address,setAddress] = useState({})
  const [number,setNumber] = useState('')
  const [complement,setComplement] = useState('')
  const [notice,setNotice] = useState('')
  const [looking,setLooking] = useState(false)
  const [expanded,setExpanded] = useState(!compact)
  const request = useRef(0)

  async function lookup(value = zip) {
    const digits = value.replace(/\D/g,'')
    if (digits.length !== 8) {setNotice('Informe os 8 dígitos do CEP.');return}
    const current = ++request.current
    setLooking(true)
    setNotice('')
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
        credentials:'omit', referrerPolicy:'no-referrer', signal:AbortSignal.timeout(5000),
      })
      if(!response.ok)throw new Error()
      const data=await response.json()
      if(data.erro || !data.uf)throw new Error()
      if(current!==request.current)return
      setExpanded(!compact || !data.logradouro || !data.bairro || !data.localidade)
      setAddress({street:data.logradouro || '', district:data.bairro || '', city:data.localidade || '', state:data.uf})
      setNotice('Confira o endereço e complete os campos em branco.')
    } catch {
      if(current===request.current) {
        setExpanded(true)
        setNotice('Preencha o endereço manualmente.')
      }
    } finally {
      if(current===request.current)setLooking(false)
    }
  }
  function changeZip(value) {
    request.current++
    setLooking(false)
    setNotice('')
    if (value.replace(/\D/g,'') !== zip.replace(/\D/g,'')) setAddress({})
    setZip(value)
    if (progressive && value.replace(/\D/g,'').length === 8) lookup(value)
  }
  function changeAddress(key,value) {
    request.current++
    setLooking(false)
    setAddress(previous=>({...previous,[key]:value}))
  }
  const showAddress = !postalOnly && (!progressive || zip.replace(/\D/g,'').length === 8)
  return <section className="pc-address" aria-label={compact?'Endereço de cobrança':'Endereço para nota fiscal e contrato'}>
    {!progressive && <h3>{compact?'Endereço de cobrança do cartão':'Endereço para nota fiscal e contrato'}</h3>}
    <div className="cp-fields">
      <label className="cp-field"><span>CEP *</span><input placeholder="00000-000" name="zip_code" autoComplete="postal-code" inputMode="numeric" pattern="[0-9]{5}-?[0-9]{3}" maxLength={9} required value={zip} onChange={e=>changeZip(e.target.value)}/></label>
      {!progressive && <div><button type="button" className="pc-secondary" disabled={looking} onClick={()=>lookup()}>{looking?'Buscando…':'Buscar endereço pelo CEP'}</button></div>}
      {!postalOnly && notice && <p className="cp-field wide" role="status">{notice}</p>}
      {showAddress && <label className="cp-field"><span>Número (ou s/n) *</span><input name="address_number" value={number} onChange={e=>setNumber(e.target.value)} required maxLength={32}/></label>}
    </div>
    {showAddress && <details open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)} onInvalidCapture={()=>setExpanded(true)}>
      <summary>{compact && address.street && !expanded ? [address.street,address.district,address.city,address.state].filter(Boolean).join(' · ') + ' — Editar' : 'Preencher ou editar endereço'}</summary>
      <div className="cp-fields">
      {addressFields.map(([key,label,autoComplete,maxLength])=><label className={'cp-field'+(key==='street'?' wide':'')} key={key}>
        <span>{label} *</span><input name={key} autoComplete={autoComplete} maxLength={maxLength} required pattern={key==='state'?'[A-Za-z]{2}':undefined} value={address[key] || ''} onChange={e=>changeAddress(key,e.target.value)}/>
      </label>)}
      <label className="cp-field wide"><span>Complemento (opcional)</span><input name="line_2" value={complement} onChange={e=>setComplement(e.target.value)} autoComplete="address-line2" maxLength={128}/></label>
      </div>
    </details>}
  </section>
}
