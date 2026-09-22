"use client";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/components/AppProvider";
import type { SeriesCatalogItem } from "@/lib/catalog";
import type { DatasetDimension, DatasetStructure } from "@/lib/sdmx";

function DimensionControl({dimension,value,onChange}:{dimension:DatasetDimension;value:string[];onChange:(value:string[])=>void}){
  const [query,setQuery]=useState("");
  const shown=useMemo(()=>{
    const term=query.trim().toLowerCase();
    return dimension.values.filter(option=>!term||option.code.toLowerCase().includes(term)||option.label.toLowerCase().includes(term)).slice(0,200);
  },[dimension.values,query]);
  function toggle(code:string){ onChange(value.includes(code)?value.filter(item=>item!==code):[...value,code]); }

  return <section className="dimensionGroup">
    <div className="dimensionHead"><div><strong>{dimension.label}</strong><small>{dimension.id} · {dimension.values.length} values</small></div>{value.length>0&&<button type="button" onClick={()=>onChange([])}>Clear</button>}</div>
    {dimension.role==="geography"
      ?<p className="filterHint">Country is supplied by the searchable multi-country selector in Workspace.</p>
      :<>
        {dimension.values.length>8&&<input className="input" value={query} onChange={event=>setQuery(event.target.value)} placeholder={`Search ${dimension.label.toLowerCase()}`}/>}
        <div className="dimensionValues">
          {shown.map(option=><label className="check" key={option.code}>
            <input type="checkbox" checked={value.includes(option.code)} onChange={()=>toggle(option.code)}/>
            <span>{option.label}</span><small>{option.code}</small>
          </label>)}
          {!shown.length&&<span className="sectionCopy">No values match this search.</span>}
          {dimension.values.length>shown.length&&<span className="filterHint">Showing the first 200 matches. Search to narrow the list.</span>}
        </div>
      </>}
  </section>;
}

export default function DatasetExplorer({providerId,dataset,agency,version}:{providerId:string;dataset:string;agency:string;version:string}){
  const [structure,setStructure]=useState<DatasetStructure|null>(null);
  const [selections,setSelections]=useState<Record<string,string[]>>({});
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const cart=useCart();

  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError("");
    fetch(`/api/datasets/${encodeURIComponent(providerId)}/${encodeURIComponent(dataset)}?agency=${encodeURIComponent(agency)}&version=${encodeURIComponent(version)}`,{signal:controller.signal})
      .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not load dataset structure");return data;})
      .then(setStructure)
      .catch(cause=>{if(cause?.name!=="AbortError")setError(cause instanceof Error?cause.message:"Could not load dataset structure");})
      .finally(()=>setLoading(false));
    return ()=>controller.abort();
  },[providerId,dataset,agency,version]);

  async function resolve(){
    if(!structure) return;
    setBusy(true);setError("");setMessage("");
    try{
      const response=await fetch("/api/datasets/resolve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        providerId,agency:structure.agency,dataset:structure.dataset,datasetVersion:structure.version,datasetTitle:structure.title,
        dimensions:structure.dimensions,selections,sourceUrl:structure.sourceUrl
      })});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||"Could not resolve series");
      const items:SeriesCatalogItem[]=Array.isArray(data.items)?data.items:[];
      items.forEach(item=>cart.add(item));
      setMessage(`${items.length} resolved series added to the Data Cart.`);
    }catch(cause){setError(cause instanceof Error?cause.message:"Could not resolve series");}
    finally{setBusy(false);}
  }

  return <main className="datasetPage">
    <div className="datasetTitle"><div><a href="/discover">← Discover</a><h1>{structure?.title||dataset}</h1><p className="sectionCopy">{providerId.toUpperCase()} · Resolve every non-country dimension before adding series.</p></div><a className="button" href="/workspace">Data Cart ({cart.items.length})</a></div>
    {loading&&<p className="loading">Loading dataset structure…</p>}
    {error&&<div className="error">{error}</div>}
    {message&&<div className="notice">{message}</div>}
    {structure&&<>
      <div className="dimensionGrid">{structure.dimensions.map(dimension=><DimensionControl key={dimension.id} dimension={dimension} value={selections[dimension.id]||[]} onChange={value=>setSelections(previous=>({...previous,[dimension.id]:value}))}/>)}</div>
      <div className="datasetActions"><span className="sectionCopy">Multiple choices generate separate series, capped at 100 per action.</span><button className="button primary" type="button" disabled={busy} onClick={resolve}>{busy?"Resolving…":"Resolve and add series"}</button></div>
    </>}
  </main>;
}
