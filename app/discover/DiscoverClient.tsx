"use client";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/components/AppProvider";
import type { SeriesCatalogItem } from "@/lib/catalog";

type FrequencyId="annual"|"semiannual"|"quarterly"|"monthly"|"weekly"|"daily"|"hourly";

type ProviderInfo={
  id:string;
  name:string;
  shortName:string;
  description:string;
  protocol:string;
  mode:string;
  docs:string;
  queryable:boolean;
  configured:boolean;
  frequencies:FrequencyId[];
};

type ProviderSearchStatus={
  providerId:string;
  state:"ok"|"skipped"|"error";
  count:number;
  capped?:boolean;
  message?:string;
};

const frequencyOptions:{id:FrequencyId;label:string}[]=[
  {id:"annual",label:"Annual"},
  {id:"semiannual",label:"Semiannual"},
  {id:"quarterly",label:"Quarterly"},
  {id:"monthly",label:"Monthly"},
  {id:"weekly",label:"Weekly"},
  {id:"daily",label:"Daily"},
  {id:"hourly",label:"Hourly"}
];

function inferFrequencies(value:string):FrequencyId[]{
  const v=value.toLowerCase();
  if(!v||v.includes("dataset-defined")||v.includes("provider-defined")||v==="various") return [];
  const out:FrequencyId[]=[];
  const add=(id:FrequencyId)=>{if(!out.includes(id)) out.push(id);};

  if(/\bannual\b|\byearly\b|\byear\b|(^|[^a-z])a([^a-z]|$)/.test(v)) add("annual");
  if(/semi[- ]?annual|half[- ]?year|biannual/.test(v)) add("semiannual");
  if(/\bquarterly\b|\bquarter\b|(^|[^a-z])q([^a-z]|$)/.test(v)) add("quarterly");
  if(/\bmonthly\b|\bmonth\b|(^|[^a-z])m([^a-z]|$)/.test(v)) add("monthly");
  if(/\bweekly\b|\bweek\b|(^|[^a-z])w([^a-z]|$)/.test(v)) add("weekly");
  if(/\bdaily\b|\bday\b|business day|(^|[^a-z])d([^a-z]|$)/.test(v)) add("daily");
  if(/\bhourly\b|\bhour\b|(^|[^a-z])h([^a-z]|$)/.test(v)) add("hourly");

  return out;
}

export default function DiscoverClient({initialQuery}:{initialQuery:string}){
  const [query,setQuery]=useState(initialQuery);
  const [results,setResults]=useState<SeriesCatalogItem[]>([]);
  const [allProviders,setAllProviders]=useState<ProviderInfo[]>([]);
  const [sourceStatus,setSourceStatus]=useState<ProviderSearchStatus[]>([]);
  const [loading,setLoading]=useState(true);
  const [searchQuery,setSearchQuery]=useState(initialQuery);
  const [providerFilters,setProviderFilters]=useState<string[]>([]);
  const [frequencyFilters,setFrequencyFilters]=useState<FrequencyId[]>(["annual"]);
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [cartOpen,setCartOpen]=useState(false);
  const [inspected,setInspected]=useState<SeriesCatalogItem|null>(null);
  const cart=useCart();

  useEffect(()=>{ if(location.hash==="#cart") setCartOpen(true); },[]);

  useEffect(()=>{
    const timer=setTimeout(()=>setSearchQuery(query),650);
    return ()=>clearTimeout(timer);
  },[query]);

  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/providers",{signal:controller.signal})
      .then(r=>r.json())
      .then(data=>setAllProviders(Array.isArray(data.providers)?data.providers:[]))
      .catch(()=>{});
    return ()=>controller.abort();
  },[]);

  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);

    const params=new URLSearchParams();
    if(searchQuery.trim()) params.set("q",searchQuery.trim());
    if(providerFilters.length) params.set("providers",providerFilters.join(","));

    fetch("/api/catalog?"+params.toString(),{signal:controller.signal})
      .then(r=>r.json())
      .then(data=>{
        setResults(Array.isArray(data.results)?data.results:[]);
        setSourceStatus(Array.isArray(data.sourceStatus)?data.sourceStatus:[]);
      })
      .catch(()=>{})
      .finally(()=>setLoading(false));

    return ()=>controller.abort();
  },[searchQuery,providerFilters]);

  const providerMap=useMemo(()=>{
    const map=new Map<string,ProviderInfo>();
    allProviders.forEach(p=>map.set(p.id,p));
    return map;
  },[allProviders]);

  function itemMatchesFrequency(item:SeriesCatalogItem,frequency:FrequencyId){
    const known=inferFrequencies(item.frequency);
    if(known.length) return known.includes(frequency);
    return providerMap.get(item.providerId)?.frequencies?.includes(frequency)??false;
  }

  const visible=useMemo(()=>{
    if(frequencyFilters.length===0) return results;
    return results.filter(item=>frequencyFilters.some(frequency=>itemMatchesFrequency(item,frequency)));
  },[results,frequencyFilters,providerMap]);

  const resultCounts=useMemo(()=>{
    const counts=new Map<string,number>();
    visible.forEach(item=>counts.set(item.providerId,(counts.get(item.providerId)||0)+1));
    return counts;
  },[visible]);

  const statusMap=useMemo(()=>{
    const map=new Map<string,ProviderSearchStatus>();
    sourceStatus.forEach(status=>map.set(status.providerId,status));
    return map;
  },[sourceStatus]);

  const selectedProviderCards=useMemo(()=>{
    if(providerFilters.length===0) return [];
    return providerFilters
      .map(id=>providerMap.get(id))
      .filter((p):p is ProviderInfo=>Boolean(p));
  },[providerFilters,providerMap]);

  const activeProviderSet=useMemo(()=>{
    if(providerFilters.length===0) return allProviders;
    return providerFilters.map(id=>providerMap.get(id)).filter((p):p is ProviderInfo=>Boolean(p));
  },[providerFilters,providerMap,allProviders]);

  const availableFrequencies=useMemo(()=>{
    const set=new Set<FrequencyId>();
    activeProviderSet.forEach(provider=>(provider.frequencies||[]).forEach(f=>set.add(f)));
    return set;
  },[activeProviderSet]);

  const frequencyCounts=useMemo(()=>{
    const counts=new Map<FrequencyId,number>();
    for(const option of frequencyOptions){
      counts.set(option.id,results.filter(item=>itemMatchesFrequency(item,option.id)).length);
    }
    return counts;
  },[results,providerMap]);

  function toggleProvider(id:string){
    setProviderFilters(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  }

  function toggleFrequency(id:FrequencyId){
    setFrequencyFilters(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  }

  function providerStatus(p:ProviderInfo){
    if(p.mode==="keyed") return p.configured?"API key configured":"API key required";
    if(p.queryable) return "API registered";
    return "Portal / bulk source";
  }

  function providerBadge(provider:ProviderInfo){
    if(searchQuery.trim()){
      if(loading) return "…";
      const status=statusMap.get(provider.id);
      if(status?.state==="error") return "!";
      if(status?.state==="skipped") return "—";
      const count=resultCounts.get(provider.id)||0;
      return status?.capped?count+"+":String(count);
    }
    if(providerFilters.includes(provider.id)) return String(resultCounts.get(provider.id)||0);
    return provider.mode==="keyed"?(provider.configured?"Ready":"Key"):provider.queryable?"API":"Bulk";
  }

  function providerBadgeTitle(provider:ProviderInfo){
    if(!searchQuery.trim()) return providerStatus(provider);
    const status=statusMap.get(provider.id);
    if(status?.state==="error") return status.message||"Provider search failed";
    if(status?.state==="skipped") return status.message||"Provider catalogue is not searchable yet";
    const count=resultCounts.get(provider.id)||0;
    return (status?.capped?"At least ":"")+count+" matching result"+(count===1?"":"s")+" after the active frequency filter";
  }

  return <div className="discoverShell">
    <aside className={"filterRail "+(filtersOpen?"open":"")}>
      <button className="button mobileFilterButton" type="button" onClick={()=>setFiltersOpen(v=>!v)}>{filtersOpen?"Hide filters":"Filters"}</button>

      <div className="filterContents">
        <div className="filterGroup">
          <div className="filterGroupHead">
            <h3>Source</h3>
            {providerFilters.length>0&&<button className="filterClear" type="button" onClick={()=>setProviderFilters([])}>Clear</button>}
          </div>

          <div className="sourceFilterList">
            {allProviders.length===0
              ? <span className="sectionCopy">Loading sources…</span>
              : allProviders.map(provider=>
                <label className="check sourceCheck" key={provider.id}>
                  <input
                    type="checkbox"
                    checked={providerFilters.includes(provider.id)}
                    onChange={()=>toggleProvider(provider.id)}
                  />
                  <span>{provider.shortName}</span>
                  <small className={searchQuery.trim()?"countBadge":""} title={providerBadgeTitle(provider)}>
                    {providerBadge(provider)}
                  </small>
                </label>
              )}
          </div>
        </div>

        <div className="filterGroup">
          <div className="filterGroupHead">
            <h3>Frequency</h3>
            {frequencyFilters.length>0&&<button className="filterClear" type="button" onClick={()=>setFrequencyFilters([])}>All</button>}
          </div>

          <div className="frequencyFilterList">
            {frequencyOptions.map(option=>{
              const supported=availableFrequencies.has(option.id);
              const count=frequencyCounts.get(option.id)||0;
              return <label className={"check frequencyCheck "+(!supported?"unsupported":"")} key={option.id}>
                <input
                  type="checkbox"
                  checked={frequencyFilters.includes(option.id)}
                  disabled={!supported}
                  onChange={()=>toggleFrequency(option.id)}
                />
                <span>{option.label}</span>
                <small>{searchQuery.trim()?String(count):supported?"":"—"}</small>
              </label>;
            })}
          </div>

          <p className="filterHint">
            Multiple frequencies can be selected. With no frequency selected, all supported frequencies are shown.
          </p>
        </div>

        <div>
          <h3>Selected</h3>
          <p className="sectionCopy">{cart.items.length} series in the data cart.</p>
          <button className="button" type="button" onClick={()=>setCartOpen(true)}>Open data cart</button>
        </div>
      </div>
    </aside>

    <main className="discoverMain">
      <div className="discoverToolbar">
        <div>
          <h1>{query||"Browse indicators"}</h1>
          <div className="sectionCopy">
            {loading
              ?"Searching catalogue…"
              :providerFilters.length
                ?visible.length+" matching result"+(visible.length===1?"":"s")+" from "+providerFilters.length+" selected source"+(providerFilters.length===1?"":"s")
                :visible.length+" matching result"+(visible.length===1?"":"s")+" · "+allProviders.length+" data sources registered"}
          </div>
        </div>

        <input
          className="input"
          style={{maxWidth:360}}
          aria-label="Search catalogue"
          value={query}
          onChange={e=>setQuery(e.target.value)}
          placeholder="Search indicators"
        />
      </div>

      {selectedProviderCards.length>0&&
        <section className="providerSelection">
          {selectedProviderCards.map(provider=>
            <article className="providerSelectionCard" key={provider.id}>
              <div>
                <strong>{provider.shortName}</strong>
                <span>{provider.description}</span>
              </div>
              <div className="providerSelectionMeta">
                <span>
                  {statusMap.get(provider.id)?.state==="error"
                    ?"Search unavailable"
                    :(resultCounts.get(provider.id)||0)+" result"+((resultCounts.get(provider.id)||0)===1?"":"s")}
                </span>
                <a className="button compact" href={"/sources#"+provider.id}>Source details</a>
              </div>
            </article>
          )}
        </section>
      }

      {loading
        ? <p className="loading">Loading catalogue…</p>
        : <div className="resultList">
            {visible.map(item=>
              <article className="resultRow" key={item.id}>
                <div>
                  <h3>{item.title}</h3>
                  <div className="resultMeta">
                    <span>{item.provider}</span>
                    <span>{item.unit}</span>
                    <span>{item.frequency}</span>
                    <span>{item.indicator}</span>
                  </div>
                </div>

                <div className="coverage">
                  {item.resultType==="dataset"
                    ?"Dataset catalogue"
                    :item.normalized?"Live normalized adapter":"Live provider catalogue"}
                </div>

                <div className="resultActions">
                  <button className="button compact" type="button" onClick={()=>setInspected(item)}>Details</button>
                  {item.selectable===false
                    ? <a className="button compact" href={"/sources#"+item.providerId}>Source</a>
                    : <button
                        className={"button compact "+(cart.has(item.id)?"danger":"")}
                        type="button"
                        onClick={()=>cart.toggle(item)}
                      >
                        {cart.has(item.id)?"Remove":"Add"}
                      </button>}
                </div>
              </article>
            )}

            {!visible.length&&
              <div className="workspaceEmpty">
                {frequencyFilters.length
                  ?"No result matches the selected source and frequency combination. Try another frequency or choose All."
                  :providerFilters.length
                    ?"No indexed indicator is available for the selected source yet. The source is registered and can still be inspected from Source details while its indicator catalogue is being normalized."
                    :"No catalogue match. Try a broader topic such as GDP, inflation, trade, population or unemployment."}
              </div>
            }
          </div>
      }
    </main>

    <button className="button primary" style={{position:"fixed",right:18,bottom:18,zIndex:60}} type="button" onClick={()=>setCartOpen(v=>!v)}>{cart.items.length} selected</button>

    <section className={"cartPanel "+(cartOpen?"open":"")} id="cart" aria-label="Data cart">
      <div className="cartHeader"><strong>Selected series</strong><button className="button compact" onClick={()=>setCartOpen(false)}>Close</button></div>
      <div className="cartItems">
        {cart.items.map(item=><div className="cartItem" key={item.id}><div><strong>{item.title}</strong><small>{item.provider}</small></div><button className="button compact danger" onClick={()=>cart.remove(item.id)}>Remove</button></div>)}
        {!cart.items.length&&<p className="sectionCopy">No series selected.</p>}
      </div>
      <div className="cartFooter"><button className="button" onClick={cart.clear} disabled={!cart.items.length}>Clear</button><a className={"button primary "+(!cart.items.length?"disabledLink":"")} href="/workspace">Build dataset</a></div>
    </section>

    <div className={"inspectorBackdrop "+(inspected?"open":"")} onClick={e=>{if(e.currentTarget===e.target)setInspected(null)}}>
      {inspected&&<aside className="inspector">
        <button className="button compact" style={{float:"right"}} onClick={()=>setInspected(null)}>Close</button>
        <div className="sectionCopy">{inspected.provider}</div>
        <h2>{inspected.title}</h2>
        <div className="badge">{inspected.indicator}</div>
        <dl className="metaList">
          <div className="metaRow"><dt>Definition</dt><dd>{inspected.description}</dd></div>
          <div className="metaRow"><dt>Unit</dt><dd>{inspected.unit}</dd></div>
          <div className="metaRow"><dt>Frequency</dt><dd>{inspected.frequency}</dd></div>
          <div className="metaRow"><dt>Concept</dt><dd>{inspected.concept}</dd></div>
          <div className="metaRow"><dt>Type</dt><dd>{inspected.resultType==="dataset"?"Dataset / dataflow":"Statistical series"}</dd></div>
          <div className="metaRow"><dt>Retrieval</dt><dd>{inspected.normalized?"Available directly in the workbench":"Searchable provider metadata; workspace normalization is still required for this result."}</dd></div>
        </dl>
        {inspected.selectable===false
          ? <a className="button primary" href={"/sources#"+inspected.providerId}>Open source details</a>
          : <button className={"button primary "+(cart.has(inspected.id)?"danger":"")} type="button" onClick={()=>cart.toggle(inspected)}>{cart.has(inspected.id)?"Remove series":"Add series"}</button>}
      </aside>}
    </div>
  </div>;
}
