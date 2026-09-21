import { searchCatalog, type SeriesCatalogItem } from "@/lib/catalog";
import { getProvider, providers, type ProviderFrequency } from "@/lib/providers";

export type ProviderSearchStatus={
  providerId:string;
  state:"ok"|"skipped"|"error";
  count:number;
  capped?:boolean;
  message?:string;
  partial?:boolean;
  frequencyCounts?:Partial<Record<ProviderFrequency,number>>;
  frequencyCapped?:Partial<Record<ProviderFrequency,boolean>>;
};

type SearchResponse={
  results:SeriesCatalogItem[];
  status:ProviderSearchStatus[];
};

type SearchOutcome={
  items:SeriesCatalogItem[];
  total:number;
  frequencyCounts?:Partial<Record<ProviderFrequency,number>>;
  frequencyCapped?:Partial<Record<ProviderFrequency,boolean>>;
};

const MAX_PER_SOURCE=20;
const BADGE_CAP=1000;

function text(value:unknown){
  return typeof value==="string"?value.trim():"";
}

function objectName(obj:any){
  if(!obj||typeof obj!=="object") return "";
  const direct=[
    obj.title,obj.name,obj.description,obj.label,obj.indicatorName,obj.indicator_description,
    obj.indicatorDescription,obj.seriesName,obj.series_name,obj.alias
  ].map(text).find(Boolean);
  if(direct) return direct;
  if(obj.names&&typeof obj.names==="object") return text(obj.names.en)||text(obj.names.EN)||text(Object.values(obj.names)[0]);
  if(obj.name&&typeof obj.name==="object") return text(obj.name.en)||text(obj.name.EN)||text(Object.values(obj.name)[0]);
  return "";
}

function objectCode(obj:any){
  if(!obj||typeof obj!=="object") return "";
  return [
    obj.code,obj.id,obj.shortName,obj.indicatorCode,obj.indicator_code,obj.seriesCode,obj.series_code,
    obj.key,obj.value
  ].map(v=>typeof v==="number"?String(v):text(v)).find(Boolean)||"";
}

function unitFromDescription(description:string){
  const match=description.match(/\(([^()]{1,45})\)\s*$/);
  return match?match[1]:"See provider metadata";
}

function wtoFrequency(code:string,raw:string){
  if(/_A_/i.test(code)) return "Annual";
  if(/_Q_/i.test(code)) return "Quarterly";
  if(/_M_/i.test(code)) return "Monthly";
  return raw||"Provider-defined";
}

function matchesQuery(q:string,...values:string[]){
  const term=q.trim().toLowerCase();
  if(!term) return true;
  const tokens=term.split(/\s+/).filter(Boolean);
  const hay=values.join(" ").toLowerCase();
  return tokens.every(token=>hay.includes(token));
}

function dedupe(items:SeriesCatalogItem[]){
  const seen=new Set<string>();
  return items.filter(item=>{
    const key=item.providerId+"|"+item.indicator+"|"+item.title;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function flattenObjects(value:unknown,out:any[]=[],depth=0){
  if(depth>8||out.length>30000||value===null||value===undefined) return out;
  if(Array.isArray(value)){
    for(const item of value){
      if(item&&typeof item==="object"&&!Array.isArray(item)) out.push(item);
      flattenObjects(item,out,depth+1);
      if(out.length>30000) break;
    }
  }else if(typeof value==="object"){
    for(const child of Object.values(value as Record<string,unknown>)){
      flattenObjects(child,out,depth+1);
      if(out.length>30000) break;
    }
  }
  return out;
}

function statusCount(total:number){
  return {count:Math.min(total,BADGE_CAP),capped:total>BADGE_CAP};
}

function frequencyIds(value:string):ProviderFrequency[]{
  const v=value.toLowerCase();
  const out:ProviderFrequency[]=[];
  const add=(id:ProviderFrequency)=>{ if(!out.includes(id)) out.push(id); };

  if(/\bannual\b|\byearly\b|\byear\b|(^|[^a-z])a([^a-z]|$)/.test(v)) add("annual");
  if(/semi[- ]?annual|half[- ]?year|biannual/.test(v)) add("semiannual");
  if(/\bquarterly\b|\bquarter\b|(^|[^a-z])q([^a-z]|$)/.test(v)) add("quarterly");
  if(/\bmonthly\b|\bmonth\b|(^|[^a-z])m([^a-z]|$)/.test(v)) add("monthly");
  if(/\bweekly\b|\bweek\b|(^|[^a-z])w([^a-z]|$)/.test(v)) add("weekly");
  if(/\bdaily\b|\bday\b|business day|(^|[^a-z])d([^a-z]|$)/.test(v)) add("daily");
  if(/\bhourly\b|\bhour\b|(^|[^a-z])h([^a-z]|$)/.test(v)) add("hourly");

  return out;
}

function incrementFrequency(
  counts:Partial<Record<ProviderFrequency,number>>,
  frequency:string,
  amount=1
){
  for(const id of frequencyIds(frequency)){
    counts[id]=(counts[id]||0)+amount;
  }
}

function countsFromItems(items:SeriesCatalogItem[]){
  const counts:Partial<Record<ProviderFrequency,number>>={};
  for(const item of items) incrementFrequency(counts,item.frequency);
  return counts;
}

function capFrequencyCounts(counts:Partial<Record<ProviderFrequency,number>>){
  const capped:Partial<Record<ProviderFrequency,boolean>>={};
  const normalized:Partial<Record<ProviderFrequency,number>>={};

  for(const [key,value] of Object.entries(counts) as [ProviderFrequency,number][]){
    normalized[key]=Math.min(value,BADGE_CAP);
    if(value>BADGE_CAP) capped[key]=true;
  }

  return {frequencyCounts:normalized,frequencyCapped:capped};
}

async function worldBank(q:string):Promise<SearchOutcome>{
  const url=new URL("https://api.worldbank.org/v2/indicator");
  url.searchParams.set("format","json");
  url.searchParams.set("source","2");
  url.searchParams.set("per_page","20000");

  const res=await fetch(url,{
    next:{revalidate:86400},
    signal:AbortSignal.timeout(18000)
  });
  if(!res.ok) throw new Error("HTTP "+res.status);

  const payload:any=await res.json();
  const rows=Array.isArray(payload)&&Array.isArray(payload[1])?payload[1]:[];

  const matched=rows.filter((row:any)=>{
    const code=text(row?.id);
    const name=text(row?.name);
    const note=text(row?.sourceNote);
    const topics=Array.isArray(row?.topics)?row.topics.map((topic:any)=>text(topic?.value)).join(" "):"";
    return code&&name&&matchesQuery(q,code,name,note,topics);
  });

  const items=matched.slice(0,MAX_PER_SOURCE).map((row:any)=>({
    id:"wb-"+text(row.id),
    concept:"world-bank-indicator",
    title:text(row.name)||text(row.id),
    provider:"World Bank",
    providerId:"world-bank",
    indicator:text(row.id),
    unit:text(row.unit)||unitFromDescription(text(row.name)),
    frequency:"Annual",
    description:text(row.sourceNote)||text(row.name),
    normalized:true,
    resultType:"series",
    selectable:true,
    sourceUrl:"https://data.worldbank.org/indicator/"+encodeURIComponent(text(row.id))
  } satisfies SeriesCatalogItem));

  return {
    items,
    total:matched.length,
    ...capFrequencyCounts({annual:matched.length})
  };
}

async function fred(q:string):Promise<SearchOutcome>{
  const key=process.env.FRED_API_KEY;
  if(!key) return {items:[],total:0};

  const url=new URL("https://api.stlouisfed.org/fred/series/search");
  url.searchParams.set("api_key",key);
  url.searchParams.set("file_type","json");
  url.searchParams.set("search_text",q.trim()||"economic");
  url.searchParams.set("limit",String(MAX_PER_SOURCE));
  url.searchParams.set("order_by","search_rank");

  const res=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(9000)});
  if(!res.ok) throw new Error("HTTP "+res.status);

  const payload:any=await res.json();
  const rows=Array.isArray(payload?.seriess)?payload.seriess:[];
  const items=rows.slice(0,MAX_PER_SOURCE).map((row:any)=>({
    id:"fred-"+text(row.id),
    concept:"fred-series",
    title:text(row.title)||text(row.id),
    provider:"FRED",
    providerId:"fred",
    indicator:text(row.id),
    unit:text(row.units)||"See FRED metadata",
    frequency:text(row.frequency)||"Various",
    description:text(row.notes)||text(row.title),
    normalized:true,
    resultType:"series",
    selectable:true,
    sourceUrl:"https://fred.stlouisfed.org/series/"+encodeURIComponent(text(row.id))
  } satisfies SeriesCatalogItem));

  const total=Number(payload?.count);
  const frequencyCounts=countsFromItems(rows.map((row:any)=>({
    id:"",
    concept:"",
    title:"",
    provider:"",
    providerId:"",
    indicator:"",
    unit:"",
    frequency:text(row.frequency)||"Various",
    description:"",
    normalized:false
  } as SeriesCatalogItem)));
  return {
    items,
    total:Number.isFinite(total)?total:rows.length,
    ...capFrequencyCounts(frequencyCounts)
  };
}

async function sdg(q:string):Promise<SearchOutcome>{
  const res=await fetch("https://unstats.un.org/SDGAPI/v1/sdg/Series/List",{
    next:{revalidate:21600},
    signal:AbortSignal.timeout(9000)
  });
  if(!res.ok) throw new Error("HTTP "+res.status);

  const payload:any=await res.json();
  const rows=Array.isArray(payload)?payload:flattenObjects(payload);
  const matched=rows.filter((row:any)=>{
    const code=objectCode(row);
    const name=objectName(row);
    return code&&name&&matchesQuery(q,code,name,JSON.stringify(row?.indicator||""));
  });

  const items=matched.slice(0,MAX_PER_SOURCE).map((row:any)=>{
    const title=objectName(row);
    const code=objectCode(row);
    return {
      id:"sdg-"+code,
      concept:"sdg-series",
      title,
      provider:"UN SDG",
      providerId:"sdg",
      indicator:code,
      unit:unitFromDescription(title),
      frequency:"Annual",
      description:title,
      normalized:true,
      resultType:"series",
      selectable:true,
      sourceUrl:"https://unstats.un.org/SDGAPI/v1/sdg/Series/"+encodeURIComponent(code)
    } satisfies SeriesCatalogItem;
  });

  return {items,total:matched.length,...capFrequencyCounts({annual:matched.length})};
}

async function unPopulation(q:string):Promise<SearchOutcome>{
  const token=process.env.UN_POPULATION_TOKEN;
  if(!token) return {items:[],total:0};

  const url=new URL("https://population.un.org/dataportalapi/api/v1/Indicators");
  url.searchParams.set("pageSize","1000");

  const res=await fetch(url,{
    headers:{Authorization:"Bearer "+token,Accept:"application/json"},
    cache:"no-store",
    signal:AbortSignal.timeout(9000)
  });
  if(!res.ok) throw new Error("HTTP "+res.status);

  const payload:any=await res.json();
  const rows=flattenObjects(payload);
  const matched=rows.filter((row:any)=>{
    const code=objectCode(row);
    const name=objectName(row);
    return code&&name&&matchesQuery(q,code,name,text(row?.description));
  });

  const items=matched.slice(0,MAX_PER_SOURCE).map((row:any)=>{
    const code=objectCode(row);
    const title=objectName(row);
    return {
      id:"un-pop-"+code,
      concept:"population-indicator",
      title,
      provider:"UN Population",
      providerId:"un-population",
      indicator:code,
      unit:text(row.unit)||text(row.units)||"See provider metadata",
      frequency:"Annual / provider-defined",
      description:text(row.description)||title,
      normalized:false,
      resultType:"series",
      selectable:false,
      sourceUrl:"https://population.un.org/dataportal/"
    } satisfies SeriesCatalogItem;
  });

  return {items,total:matched.length,...capFrequencyCounts({annual:matched.length})};
}

async function wto(q:string):Promise<SearchOutcome>{
  const key=process.env.WTO_API_KEY;
  if(!key) return {items:[],total:0};

  const res=await fetch("https://api.wto.org/timeseries/v1/indicators?lang=1",{
    headers:{Accept:"application/json","Ocp-Apim-Subscription-Key":key},
    cache:"no-store",
    signal:AbortSignal.timeout(9000)
  });
  if(!res.ok) throw new Error("HTTP "+res.status);

  const payload:any=await res.json();
  const rows=flattenObjects(payload);
  const matched=rows.filter((row:any)=>{
    const code=objectCode(row);
    const name=objectName(row);
    return code&&name&&matchesQuery(q,code,name,text(row?.description));
  });

  const items=matched.slice(0,MAX_PER_SOURCE).map((row:any)=>{
    const code=objectCode(row);
    const title=objectName(row);
    return {
      id:"wto-"+code,
      concept:"trade-indicator",
      title,
      provider:"WTO",
      providerId:"wto",
      indicator:code,
      unit:text(row.unit)||text(row.units)||"See WTO metadata",
      frequency:wtoFrequency(code,text(row.frequency)),
      description:text(row.description)||title,
      normalized:true,
      resultType:"series",
      selectable:true,
      sourceUrl:"https://stats.wto.org/"
    } satisfies SeriesCatalogItem;
  });

  const frequencyCounts:Partial<Record<ProviderFrequency,number>>={};
  for(const row of matched){
    const code=objectCode(row);
    incrementFrequency(frequencyCounts,wtoFrequency(code,text(row.frequency)));
  }

  return {items,total:matched.length,...capFrequencyCounts(frequencyCounts)};
}

const unhcrSeries=[
  ["refugees","Refugees","People"],
  ["asylum_seekers","Asylum-seekers","People"],
  ["idps","Internally displaced persons","People"],
  ["oip","Other people in need of international protection","People"],
  ["stateless","Stateless persons","People"],
  ["ooc","Other people of concern","People"]
] as const;

async function unhcr(q:string):Promise<SearchOutcome>{
  const matched=unhcrSeries.filter(([code,title])=>matchesQuery(q,code,title,"displacement refugee asylum stateless population"));
  const items=matched.slice(0,MAX_PER_SOURCE).map(([code,title,unit])=>({
    id:"unhcr-"+code,
    concept:"forced-displacement",
    title,
    provider:"UNHCR",
    providerId:"unhcr",
    indicator:code,
    unit,
    frequency:"Annual",
    description:"UNHCR Refugee Population Statistics: "+title.toLowerCase()+".",
    normalized:true,
    resultType:"series",
    selectable:true,
    sourceUrl:"https://api.unhcr.org/docs/refugee-statistics.html"
  } satisfies SeriesCatalogItem));

  return {items,total:matched.length,...capFrequencyCounts({annual:matched.length})};
}

function decodeXml(value:string){
  return value
    .replace(/&amp;/g,"&")
    .replace(/&lt;/g,"<")
    .replace(/&gt;/g,">")
    .replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'");
}

function dataflowsFromXml(xml:string){
  const result:{id:string;name:string;agency:string}[]=[];
  const regex=/<(?:\w+:)?Dataflow\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Dataflow>/gi;
  let match:RegExpExecArray|null;

  while((match=regex.exec(xml))&&result.length<15000){
    const attrs=match[1];
    const body=match[2];
    const id=(attrs.match(/\bid="([^"]+)"/i)||[])[1]||"";
    const agency=(attrs.match(/\bagencyID="([^"]+)"/i)||[])[1]||"";
    const names=[...body.matchAll(/<(?:\w+:)?Name\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Name>/gi)]
      .map(x=>decodeXml(x[1].replace(/<[^>]+>/g,"").trim()));
    const name=names.find(Boolean)||id;
    if(id) result.push({id,name,agency});
  }

  return result;
}

function dataflowsFromJson(payload:any){
  const rows=flattenObjects(payload);
  const out:{id:string;name:string;agency:string}[]=[];

  for(const row of rows){
    const id=objectCode(row);
    const name=objectName(row);
    const agency=text(row.agencyID)||text(row.agencyId)||text(row.agency);
    const looksLikeFlow=Boolean(id&&name&&(agency||row.structure||row.version||row.isFinal!==undefined));
    if(looksLikeFlow) out.push({id,name,agency});
    if(out.length>=15000) break;
  }

  return out;
}

type SdmxConfig={id:string;name:string;url:string;docs:string};

const sdmxProviders:SdmxConfig[]=[
  {id:"ilo",name:"ILO",url:"https://sdmx.ilo.org/rest/dataflow/all/all/latest?detail=allstubs&references=none",docs:"https://sdmx.ilo.org/"},
  {id:"oecd",name:"OECD",url:"https://sdmx.oecd.org/public/rest/dataflow/all?detail=allstubs&references=none",docs:"https://data-explorer.oecd.org/"},
  {id:"unicef",name:"UNICEF",url:"https://sdmx.data.unicef.org/ws/public/sdmxapi/rest/dataflow/all/all/latest/?format=sdmx-json&detail=allstubs&references=none",docs:"https://sdmx.data.unicef.org/"},
  {id:"ecb",name:"ECB",url:"https://data-api.ecb.europa.eu/service/dataflow/all/all/latest?detail=allstubs&references=none",docs:"https://data.ecb.europa.eu/"},
  {id:"bis",name:"BIS",url:"https://stats.bis.org/api/v2/structure/dataflow/all/all/latest?detail=allstubs&references=none",docs:"https://stats.bis.org/"},
  {id:"eurostat",name:"Eurostat",url:"https://ec.europa.eu/eurostat/api/dissemination/sdmx/3.0/structure/dataflow/ESTAT/*?detail=allstubs&references=none&compress=false",docs:"https://ec.europa.eu/eurostat/"}
];

async function sdmxDataflows(config:SdmxConfig,q:string):Promise<SearchOutcome>{
  const res=await fetch(config.url,{
    headers:{Accept:"application/vnd.sdmx.structure+json;version=2.0, application/json;q=0.9, application/xml;q=0.8, text/xml;q=0.8"},
    next:{revalidate:86400},
    signal:AbortSignal.timeout(18000)
  });
  if(!res.ok) throw new Error("HTTP "+res.status);

  const raw=await res.text();
  const contentType=res.headers.get("content-type")||"";
  let flows:{id:string;name:string;agency:string}[]=[];

  if(contentType.includes("json")||raw.trim().startsWith("{")||raw.trim().startsWith("[")){
    try{ flows=dataflowsFromJson(JSON.parse(raw)); }catch{ flows=[]; }
  }
  if(!flows.length) flows=dataflowsFromXml(raw);

  const seen=new Set<string>();
  const matched=flows.filter(flow=>{
    if(seen.has(flow.id)) return false;
    seen.add(flow.id);
    return matchesQuery(q,flow.id,flow.name,flow.agency);
  });

  const items=matched.slice(0,MAX_PER_SOURCE).map(flow=>({
    id:config.id+"-dataset-"+flow.id,
    concept:"provider-dataset",
    title:flow.name,
    provider:config.name,
    providerId:config.id,
    indicator:flow.id,
    unit:"Dataset dimensions vary",
    frequency:"Dataset-defined",
    description:"Dataflow / dataset exposed through the "+config.name+" statistical API.",
    normalized:false,
    resultType:"dataset",
    selectable:false,
    sourceUrl:config.docs
  } satisfies SeriesCatalogItem));

  return {items,total:matched.length};
}

async function eia(q:string):Promise<SearchOutcome>{
  const key=process.env.EIA_API_KEY;
  if(!key) return {items:[],total:0};

  const url=new URL("https://api.eia.gov/v2/");
  url.searchParams.set("api_key",key);

  const res=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(9000)});
  if(!res.ok) throw new Error("HTTP "+res.status);

  const payload:any=await res.json();
  const matched=flattenObjects(payload).filter((row:any)=>
    objectCode(row)&&objectName(row)&&matchesQuery(q,objectCode(row),objectName(row))
  );

  const items=matched.slice(0,MAX_PER_SOURCE).map((row:any)=>{
    const code=objectCode(row);
    const title=objectName(row);
    return {
      id:"eia-dataset-"+code,
      concept:"energy-dataset",
      title,
      provider:"EIA",
      providerId:"eia",
      indicator:code,
      unit:"Dataset dimensions vary",
      frequency:"Dataset-defined",
      description:text(row.description)||title,
      normalized:false,
      resultType:"dataset",
      selectable:false,
      sourceUrl:"https://www.eia.gov/opendata/"
    } satisfies SeriesCatalogItem;
  });

  return {items,total:matched.length};
}

type SearchFn=(q:string)=>Promise<SearchOutcome>;

const dynamicSearchers:Record<string,SearchFn>={
  "world-bank":worldBank,
  fred,
  sdg,
  "un-population":unPopulation,
  wto,
  unhcr,
  eia
};

for(const config of sdmxProviders){
  dynamicSearchers[config.id]=(q:string)=>sdmxDataflows(config,q);
}

export async function federatedCatalogSearch(q:string,providerIds:string[]):Promise<SearchResponse>{
  const requested=new Set(providerIds.filter(Boolean));
  const includeAll=requested.size===0;
  const results:SeriesCatalogItem[]=[];
  const status:ProviderSearchStatus[]=[];

  const local=searchCatalog(q).filter(item=>
    (includeAll||requested.has(item.providerId))&&!dynamicSearchers[item.providerId]
  );
  results.push(...local);

  const localCounts=new Map<string,number>();
  for(const item of local) localCounts.set(item.providerId,(localCounts.get(item.providerId)||0)+1);
  for(const [providerId,total] of localCounts){
    const providerItems=local.filter(item=>item.providerId===providerId);
    status.push({
      providerId,
      state:"ok",
      ...statusCount(total),
      partial:true,
      ...capFrequencyCounts(countsFromItems(providerItems))
    });
  }

  const defaultDynamic=["world-bank","fred","sdg","unhcr","wto","un-population","eia"];
  const ids=includeAll
    ? (q.trim()?Object.keys(dynamicSearchers):defaultDynamic)
    : [...requested].filter(id=>dynamicSearchers[id]);

  const resolved=await Promise.all(ids.map(async providerId=>{
    try{
      const outcome=await dynamicSearchers[providerId](q);
      return {providerId,outcome,error:null as string|null};
    }catch(error){
      return {
        providerId,
        outcome:{items:[] as SeriesCatalogItem[],total:0},
        error:error instanceof Error?error.message:"Search failed"
      };
    }
  }));

  for(const entry of resolved){
    results.push(...entry.outcome.items);
    status.push({
      providerId:entry.providerId,
      state:entry.error?"error":"ok",
      ...statusCount(entry.outcome.total),
      frequencyCounts:entry.outcome.frequencyCounts,
      frequencyCapped:entry.outcome.frequencyCapped,
      message:entry.error||undefined
    });
  }

  for(const providerId of requested){
    if(localCounts.has(providerId)||dynamicSearchers[providerId]) continue;
    const provider=getProvider(providerId);
    status.push({
      providerId,
      state:"skipped",
      count:0,
      message:provider?"Provider is registered, but searchable metadata ingestion is not implemented yet.":"Unknown provider."
    });
  }

  return {results:dedupe(results),status};
}

export async function providerCatalogueCounts():Promise<ProviderSearchStatus[]>{
  const counts=new Map<string,ProviderSearchStatus>();

  const local=searchCatalog("");
  for(const provider of providers){
    if(dynamicSearchers[provider.id]) continue;
    const total=local.filter(item=>item.providerId===provider.id).length;
    if(total){
      const providerItems=local.filter(item=>item.providerId===provider.id);
      counts.set(provider.id,{
        providerId:provider.id,
        state:"ok",
        ...statusCount(total),
        partial:true,
        ...capFrequencyCounts(countsFromItems(providerItems))
      });
    }
  }

  const entries=Object.entries(dynamicSearchers);
  const resolved=await Promise.all(entries.map(async ([providerId,search])=>{
    try{
      // FRED has no unfiltered list endpoint. A one-letter search gives a
      // lower bound; once it exceeds the UI cap, 1000+ is sufficient.
      const query=providerId==="fred"?"a":"";
      const outcome=await search(query);
      return {
        providerId,
        total:outcome.total,
        frequencyCounts:outcome.frequencyCounts,
        frequencyCapped:outcome.frequencyCapped,
        error:null as string|null
      };
    }catch(error){
      return {
        providerId,
        total:0,
        frequencyCounts:undefined,
        frequencyCapped:undefined,
        error:error instanceof Error?error.message:"Count failed"
      };
    }
  }));

  for(const entry of resolved){
    counts.set(entry.providerId,{
      providerId:entry.providerId,
      state:entry.error?"error":"ok",
      ...statusCount(entry.total),
      frequencyCounts:entry.frequencyCounts,
      frequencyCapped:entry.frequencyCapped,
      message:entry.error||undefined
    });
  }

  return providers.map(provider=>
    counts.get(provider.id)||{
      providerId:provider.id,
      state:"skipped",
      count:0,
      message:"No searchable catalogue has been indexed for this source yet."
    }
  );
}


export function aggregateFrequencyCounts(statuses:ProviderSearchStatus[]){
  const counts:Partial<Record<ProviderFrequency,number>>={};
  const capped:Partial<Record<ProviderFrequency,boolean>>={};

  for(const status of statuses){
    for(const [frequency,value] of Object.entries(status.frequencyCounts||{}) as [ProviderFrequency,number][]){
      counts[frequency]=(counts[frequency]||0)+value;
      if(status.frequencyCapped?.[frequency]) capped[frequency]=true;
      if((counts[frequency]||0)>BADGE_CAP){
        counts[frequency]=BADGE_CAP;
        capped[frequency]=true;
      }
    }
  }

  return {counts,capped};
}
