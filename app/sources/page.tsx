import type { Metadata } from "next";
import { isConfigured, providers } from "@/lib/providers";
import SourceConsole from "./SourceConsole";

export const metadata:Metadata={title:"Sources"};

export default function SourcesPage(){
  return <main className="page">
    <section style={{paddingTop:28}}>
      <h1 className="pageTitle">Data sources</h1>
      <p className="sectionCopy">The registry separates live public endpoints, keyed APIs, and portals or bulk-download systems. A source is not presented as live when the workbench cannot verify a base endpoint.</p>
    </section>

    <div className="sourcesLayout">
      <aside className="sourceIndex">
        <strong>Sources</strong>
        {providers.map(p=><a href={"#"+p.id} key={p.id}>{p.shortName}</a>)}
      </aside>
      <section className="sourceList">
        {providers.map(p=>{
          const configured=isConfigured(p);
          const state=p.mode==="live"?"Live public API":p.mode==="keyed"?(configured?"API key configured":"API key required"):"Portal / bulk integration";
          const dot=p.mode==="live"?"":p.mode==="keyed"?"keyed":"portal";
          return <article className="sourceEntry" id={p.id} key={p.id}>
            <div><h3>{p.name}</h3><span className="badge">{p.protocol.toUpperCase()}</span></div>
            <p>{p.description}</p>
            <div className="statusLine"><span className={"statusDot "+dot}/>{state}<br/><a href={p.docs} target="_blank" rel="noreferrer">Official documentation ↗</a></div>
          </article>;
        })}
      </section>
    </div>

    <SourceConsole/>
  </main>;
}
