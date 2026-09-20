"use client";
import { useMemo, useState } from "react";
import { useCart } from "@/components/AppProvider";
import type { SeriesCatalogItem } from "@/lib/catalog";

type Point={year:number;value:number};
type Loaded={
  item:SeriesCatalogItem;
  points:Point[];
  coverage?:{start:number;end:number;count:number};
  sourceUrl?:string;
  retrievedAt?:string;
  error?:string;
  derived?:boolean;
  formula?:string;
};

function csvEscape(v:unknown){
  const s=String(v??"");
  return /[",\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;
}

function LineChart({series}:{series:Loaded|null}){
  if(!series||series.points.length<2) return <div className="workspaceEmpty">Choose a loaded series to chart.</div>;
  const pts=series.points;
  const w=900,h=260,pad=28;
  const xs=pts.map(x=>x.year),ys=pts.map(x=>x.value);
  const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
  const x=(v:number)=>pad+((v-xmin)/Math.max(1,xmax-xmin))*(w-pad*2);
  const y=(v:number)=>h-pad-((v-ymin)/Math.max(.000001,ymax-ymin))*(h-pad*2);
  const path=pts.map((p,i)=>(i?"L":"M")+x(p.year).toFixed(1)+" "+y(p.value).toFixed(1)).join(" ");
  return <svg viewBox={"0 0 "+w+" "+h} role="img" aria-label={series.item.title+" line chart"}>
    <line x1={pad} y1={h-pad} x2={w-pad} y2={h-pad} stroke="currentColor" opacity=".25"/>
    <line x1={pad} y1={pad} x2={pad} y2={h-pad} stroke="currentColor" opacity=".25"/>
    <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2"/>
    <text x={pad} y={h-7} fontSize="11" fill="currentColor">{xmin}</text>
    <text x={w-pad} y={h-7} textAnchor="end" fontSize="11" fill="currentColor">{xmax}</text>
    <text x={pad+4} y={pad+10} fontSize="11" fill="currentColor">{ymax.toFixed(2)}</text>
    <text x={pad+4} y={h-pad-6} fontSize="11" fill="currentColor">{ymin.toFixed(2)}</text>
  </svg>;
}

export default function WorkspaceClient(){
  const cart=useCart();
  const [country,setCountry]=useState("NGA");
  const [start,setStart]=useState(1990);
  const [end,setEnd]=useState(2025);
  const [loaded,setLoaded]=useState<Loaded[]>([]);
  const [busy,setBusy]=useState(false);
  const [active,setActive]=useState("");
  const [view,setView]=useState<"data"|"chart"|"transform"|"metadata">("data");
  const [message,setMessage]=useState("");

  async function retrieve(){
    if(!cart.items.length) return;
    setBusy(true);setMessage("");
    const results=await Promise.all(cart.items.map(async item=>{
      try{
        const u=new URL("/api/data",location.origin);
        u.searchParams.set("provider",item.providerId);
        u.searchParams.set("indicator",item.indicator);
        u.searchParams.set("country",country.toUpperCase());
        u.searchParams.set("start",String(start));
        u.searchParams.set("end",String(end));
        const r=await fetch(u);
        const d=await r.json();
        if(!r.ok) return {item,points:[],error:d.error||"Request failed"} as Loaded;
        return {item,points:d.observations||[],coverage:d.coverage,sourceUrl:d.sourceUrl,retrievedAt:d.retrievedAt} as Loaded;
      }catch(e){
        return {item,points:[],error:e instanceof Error?e.message:"Request failed"} as Loaded;
      }
    }));
    setLoaded(results);
    setActive(results.find(x=>x.points.length)?.item.id||"");
    setBusy(false);
  }

  const years=useMemo(()=>{
    const all=new Set<number>();
    loaded.forEach(s=>s.points.forEach(p=>all.add(p.year)));
    return [...all].sort((a,b)=>a-b);
  },[loaded]);

  const maps=useMemo(()=>Object.fromEntries(loaded.map(s=>[s.item.id,new Map(s.points.map(p=>[p.year,p.value]))])),[loaded]);
  const activeSeries=loaded.find(x=>x.item.id===active)||null;

  function addTransform(kind:"log"|"growth"|"lag"|"diff"){
    if(!activeSeries||!activeSeries.points.length) return;
    let points:Point[]=[];
    let suffix="";
    let formula="";
    const p=activeSeries.points;
    if(kind==="log"){
      points=p.filter(x=>x.value>0).map(x=>({year:x.year,value:Math.log(x.value)}));
      suffix=" (log)";formula="ln(x)";
    }
    if(kind==="growth"){
      points=p.slice(1).filter((x,i)=>p[i].value!==0).map((x,i)=>({year:x.year,value:((x.value-p[i].value)/p[i].value)*100}));
      suffix=" growth";formula="((x_t-x_t-1)/x_t-1)*100";
    }
    if(kind==="lag"){
      points=p.slice(1).map((x,i)=>({year:x.year,value:p[i].value}));
      suffix=" lag 1";formula="x_t-1";
    }
    if(kind==="diff"){
      points=p.slice(1).map((x,i)=>({year:x.year,value:x.value-p[i].value}));
      suffix=" first difference";formula="x_t-x_t-1";
    }
    const item:SeriesCatalogItem={
      ...activeSeries.item,
      id:activeSeries.item.id+"-"+kind,
      title:activeSeries.item.title+suffix,
      indicator:activeSeries.item.indicator+"_"+kind.toUpperCase(),
      provider:"Derived",
      providerId:"derived",
      description:"Derived in Public Data Workbench from "+activeSeries.item.title
    };
    setLoaded(prev=>[...prev.filter(x=>x.item.id!==item.id),{item,points,derived:true,formula}]);
    setActive(item.id);
    setMessage(item.title+" created.");
  }

  function exportCsv(){
    if(!loaded.length||!years.length) return;
    const cols=loaded.filter(x=>x.points.length);
    const rows:string[][]=[["Country","Year",...cols.map(x=>x.item.title)]];
    years.forEach(year=>rows.push([country,String(year),...cols.map(x=>{
      const v=maps[x.item.id]?.get(year);
      return v===undefined?"":String(v);
    })]));
    const blob=new Blob([rows.map(r=>r.map(csvEscape).join(",")).join("\n")],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="public-data-"+country+"-"+start+"-"+end+".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportMetadata(){
    const meta=loaded.map(s=>({
      title:s.item.title,
      provider:s.item.provider,
      providerId:s.item.providerId,
      indicator:s.item.indicator,
      unit:s.item.unit,
      frequency:s.item.frequency,
      coverage:s.coverage,
      sourceUrl:s.sourceUrl,
      retrievedAt:s.retrievedAt,
      derived:s.derived||false,
      formula:s.formula||null
    }));
    const blob=new Blob([JSON.stringify(meta,null,2)],{type:"application/json"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="metadata.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return <div className="workspace">
    <aside className="workspaceNav">
      {(["data","chart","transform","metadata"] as const).map(v=><button data-short={v.slice(0,3).toUpperCase()} className={view===v?"active":""} onClick={()=>setView(v)} key={v}>{v[0].toUpperCase()+v.slice(1)}</button>)}
    </aside>

    <main className="workspaceMain">
      <div className="workspaceTop">
        <div>
          <h1>Research workspace</h1>
          <div className="sectionCopy">{cart.items.length+" selected series · "+loaded.filter(x=>x.points.length).length+" loaded"}</div>
        </div>
        <div className="workspaceControls">
          <input className="input" style={{width:86}} value={country} maxLength={3} onChange={e=>setCountry(e.target.value.toUpperCase())} aria-label="ISO3 country code"/>
          <input className="input" style={{width:90}} type="number" value={start} onChange={e=>setStart(Number(e.target.value))} aria-label="Start year"/>
          <input className="input" style={{width:90}} type="number" value={end} onChange={e=>setEnd(Number(e.target.value))} aria-label="End year"/>
          <button className="button primary" onClick={retrieve} disabled={busy||!cart.items.length||start>end}>{busy?"Retrieving…":"Retrieve data"}</button>
        </div>
      </div>

      {message&&<div className="notice">{message}</div>}
      {!cart.items.length&&<div className="workspaceEmpty">Your data cart is empty. <a style={{color:"var(--accent)",textDecoration:"underline"}} href="/discover">Discover series first.</a></div>}

      {view==="data"&&cart.items.length>0&&<>
        {loaded.some(x=>x.error)&&<div className="error">{loaded.filter(x=>x.error).map(x=>x.item.provider+": "+x.error).join(" · ")}</div>}
        {!loaded.length?<div className="workspaceEmpty">Set the country and date range, then retrieve the selected series.</div>:<div className="tableScroller">
          <table className="dataTable">
            <thead><tr><th>Country</th><th>Year</th>{loaded.filter(x=>x.points.length).map(s=><th key={s.item.id}>{s.item.title}</th>)}</tr></thead>
            <tbody>{years.map(year=><tr key={year}><td>{country}</td><td>{year}</td>{loaded.filter(x=>x.points.length).map(s=><td key={s.item.id}>{maps[s.item.id]?.get(year)?.toLocaleString(undefined,{maximumFractionDigits:4})??""}</td>)}</tr>)}</tbody>
          </table>
        </div>}
      </>}

      {view==="chart"&&<>
        <div className="workspaceControls" style={{marginBottom:12}}>
          <select className="input" style={{maxWidth:460}} value={active} onChange={e=>setActive(e.target.value)}>
            <option value="">Choose series</option>
            {loaded.filter(x=>x.points.length).map(s=><option value={s.item.id} key={s.item.id}>{s.item.title}</option>)}
          </select>
        </div>
        <div className="chartBox"><LineChart series={activeSeries}/></div>
      </>}

      {view==="transform"&&<>
        <div className="workspaceControls" style={{marginBottom:12}}>
          <select className="input" style={{maxWidth:460}} value={active} onChange={e=>setActive(e.target.value)}>
            <option value="">Choose input series</option>
            {loaded.filter(x=>x.points.length).map(s=><option value={s.item.id} key={s.item.id}>{s.item.title}</option>)}
          </select>
        </div>
        <div className="transformGrid">
          <div className="transformCard"><h3>Natural log</h3><p>Creates ln(x); non-positive observations are excluded.</p><button className="button" disabled={!activeSeries} onClick={()=>addTransform("log")}>Create log</button></div>
          <div className="transformCard"><h3>Growth rate</h3><p>Percentage change from the previous observation.</p><button className="button" disabled={!activeSeries} onClick={()=>addTransform("growth")}>Create growth</button></div>
          <div className="transformCard"><h3>Lag 1</h3><p>Moves the previous observation into the current period.</p><button className="button" disabled={!activeSeries} onClick={()=>addTransform("lag")}>Create lag</button></div>
          <div className="transformCard"><h3>First difference</h3><p>Current value minus the previous value.</p><button className="button" disabled={!activeSeries} onClick={()=>addTransform("diff")}>Create difference</button></div>
        </div>
      </>}

      {view==="metadata"&&<div className="tableScroller">
        <table className="dataTable">
          <thead><tr><th>Variable</th><th>Provider</th><th>Code</th><th>Unit</th><th>Frequency</th><th>Coverage</th></tr></thead>
          <tbody>{loaded.map(s=><tr key={s.item.id}><td>{s.item.title}</td><td>{s.item.provider}</td><td>{s.item.indicator}</td><td>{s.item.unit}</td><td>{s.item.frequency}</td><td>{s.coverage?(s.coverage.start+"–"+s.coverage.end):s.derived?"Derived":"—"}</td></tr>)}</tbody>
        </table>
      </div>}
    </main>

    <aside className="workspaceInspector">
      <h2 style={{fontFamily:"Georgia,serif",fontWeight:500,margin:"0 0 10px"}}>Dataset</h2>
      <div className="sectionCopy">{country+" · "+start+"–"+end}</div>
      <div className="metaList">
        <div className="metaRow"><dt>Selected</dt><dd>{cart.items.length}</dd></div>
        <div className="metaRow"><dt>Loaded</dt><dd>{loaded.filter(x=>x.points.length).length}</dd></div>
        <div className="metaRow"><dt>Rows</dt><dd>{years.length}</dd></div>
        <div className="metaRow"><dt>Derived</dt><dd>{loaded.filter(x=>x.derived).length}</dd></div>
      </div>
      <button className="button" style={{width:"100%",marginBottom:8}} onClick={exportCsv} disabled={!years.length}>Export CSV</button>
      <button className="button" style={{width:"100%"}} onClick={exportMetadata} disabled={!loaded.length}>Export metadata JSON</button>
      <div className="notice">API keys remain server-side. Exported metadata keeps provider codes and retrieval timestamps where available.</div>
    </aside>
  </div>;
}
