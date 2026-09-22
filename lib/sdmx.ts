import type { SeriesCatalogItem } from "@/lib/catalog";

export type DimensionValue={code:string;label:string};
export type DatasetDimension={
  id:string;
  label:string;
  position:number;
  role:"geography"|"frequency"|"time"|"measure"|"other";
  values:DimensionValue[];
};

export type DatasetStructure={
  providerId:string;
  agency:string;
  dataset:string;
  version:string;
  title:string;
  dimensions:DatasetDimension[];
  sourceUrl:string;
};

type Endpoint={structure:(agency:string,dataset:string,version:string)=>string;data:(agency:string,dataset:string,version:string,key:string)=>string};

const endpoints:Record<string,Endpoint>={
  imf:{
    structure:(agency,dataset,version)=>`https://api.imf.org/external/sdmx/3.0/structure/dataflow/${encodeURIComponent(agency)}/${encodeURIComponent(dataset)}/${encodeURIComponent(version)}?references=all`,
    data:(agency,dataset,version,key)=>`https://api.imf.org/external/sdmx/3.0/data/dataflow/${encodeURIComponent(agency)}/${encodeURIComponent(dataset)}/${encodeURIComponent(version)}/${key}`
  },
  ilo:{
    structure:(agency,dataset,version)=>`https://sdmx.data.ilo.org/rest/dataflow/${encodeURIComponent(agency)}/${encodeURIComponent(dataset)}/${encodeURIComponent(version)}?references=all`,
    data:(agency,dataset,version,key)=>`https://sdmx.data.ilo.org/rest/data/${encodeURIComponent(agency)},${encodeURIComponent(dataset)},${encodeURIComponent(version)}/${key}`
  },
  oecd:{
    structure:(agency,dataset,version)=>`https://sdmx.oecd.org/public/rest/dataflow/${encodeURIComponent(agency)}/${encodeURIComponent(dataset)}/${encodeURIComponent(version)}?references=all`,
    data:(agency,dataset,version,key)=>`https://sdmx.oecd.org/public/rest/data/${encodeURIComponent(agency)},${encodeURIComponent(dataset)},${encodeURIComponent(version)}/${key}`
  },
  unicef:{
    structure:(agency,dataset,version)=>`https://sdmx.data.unicef.org/ws/public/sdmxapi/rest/dataflow/${encodeURIComponent(agency)}/${encodeURIComponent(dataset)}/${encodeURIComponent(version)}/?detail=full&references=all`,
    data:(agency,dataset,version,key)=>`https://sdmx.data.unicef.org/ws/public/sdmxapi/rest/data/${encodeURIComponent(agency)},${encodeURIComponent(dataset)},${encodeURIComponent(version)}/${key}`
  },
  ecb:{
    structure:(agency,dataset,version)=>`https://data-api.ecb.europa.eu/service/dataflow/${encodeURIComponent(agency)}/${encodeURIComponent(dataset)}/${encodeURIComponent(version)}?references=all`,
    data:(agency,dataset,version,key)=>`https://data-api.ecb.europa.eu/service/data/${encodeURIComponent(agency)},${encodeURIComponent(dataset)},${encodeURIComponent(version)}/${key}`
  },
  bis:{
    structure:(agency,dataset,version)=>`https://stats.bis.org/api/v2/structure/dataflow/${encodeURIComponent(agency)}/${encodeURIComponent(dataset)}/${encodeURIComponent(version)}?references=all`,
    data:(agency,dataset,version,key)=>`https://stats.bis.org/api/v2/data/dataflow/${encodeURIComponent(agency)}/${encodeURIComponent(dataset)}/${encodeURIComponent(version)}/${key}`
  },
  eurostat:{
    structure:(agency,dataset,version)=>`https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/dataflow/${encodeURIComponent(agency)}/${encodeURIComponent(dataset)}/${encodeURIComponent(version)}?references=all`,
    data:(agency,dataset,version,key)=>`https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/${encodeURIComponent(agency)},${encodeURIComponent(dataset)},${encodeURIComponent(version)}/${key}`
  }
};

function decode(value:string){
  return value.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'");
}

function attr(input:string,name:string){
  return (input.match(new RegExp(`\\b${name}=["']([^"']+)["']`,"i"))||[])[1]||"";
}

function firstName(body:string){
  const names=[...body.matchAll(/<(?:\w+:)?Name\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Name>/gi)];
  const english=names.find(match=>/xml:lang=["']en/i.test(match[0]));
  return decode((english?.[1]||names[0]?.[1]||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim());
}

function roleFor(id:string):DatasetDimension["role"]{
  const key=id.toUpperCase();
  if(["TIME_PERIOD","TIME"].includes(key)) return "time";
  if(["FREQ","FREQUENCY"].includes(key)) return "frequency";
  if(/REF_AREA|COUNTRY|LOCATION|GEO|REPORTER/.test(key)) return "geography";
  if(/INDICATOR|MEASURE|SUBJECT|ITEM|COMMODITY|SERIES/.test(key)) return "measure";
  return "other";
}

function parseCodelists(xml:string){
  const lists=new Map<string,DimensionValue[]>();
  const regex=/<(?:\w+:)?Codelist\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Codelist>/gi;
  let match:RegExpExecArray|null;
  while((match=regex.exec(xml))){
    const id=attr(match[1],"id");
    if(!id) continue;
    const values:DimensionValue[]=[];
    const codeRegex=/<(?:\w+:)?Code\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Code>/gi;
    let codeMatch:RegExpExecArray|null;
    while((codeMatch=codeRegex.exec(match[2]))){
      const code=attr(codeMatch[1],"id");
      if(code) values.push({code,label:firstName(codeMatch[2])||code});
    }
    lists.set(id,values);
  }
  return lists;
}

function parseDimensions(xml:string,codelists:Map<string,DimensionValue[]>){
  const dimensions:DatasetDimension[]=[];
  const regex=/<(?:\w+:)?Dimension\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?Dimension>)/gi;
  let match:RegExpExecArray|null;
  while((match=regex.exec(xml))){
    const id=attr(match[1],"id");
    if(!id||id.toUpperCase()==="TIME_PERIOD") continue;
    const body=match[2]||"";
    const enumeration=(body.match(/<(?:\w+:)?Enumeration>\s*<(?:\w+:)?Ref\b([^>]*)\/>/i)||[])[1]||"";
    const codelistId=attr(enumeration,"id");
    dimensions.push({
      id,
      label:firstName(body)||id.replaceAll("_"," "),
      position:Number(attr(match[1],"position"))||dimensions.length+1,
      role:roleFor(id),
      values:codelists.get(codelistId)||[]
    });
  }
  const seen=new Set<string>();
  return dimensions.filter(d=>!seen.has(d.id)&&(seen.add(d.id),true)).sort((a,b)=>a.position-b.position);
}

export async function getDatasetStructure(providerId:string,agency:string,dataset:string,version="latest"):Promise<DatasetStructure>{
  const endpoint=endpoints[providerId];
  if(!endpoint) throw new Error("Dimension resolution is not implemented for this provider yet.");
  const sourceUrl=endpoint.structure(agency||"all",dataset,version||"latest");
  const response=await fetch(sourceUrl,{
    headers:{Accept:"application/vnd.sdmx.structure+xml;version=2.1, application/xml;q=0.9","User-Agent":"PublicDataWorkbench/1.0"},
    next:{revalidate:86400},
    signal:AbortSignal.timeout(25000)
  });
  if(!response.ok) throw new Error(`Structure request returned HTTP ${response.status}`);
  const xml=await response.text();
  const codelists=parseCodelists(xml);
  const dimensions=parseDimensions(xml,codelists);
  if(!dimensions.length) throw new Error("The provider returned no resolvable dimensions for this dataset.");
  return {providerId,agency:agency||"all",dataset,version:version||"latest",title:dataset,dimensions,sourceUrl};
}

export function buildSdmxDataUrl(item:SeriesCatalogItem,country:string,start:number,end:number){
  const endpoint=endpoints[item.providerId];
  if(!endpoint||!item.dataset||!item.dimensions) throw new Error("This series does not contain a complete SDMX key.");
  const ordered=Object.entries(item.dimensions).sort((a,b)=>Number(a[0].split(":")[0])-Number(b[0].split(":")[0]));
  const key=ordered.map(([dimension,value])=>{
    const id=dimension.replace(/^\d+:/,"");
    return roleFor(id)==="geography"?country:value;
  }).map(encodeURIComponent).join(".");
  const url=new URL(endpoint.data(item.agency||"all",item.dataset,item.datasetVersion||"latest",key));
  url.searchParams.set("startPeriod",String(start));
  url.searchParams.set("endPeriod",String(end));
  return url;
}

export function isSdmxProvider(providerId:string){ return Boolean(endpoints[providerId]); }
