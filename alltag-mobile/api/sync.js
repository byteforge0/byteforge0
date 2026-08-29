const BASE='https://jsonblob.com/api/jsonBlob';

function getBody(req){
  if(req.body&&typeof req.body==='object')return req.body;
  if(typeof req.body==='string'){try{return JSON.parse(req.body)}catch{return null}}
  return null;
}
function validId(id){return /^[A-Za-z0-9_-]{4,160}$/.test(String(id||''))}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method==='POST'){
      const body=getBody(req);if(!body)return res.status(400).json({error:'invalid_body'});
      const upstream=await fetch(BASE,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body)});
      if(!upstream.ok)return res.status(502).json({error:'sync_create_failed'});
      const location=upstream.headers.get('location')||'',headerId=upstream.headers.get('x-jsonblob')||upstream.headers.get('X-jsonblob')||'',id=(location.split('/').filter(Boolean).pop()||headerId);
      if(!id)return res.status(502).json({error:'sync_id_missing'});
      return res.status(201).json({id:String(id)});
    }
    const id=String(req.query?.id||'');if(!validId(id))return res.status(400).json({error:'invalid_id'});
    if(req.method==='GET'){
      const upstream=await fetch(`${BASE}/${encodeURIComponent(id)}`,{headers:{Accept:'application/json'},cache:'no-store'});
      if(upstream.status===404)return res.status(404).json({error:'not_found'});if(!upstream.ok)return res.status(502).json({error:'sync_read_failed'});
      return res.status(200).json(await upstream.json());
    }
    if(req.method==='PUT'){
      const body=getBody(req);if(!body)return res.status(400).json({error:'invalid_body'});
      const upstream=await fetch(`${BASE}/${encodeURIComponent(id)}`,{method:'PUT',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body),cache:'no-store'});
      if(!upstream.ok)return res.status(502).json({error:'sync_write_failed'});
      return res.status(200).json({ok:true});
    }
    res.setHeader('Allow','GET, POST, PUT');return res.status(405).json({error:'method_not_allowed'});
  }catch{return res.status(500).json({error:'sync_proxy_failed'})}
}
