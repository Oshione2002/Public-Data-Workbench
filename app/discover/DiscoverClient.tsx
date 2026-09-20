"use client";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/components/AppProvider";
import type { SeriesCatalogItem } from "@/lib/catalog";

export default function DiscoverClient({initialQuery}:{initialQuery:string}){
  const [query,setQuery]=useState(initialQuery);
  const [results,setResults]=useState<SeriesCatalogItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [providers,setProviders]=useState<string[]>([]);
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [cartOpen,setCartOpen]=useState(false);
  const [inspected,setInspected]=useState<SeriesCatalogItem|null>(null);
  const cart=useCart();

  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);
    fetch("/api/catalog?q="+encodeURIComponent(query),{signal:controller.signal})
      .then(r=>r.json())
      .then(data=>setResults(Array.isArray(data.results)?data.results:[]))
      .catch(()=>{})
      .finally(()=>setLoading(false));
    return ()=>controller.abort();
  },[query]);

  const providerNames=useMemo(()=>Array.from(new Set(results.map(x=>x.provider))),[results]);
  const visible=useMemo(()=>results.filter(x=>providers.length===0||providers.includes(x.provider)),[results,providers]);

  function toggleProvider(name:string){
    setProviders(prev=>prev.includes(name)?prev.filter(x=>x!==name):[...prev,name]);
  }

  return <div className="discoverShell">
    <aside className={"filterRail "+(filtersOpen?"open":"")}>
      <button className="button mobileFilterButton" type="button" onClick={()=>setFiltersOpen(v=>!v)}>{filtersOpen?"Hide filters":"Filters"}</button>
      <div className="filterContents">
        <div className="filterGroup">
          <h3>Source</h3>
          {providerNames.length===0?<span className="sectionCopy">No source filters yet.</span>:providerNames.map(name=><label className="check" key={name}><input type="checkbox" checked={providers.includes(name)} onChange={()=>toggleProvider(name)}/>{name}</label>)}
        </div>
        <div className="filterGroup">
          <h3>Frequency</h3>
          <label className="check"><input type="checkbox" defaultChecked/>Annual</label>
          <label className="check"><input type="checkbox" disabled/>Quarterly</label>
          <label className="check"><input type="checkbox" disabled/>Monthly</label>
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
          <div className="sectionCopy">{loading?"Searching catalogue…":visible.length+" matching series"}</div>
        </div>
        <input className="input" style={{maxWidth:360}} aria-label="Search catalogue" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search indicators"/>
      </div>

      {loading?<p className="loading">Loading catalogue…</p>:<div className="resultList">
        {visible.map(item=><article className="resultRow" key={item.id}>
          <div><h3>{item.title}</h3><div className="resultMeta"><span>{item.provider}</span><span>{item.unit}</span><span>{item.frequency}</span><span>{item.indicator}</span></div></div>
          <div className="coverage">{item.normalized?"Live normalized adapter":"Provider console"}</div>
          <div className="resultActions">
            <button className="button compact" type="button" onClick={()=>setInspected(item)}>Details</button>
            <button className={"button compact "+(cart.has(item.id)?"danger":"")} type="button" onClick={()=>cart.toggle(item)}>{cart.has(item.id)?"Remove":"Add"}</button>
          </div>
        </article>)}
        {!visible.length&&<div className="workspaceEmpty">No catalogue match. Try a broader topic such as GDP, inflation, trade, population or unemployment.</div>}
      </div>}
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
          <div className="metaRow"><dt>Retrieval</dt><dd>{inspected.normalized?"Available directly in the workbench":"Use the provider API console"}</dd></div>
        </dl>
        <button className={"button primary "+(cart.has(inspected.id)?"danger":"")} type="button" onClick={()=>cart.toggle(inspected)}>{cart.has(inspected.id)?"Remove series":"Add series"}</button>
      </aside>}
    </div>
  </div>;
}
