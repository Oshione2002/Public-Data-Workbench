import Link from "next/link";

export default function Home(){
  return <main className="page">
    <section className="hero">
      <h1>Find a series. Check what it means. Build a dataset you can defend.</h1>
      <p>Search public economic, labour, education, health, trade and development databases from one place. Compare coverage before you download, and keep the source attached to every series.</p>
    </section>

    <section className="heroSearch">
      <form className="searchForm" action="/discover">
        <input name="q" aria-label="Search public data" placeholder="Search a topic, indicator, country or dataset" defaultValue="Nigeria inflation and unemployment"/>
        <button type="submit">Search data</button>
      </form>
      <div className="searchExamples">Examples: youth unemployment · remittance inflows · real GDP growth · female school completion · merchandise exports</div>
    </section>

    <section className="section">
      <div className="sectionHeader"><div><h2>Major sources are registered in one place</h2><div className="sectionCopy">Public APIs are queried server-side. Keyed services can be enabled with environment variables without exposing credentials in the browser.</div></div><Link className="button" href="/sources">View source registry</Link></div>
      <div className="sourceGrid">
        {[
          ["IMF","Macroeconomic, fiscal and external-sector statistics"],
          ["World Bank","Development indicators and cross-country series"],
          ["ILO","Employment, wages and labour-force statistics"],
          ["UNESCO","Education, science and culture statistics"],
          ["FAO","Agriculture, food, land and food-security statistics"],
          ["WTO","Trade flows, tariffs and trade-policy statistics"]
        ].map(([name,desc])=><Link key={name} className="sourceCell" href="/sources"><strong>{name}</strong><span>{desc}</span></Link>)}
      </div>
    </section>

    <section className="section">
      <div className="sectionHeader"><div><h2>The interface changes with the task</h2></div><div className="sectionCopy">Search behaves like a catalogue. Reconciliation behaves like a comparison tool. Once a dataset exists, the workbench becomes dense and table-first.</div></div>
      <div className="processList">
        <div className="processRow"><h3>Discover</h3><p>Search a unified catalogue and compare definitions, frequency, units and provider before selecting a series.</p></div>
        <div className="processRow"><h3>Resolve</h3><p>When one source is incomplete, compare alternative series and overlap before constructing a composite.</p></div>
        <div className="processRow"><h3>Retrieve</h3><p>Server routes call the provider APIs, normalize supported series and keep the original source URL.</p></div>
        <div className="processRow"><h3>Prepare</h3><p>Merge by year, create derived variables and preserve a transformation log.</p></div>
        <div className="processRow"><h3>Export</h3><p>Download data with the metadata needed to explain where each variable came from.</p></div>
      </div>
    </section>

    <section className="section">
      <div className="sectionHeader"><div><h2>Start with a real query</h2><div className="sectionCopy">The current normalized adapters cover core World Bank and IMF series. The source registry also exposes verified provider API bases through a controlled server proxy.</div></div><Link className="button primary" href="/discover?q=inflation">Open Discover</Link></div>
    </section>
  </main>;
}
