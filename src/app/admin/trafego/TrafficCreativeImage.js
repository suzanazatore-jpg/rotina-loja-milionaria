'use client'
import {useState} from 'react'
import {safeMedia} from '@/lib/trafficReportModel'

function ImageAttempts({urls,name,className}) {
  const [attempt,setAttempt] = useState(0)
  return urls[attempt]
    ? <img className={className} src={urls[attempt]} alt={'Criativo '+name} loading="lazy" referrerPolicy="no-referrer" onError={() => setAttempt(n => n + 1)}/>
    : <span className="tr-creative-missing">{urls.length ? 'Imagem indisponível na Meta' : 'Imagem não fornecida pela Meta'}</span>
}
export default function TrafficCreativeImage({ad,className}) {
  const urls = [...new Set([...(ad.image_urls || []), ad.image_url].map(safeMedia).filter(Boolean))]
  return <ImageAttempts key={ad.id+':'+urls.join('|')} urls={urls} name={ad.name} className={className}/>
}
