"use client";
import { useMemo, useState } from "react";
import { catalog, type SeriesCatalogItem } from "@/lib/catalog";
import { useCart } from "@/components/AppProvider";

type Result={item:SeriesCatalogItem;observations:{year:number;value:number}[];coverage:{start:number;end:number;count:number}|null;error?:string};

const concepts=Array.from(new Set(catalog.map(x=>x.concept))).sort();

function pctUnit(unit:string){return unit.toLowerCase().includes("percent");}

export default function ResolverClient(){
  const [concept,setConcept]=useState("inflation");
  const [country,setCountry]=useState("NGA");
  const [start,setStart]=useState(1980);
  const [end,setEnd]=useState(2025);
  const [results,setResults]=useState<Result[]>([]);
  const [busy,setBusy]=useState(false);
  const [primary,setPrimary]=useState<string>("");
  const [gapFill,setGapFill]=useState<string>("");
  const cart=useCart();

  const candidates=useMemo(()=>catalog.filter(x=>x.concept===concept&&x.normalized),[concept]);

  async function compare(){
    setBusy(true);setResults([]);setPrimary("");setGapFill("");
    const loaded=await Promise.all(candidates.map(async item=>{
      try{
        const url=new URL("/api/data",location.origin);
        url.searchParams.set("provider",item.providerId);
        url.searchParams.set("indicator",item.indicator);
        url.searchParams.set("country",country.toUpperCase());
        url.searchParams.set("start",String(start));
        url.searchParams.set("end",String(end));
        const r=await fetch(url);
        const d=await r.json();
        if(!r.ok) return {item,observations:[],coverage:null,error:d.error||"Request failed"} as Result;
        return {item,observations:d.observations||[],coverage:d.coverage||null} as Result;
      }catch(e){return {item,observations:[],coverage:null,error:e instanceof Error?e.message:"Request failed"} as Result;}
    }));
    setResults(loaded);setBusy(false);
  }

  const pairStats=useMemo(()=>{
    const valid=results.filter(x=>x.observations.length);
    if(valid.length<2) return null;
    const a=valid[0],b=valid[1];
    const bm=new Map(b.observations.map(x=>[x.year,x.value]));
    const pairs=a.observations.filter(x=>bm.has(x.year)).map(x=>[x.value,bm.get(x.year) as number] as const);
    const diffs=pairs.map(([left,right])=>Math.abs(left-right));
    if(!diffs.length) return null;
    const leftMean=pairs.reduce((sum,[left])=>sum+left,0)/pairs.length;
    const rightMean=pairs.reduce((sum,[,right])=>sum+right,0)/pairs.length;
    const numerator=pairs.reduce((sum,[left,right])=>sum+(left-leftMean)*(right-rightMean),0);
    const leftVariance=pairs.reduce((sum,[left])=>sum+(left-leftMean)**2,0);
    const rightVariance=pairs.reduce((sum,[,right])=>sum+(right-rightMean)**2,0);
    const correlation=pairs.length>1&&leftVariance>0&&rightVariance>0?numerator/Math.sqrt(leftVariance*rightVariance):null;
    return {a:a.item.title,b:b.item.title,count:diffs.length,mean:diffs.reduce((s,x)=>s+x,0)/diffs.length,max:Math.max(...diffs),correlation};
  },[results]);

  function coverageStyle(r:Result){
    if(!r.coverage) return {left:"0%",width:"0%"};
    const span=Math.max(1,end-start);
    const left=Math.max(0,Math.min(100,((r.coverage.start-start)/span)*100));
    const right=Math.max(0,Math.min(100,((r.coverage.end-start)/span)*100));
    return {left:left+"%",width:Math.max(1,right-left)+"%"};
  }

  const selectedPrimary=results.find(x=>x.item.id===primary);
  const selectedGap=results.find(x=>x.item.id===gapFill);
  const compatible=selectedPrimary&&selectedGap
    ? selectedPrimary.item.frequency===selectedGap.item.frequency && (selectedPrimary.item.unit===selectedGap.item.unit || (pctUnit(selectedPrimary.item.unit)&&pctUnit(selectedGap.item.unit)))
    : false;

  return <main className="resolverPage">
    <h1 className="pageTitle">Series resolver</h1>
    <p className="sectionCopy">Compare candidate series before filling gaps. The workbench does not silently splice providers.</p>

    <div className="resolverControls">
      <select className="input" value={concept} onChange={e=>setConcept(e.target.value)} aria-label="Concept">
        {concepts.map(c=><option key={c} value={c}>{c.replaceAll("-"," ")}</option>)}
      </select>
      <input className="input" value={country} maxLength={3} onChange={e=>setCountry(e.target.value.toUpperCase())} aria-label="ISO3 country code"/>
      <input className="input" type="number" value={start} onChange={e=>setStart(Number(e.target.value))} aria-label="Start year"/>
      <input className="input" type="number" value={end} onChange={e=>setEnd(Number(e.target.value))} aria-label="End year"/>
      <button className="button primary" onClick={compare} disabled={busy||start>end}>{busy?"Comparing…":"Compare series"}</button>
    </div>

    <div className="timeline">
      {!results.length?<div className="workspaceEmpty">{busy?"Retrieving candidate series…":"Choose a concept and compare available normalized sources."}</div>:
      results.map(r=><div className="timelineRow" key={r.item.id}>
        <div><strong>{r.item.provider}</strong><div className="sectionCopy" style={{fontSize:13}}>{r.item.title}</div></div>
        <div className="track" aria-label={r.coverage?"Coverage "+r.coverage.start+" to "+r.coverage.end:"No data returned"}><span className="bar" style={coverageStyle(r)}/></div>
        <div style={{fontSize:13}}>{r.error?<span style={{color:"var(--danger)"}}>Unavailable</span>:r.coverage?(r.coverage.start+"–"+r.coverage.end+" · "+r.coverage.count+" obs."):"No observations"}</div>
      </div>)}
    </div>

    {results.length>0&&<div className="comparisonGrid">
      <section className="panel">
        <h2>Overlap check</h2>
        {pairStats?<>
          <div className="ruleRow"><span>Common observations</span><strong>{pairStats.count}</strong></div>
          <div className="ruleRow"><span>Mean absolute difference</span><strong>{pairStats.mean.toFixed(3)}</strong></div>
          <div className="ruleRow"><span>Maximum absolute difference</span><strong>{pairStats.max.toFixed(3)}</strong></div>
          <div className="ruleRow"><span>Pearson correlation</span><strong>{pairStats.correlation===null?"Not applicable":pairStats.correlation.toFixed(4)}</strong></div>
          <p className="sectionCopy" style={{fontSize:13,marginTop:12}}>Numerical similarity alone does not prove methodological equivalence. Review definitions and source metadata before constructing a composite.</p>
        </>:<p className="sectionCopy">Two overlapping live series are needed before numerical differences can be calculated.</p>}
      </section>

      <section className="panel">
        <h2>Construction</h2>
        <label>Primary series<select className="input" value={primary} onChange={e=>setPrimary(e.target.value)}><option value="">Choose primary</option>{results.filter(x=>x.observations.length).map(r=><option key={r.item.id} value={r.item.id}>{r.item.provider+" — "+r.item.title}</option>)}</select></label>
        <label style={{display:"block",marginTop:12}}>Gap-fill series<select className="input" value={gapFill} onChange={e=>setGapFill(e.target.value)}><option value="">No gap fill</option>{results.filter(x=>x.observations.length&&x.item.id!==primary).map(r=><option key={r.item.id} value={r.item.id}>{r.item.provider+" — "+r.item.title}</option>)}</select></label>
        {primary&&gapFill&&<div className={compatible?"notice":"error"}>{compatible?"Basic unit and frequency checks are compatible. Methodology still requires researcher review.":"Unit or frequency mismatch detected. Keep the series separate unless you can justify a transformation."}</div>}
        {selectedPrimary&&<button className="button primary" onClick={()=>{cart.add(selectedPrimary.item);if(selectedGap&&compatible)cart.add(selectedGap.item)}}>Add selected construction to cart</button>}
      </section>
    </div>}
  </main>;
}
