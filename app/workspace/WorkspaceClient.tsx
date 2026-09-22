"use client";
import { useMemo, useState } from "react";
import { useCart } from "@/components/AppProvider";
import CountryMultiSelect, { type CountryOption } from "@/components/CountryMultiSelect";
import type { SeriesCatalogItem } from "@/lib/catalog";

type Point={year:number;period:string;value:number};

type Loaded={
  item:SeriesCatalogItem;
  country:CountryOption;
  points:Point[];
  coverage?:{
    start:number;
    end:number;
    startPeriod?:string;
    endPeriod?:string;
    count:number;
  };
  sourceUrl?:string;
  retrievedAt?:string;
  error?:string;
  derived?:boolean;
  formula?:string;
};

const DEFAULT_COUNTRY:CountryOption={
  code:"NGA",
  iso2:"NG",
  name:"Nigeria",
  region:"Sub-Saharan Africa"
};

function csvEscape(v:unknown){
  const s=String(v??"");
  return /[",\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;
}

function seriesKey(series:Loaded){
  return series.country.code+"|"+series.item.id;
}

function valueKey(countryCode:string,itemId:string,period:string){
  return countryCode+"|"+itemId+"|"+period;
}

function LineChart({series}:{series:Loaded|null}){
  if(!series||series.points.length<2) return <div className="workspaceEmpty">Choose a loaded country-series to chart.</div>;

  const pts=series.points;
  const w=900,h=260,pad=28;
  const ys=pts.map(point=>point.value);
  const ymin=Math.min(...ys),ymax=Math.max(...ys);
  const x=(index:number)=>pad+(index/Math.max(1,pts.length-1))*(w-pad*2);
  const y=(value:number)=>h-pad-((value-ymin)/Math.max(.000001,ymax-ymin))*(h-pad*2);
  const path=pts.map((point,index)=>(index?"L":"M")+x(index).toFixed(1)+" "+y(point.value).toFixed(1)).join(" ");

  return <svg viewBox={"0 0 "+w+" "+h} role="img" aria-label={series.country.name+" "+series.item.title+" line chart"}>
    <line x1={pad} y1={h-pad} x2={w-pad} y2={h-pad} stroke="currentColor" opacity=".25"/>
    <line x1={pad} y1={pad} x2={pad} y2={h-pad} stroke="currentColor" opacity=".25"/>
    <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2"/>
    <text x={pad} y={h-7} fontSize="11" fill="currentColor">{pts[0].period}</text>
    <text x={w-pad} y={h-7} textAnchor="end" fontSize="11" fill="currentColor">{pts[pts.length-1].period}</text>
    <text x={pad+4} y={pad+10} fontSize="11" fill="currentColor">{ymax.toFixed(2)}</text>
    <text x={pad+4} y={h-pad-6} fontSize="11" fill="currentColor">{ymin.toFixed(2)}</text>
  </svg>;
}

export default function WorkspaceClient(){
  const cart=useCart();
  const [countries,setCountries]=useState<CountryOption[]>([DEFAULT_COUNTRY]);
  const [start,setStart]=useState(1990);
  const [end,setEnd]=useState(2025);
  const [loaded,setLoaded]=useState<Loaded[]>([]);
  const [busy,setBusy]=useState(false);
  const [active,setActive]=useState("");
  const [view,setView]=useState<"data"|"chart"|"transform"|"metadata">("data");
  const [message,setMessage]=useState("");

  async function retrieve(){
    if(!cart.items.length||!countries.length) return;

    setBusy(true);
    setMessage("");

    const tasks=cart.items.flatMap(item=>{
      const itemCountries=item.geographyMode==="fixed"
        ?[{code:item.geographyCode||item.providerId.toUpperCase(),iso2:"",name:`${item.provider} reference area`,region:"Provider-defined geography"}]
        :countries;
      return itemCountries.map(async country=>{
      try{
        const url=new URL("/api/data",location.origin);
        url.searchParams.set("provider",item.providerId);
        url.searchParams.set("indicator",item.indicator);
        url.searchParams.set("country",country.code);
        url.searchParams.set("start",String(start));
        url.searchParams.set("end",String(end));
        if(item.dataset) url.searchParams.set("dataset",item.dataset);
        if(item.agency) url.searchParams.set("agency",item.agency);
        if(item.datasetVersion) url.searchParams.set("datasetVersion",item.datasetVersion);
        if(item.dimensions) url.searchParams.set("dimensions",JSON.stringify(item.dimensions));

        const response=await fetch(url);
        const data=await response.json();

        if(!response.ok){
          return {item,country,points:[],error:data.error||"Request failed"} as Loaded;
        }

        const points:Point[]=(Array.isArray(data.observations)?data.observations:[]).map((point:any)=>({
          year:Number(point.year),
          period:String(point.period??point.year),
          value:Number(point.value)
        })).filter((point:Point)=>Number.isFinite(point.year)&&Number.isFinite(point.value)&&Boolean(point.period));

        return {
          item,
          country,
          points,
          coverage:data.coverage,
          sourceUrl:data.sourceUrl,
          retrievedAt:data.retrievedAt
        } as Loaded;
      }catch(error){
        return {
          item,
          country,
          points:[],
          error:error instanceof Error?error.message:"Request failed"
        } as Loaded;
      }
      });
    });

    const results=await Promise.all(tasks);
    setLoaded(results);
    const first=results.find(series=>series.points.length);
    setActive(first?seriesKey(first):"");
    setBusy(false);
  }

  const periodsByCountry=useMemo(()=>{
    const map=new Map<string,Set<string>>();
    for(const series of loaded){
      if(!map.has(series.country.code)) map.set(series.country.code,new Set<string>());
      for(const point of series.points) map.get(series.country.code)!.add(point.period);
    }
    return map;
  },[loaded]);

  const tableRows=useMemo(()=>{
    const rows:{country:CountryOption;period:string;year:number}[]=[];
    const rowCountries=new Map(countries.map(country=>[country.code,country]));
    loaded.forEach(series=>rowCountries.set(series.country.code,series.country));
    for(const country of rowCountries.values()){
      const periods=[...(periodsByCountry.get(country.code)||new Set<string>())]
        .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
      for(const period of periods){
        const year=Number((period.match(/(18|19|20|21)\d{2}/)||[])[0]||"");
        rows.push({country,period,year});
      }
    }
    return rows;
  },[countries,loaded,periodsByCountry]);

  const values=useMemo(()=>{
    const map=new Map<string,number>();
    for(const series of loaded){
      for(const point of series.points){
        map.set(valueKey(series.country.code,series.item.id,point.period),point.value);
      }
    }
    return map;
  },[loaded]);

  const displayedItems=useMemo(()=>{
    const map=new Map<string,SeriesCatalogItem>();
    loaded.filter(series=>series.points.length).forEach(series=>map.set(series.item.id,series.item));
    return [...map.values()];
  },[loaded]);

  const activeSeries=loaded.find(series=>seriesKey(series)===active)||null;

  function addTransform(kind:"log"|"growth"|"lag"|"diff"){
    if(!activeSeries||!activeSeries.points.length) return;

    let points:Point[]=[];
    let suffix="";
    let formula="";
    const source=activeSeries.points;

    if(kind==="log"){
      points=source.filter(point=>point.value>0).map(point=>({...point,value:Math.log(point.value)}));
      suffix=" (log)";
      formula="ln(x)";
    }

    if(kind==="growth"){
      points=source.slice(1)
        .filter((point,index)=>source[index].value!==0)
        .map((point,index)=>({...point,value:((point.value-source[index].value)/source[index].value)*100}));
      suffix=" growth";
      formula="((x_t-x_t-1)/x_t-1)*100";
    }

    if(kind==="lag"){
      points=source.slice(1).map((point,index)=>({...point,value:source[index].value}));
      suffix=" lag 1";
      formula="x_t-1";
    }

    if(kind==="diff"){
      points=source.slice(1).map((point,index)=>({...point,value:point.value-source[index].value}));
      suffix=" first difference";
      formula="x_t-x_t-1";
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

    const derived:Loaded={
      item,
      country:activeSeries.country,
      points,
      derived:true,
      formula
    };

    setLoaded(previous=>[
      ...previous.filter(series=>!(series.country.code===derived.country.code&&series.item.id===derived.item.id)),
      derived
    ]);
    setActive(seriesKey(derived));
    setMessage(derived.country.name+" · "+item.title+" created.");
  }

  function exportCsv(){
    if(!displayedItems.length||!tableRows.length) return;

    const rows:string[][]=[["Country","Country code","Period","Year",...displayedItems.map(item=>item.title)]];

    for(const row of tableRows){
      rows.push([
        row.country.name,
        row.country.code,
        row.period,
        Number.isFinite(row.year)?String(row.year):"",
        ...displayedItems.map(item=>{
          const value=values.get(valueKey(row.country.code,item.id,row.period));
          return value===undefined?"":String(value);
        })
      ]);
    }

    const blob=new Blob([rows.map(row=>row.map(csvEscape).join(",")).join("\n")],{type:"text/csv;charset=utf-8"});
    const anchor=document.createElement("a");
    anchor.href=URL.createObjectURL(blob);
    anchor.download="public-data-"+(countries.length===1?countries[0].code:"multi-country")+"-"+start+"-"+end+".csv";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  function exportMetadata(){
    const meta=loaded.map(series=>({
      country:series.country,
      title:series.item.title,
      provider:series.item.provider,
      providerId:series.item.providerId,
      providerDataset:series.item.dataset||null,
      indicator:series.item.indicator,
      unit:series.item.unit,
      frequency:series.item.frequency,
      definition:series.item.description,
      dimensions:series.item.dimensions||{},
      coverage:series.coverage,
      sourceUrl:series.sourceUrl,
      retrievedAt:series.retrievedAt,
      derived:series.derived||false,
      transformations:series.derived&&series.formula?[series.formula]:[],
      formula:series.formula||null
    }));

    const blob=new Blob([JSON.stringify(meta,null,2)],{type:"application/json"});
    const anchor=document.createElement("a");
    anchor.href=URL.createObjectURL(blob);
    anchor.download="metadata.json";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  return <div className="workspace">
    <aside className="workspaceNav">
      {(["data","chart","transform","metadata"] as const).map(value=><button
        data-short={value.slice(0,3).toUpperCase()}
        className={view===value?"active":""}
        onClick={()=>setView(value)}
        key={value}
      >
        {value[0].toUpperCase()+value.slice(1)}
      </button>)}
    </aside>

    <main className="workspaceMain">
      <div className="workspaceTop">
        <div>
          <h1>Research workspace</h1>
          <div className="sectionCopy">
            {countries.length+" countr"+(countries.length===1?"y":"ies")+" · "+cart.items.length+" selected series · "+loaded.filter(series=>series.points.length).length+" loaded country-series"}
          </div>
        </div>

        <div className="workspaceControls workspaceQueryControls">
          <CountryMultiSelect value={countries} onChange={setCountries}/>
          <input className="input yearInput" type="number" value={start} onChange={event=>setStart(Number(event.target.value))} aria-label="Start year"/>
          <input className="input yearInput" type="number" value={end} onChange={event=>setEnd(Number(event.target.value))} aria-label="End year"/>
          <button className="button primary" onClick={retrieve} disabled={busy||!cart.items.length||!countries.length||start>end}>
            {busy?"Retrieving…":"Retrieve data"}
          </button>
        </div>
      </div>

      {message&&<div className="notice">{message}</div>}

      {!cart.items.length&&<div className="workspaceEmpty">
        Your data cart is empty. <a style={{color:"var(--accent)",textDecoration:"underline"}} href="/discover">Discover series first.</a>
      </div>}

      {cart.items.length>0&&!countries.length&&<div className="workspaceEmpty">Select at least one country before retrieving data.</div>}

      {view==="data"&&cart.items.length>0&&countries.length>0&&<>
        {loaded.some(series=>series.error)&&<div className="error">
          {loaded.filter(series=>series.error).map(series=>series.country.name+" · "+series.item.provider+": "+series.error).join(" · ")}
        </div>}

        {!loaded.length
          ?<div className="workspaceEmpty">Select one or more countries and the date range, then retrieve the selected series.</div>
          :<div className="tableScroller">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Period</th>
                  {displayedItems.map(item=><th key={item.id}>{item.title}</th>)}
                </tr>
              </thead>
              <tbody>
                {tableRows.map(row=><tr key={row.country.code+"|"+row.period}>
                  <td>{row.country.name}</td>
                  <td>{row.period}</td>
                  {displayedItems.map(item=><td key={item.id}>
                    {values.get(valueKey(row.country.code,item.id,row.period))?.toLocaleString(undefined,{maximumFractionDigits:4})??""}
                  </td>)}
                </tr>)}
              </tbody>
            </table>
          </div>}
      </>}

      {view==="chart"&&<>
        <div className="workspaceControls" style={{marginBottom:12}}>
          <select className="input" style={{maxWidth:560}} value={active} onChange={event=>setActive(event.target.value)}>
            <option value="">Choose country and series</option>
            {loaded.filter(series=>series.points.length).map(series=><option value={seriesKey(series)} key={seriesKey(series)}>
              {series.country.name+" — "+series.item.title}
            </option>)}
          </select>
        </div>
        <div className="chartBox"><LineChart series={activeSeries}/></div>
      </>}

      {view==="transform"&&<>
        <div className="workspaceControls" style={{marginBottom:12}}>
          <select className="input" style={{maxWidth:560}} value={active} onChange={event=>setActive(event.target.value)}>
            <option value="">Choose country and input series</option>
            {loaded.filter(series=>series.points.length).map(series=><option value={seriesKey(series)} key={seriesKey(series)}>
              {series.country.name+" — "+series.item.title}
            </option>)}
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
          <thead><tr><th>Country</th><th>Variable</th><th>Provider</th><th>Code</th><th>Unit</th><th>Frequency</th><th>Coverage</th></tr></thead>
          <tbody>{loaded.map(series=><tr key={seriesKey(series)}>
            <td>{series.country.name}</td>
            <td>{series.item.title}</td>
            <td>{series.item.provider}</td>
            <td>{series.item.indicator}</td>
            <td>{series.item.unit}</td>
            <td>{series.item.frequency}</td>
            <td>{series.coverage
              ?(series.coverage.startPeriod&&series.coverage.endPeriod
                ?series.coverage.startPeriod+"–"+series.coverage.endPeriod
                :series.coverage.start+"–"+series.coverage.end)
              :series.derived?"Derived":"—"}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </main>

    <aside className="workspaceInspector">
      <h2 style={{fontFamily:"Georgia,serif",fontWeight:500,margin:"0 0 10px"}}>Dataset</h2>
      <div className="sectionCopy">
        {(countries.length?countries.map(country=>country.code).join(", "):"No country selected")+" · "+start+"–"+end}
      </div>

      <div className="metaList">
        <div className="metaRow"><dt>Countries</dt><dd>{countries.length}</dd></div>
        <div className="metaRow"><dt>Series</dt><dd>{cart.items.length}</dd></div>
        <div className="metaRow"><dt>Loaded</dt><dd>{loaded.filter(series=>series.points.length).length}</dd></div>
        <div className="metaRow"><dt>Rows</dt><dd>{tableRows.length}</dd></div>
        <div className="metaRow"><dt>Derived</dt><dd>{loaded.filter(series=>series.derived).length}</dd></div>
      </div>

      <button className="button" style={{width:"100%",marginBottom:8}} onClick={exportCsv} disabled={!tableRows.length}>Export CSV</button>
      <button className="button" style={{width:"100%"}} onClick={exportMetadata} disabled={!loaded.length}>Export metadata JSON</button>

      <div className="notice">Country selection supports multiple economies. API keys remain server-side, and metadata keeps country, provider code, source URL and retrieval time.</div>
    </aside>
  </div>;
}
