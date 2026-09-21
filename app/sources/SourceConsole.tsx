"use client";
import { useEffect, useMemo, useState } from "react";

type Provider = {id:string;shortName:string;mode:string;queryable:boolean;configured:boolean;protocol:string;docs:string};

const examples:Record<string,string>={
  "world-bank":"indicator/NY.GDP.MKTP.CD?format=json",
  "imf":"data/dataflow/IMF.RES/WEO/+/NGA.NGDP_RPCH.A?startPeriod=2020&endPeriod=2026",
  "ilo":"dataflow/all/all/latest",
  "oecd":"dataflow/all/all/latest",
  "eurostat":"statistics/1.0/data/DEMO_R_D3DENS?lang=EN",
  "unicef":"dataflow/all/all/latest/?format=sdmx-json&detail=allstubs",
  "unesco":"documentation/",
  "sdg":"GeoArea/List",
  "unhcr":"population/v1/countries/?limit=10",
  "un-population":"Indicators",
  "bis":"dataflow/all/all/latest",
  "ecb":"data/EXR/D.USD.EUR.SP00.A?startPeriod=2024-01-01",
  "wto":"indicator_categories?lang=1",
  "un-comtrade":"data/v1/getLiveUpdate",
  "fred":"series/search?search_text=nigeria&file_type=json",
  "eia":"electricity/retail-sales/data/?frequency=annual&data[0]=price&facets[stateid][]=US&start=2020"
};

export default function SourceConsole(){
  const [providers,setProviders]=useState<Provider[]>([]);
  const [provider,setProvider]=useState("world-bank");
  const [path,setPath]=useState(examples["world-bank"]);
  const [output,setOutput]=useState("Choose a provider and run a narrow API request.");
  const [busy,setBusy]=useState(false);

  useEffect(()=>{fetch("/api/providers").then(r=>r.json()).then(d=>setProviders((d.providers||[]).filter((p:Provider)=>p.queryable))).catch(()=>{});},[]);
  const selected=useMemo(()=>providers.find(p=>p.id===provider),[providers,provider]);

  async function run(){
    if(!path.trim()) return;
    setBusy(true); setOutput("Requesting provider…");
    try{
      const res=await fetch("/api/provider/"+encodeURIComponent(provider)+"?path="+encodeURIComponent(path.trim()));
      const type=res.headers.get("content-type")||"";
      const text=await res.text();
      let shown=text;
      if(type.includes("json")){
        try{shown=JSON.stringify(JSON.parse(text),null,2)}catch{}
      }
      if(shown.length>12000) shown=shown.slice(0,12000)+"\n\n[response truncated in browser preview]";
      setOutput((res.ok?"":"HTTP "+res.status+"\n")+shown);
    }catch(e){setOutput(e instanceof Error?e.message:"Request failed.");}
    finally{setBusy(false);}
  }

  function changeProvider(id:string){
    setProvider(id);
    setPath(examples[id]||"");
    setOutput("Ready.");
  }

  return <section className="apiConsole">
    <div className="sectionHeader" style={{marginBottom:14}}>
      <div><h2>Provider API console</h2><div className="sectionCopy">This console calls only allow-listed provider hosts through the server. It cannot be used as an open proxy.</div></div>
    </div>
    <div className="apiConsoleGrid">
      <select className="input" value={provider} onChange={e=>changeProvider(e.target.value)} aria-label="Provider">
        {providers.map(p=><option value={p.id} key={p.id}>{p.shortName}{p.mode==="keyed"&&!p.configured?" — key not configured":""}</option>)}
      </select>
      <input className="input" value={path} onChange={e=>setPath(e.target.value)} placeholder="Relative provider API path" aria-label="Relative provider API path"/>
      <button className="button primary" onClick={run} disabled={busy||!selected}>{busy?"Running…":"Run request"}</button>
    </div>
    {selected?.mode==="keyed"&&!selected.configured&&<div className="notice">This provider needs a server-side key before requests can run. Add the relevant environment variable in your host settings.</div>}
    <pre className="codeBox">{output}</pre>
  </section>;
}
