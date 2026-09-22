import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";
import { buildSdmxDataUrl, isSdmxProvider } from "@/lib/sdmx";
import type { SeriesCatalogItem } from "@/lib/catalog";

export const runtime="nodejs";

type Point={year:number;period:string;value:number};

function numeric(value:unknown){
  if(value===null||value===undefined||value===""||value===".") return null;
  const n=Number(String(value).replace(/,/g,""));
  return Number.isFinite(n)?n:null;
}

function years(start:number,end:number){
  const out:number[]=[];
  for(let y=start;y<=end && out.length<200;y++) out.push(y);
  return out;
}

function parseCsv(text:string){
  const rows:string[][]=[];
  let row:string[]=[];
  let field="";
  let quoted=false;

  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"' && text[i+1]==='"'){ field+='"'; i++; }
      else if(ch==='"'){ quoted=false; }
      else field+=ch;
    }else{
      if(ch==='"') quoted=true;
      else if(ch===","){ row.push(field); field=""; }
      else if(ch==="\n"){ row.push(field.replace(/\r$/,"")); rows.push(row); row=[]; field=""; }
      else field+=ch;
    }
  }

  if(field.length||row.length){ row.push(field.replace(/\r$/,"")); rows.push(row); }
  return rows;
}

function flattenObjects(value:unknown,out:any[]=[],depth=0){
  if(depth>10||out.length>50000||value===null||value===undefined) return out;

  if(Array.isArray(value)){
    for(const item of value){
      if(item&&typeof item==="object"&&!Array.isArray(item)) out.push(item);
      flattenObjects(item,out,depth+1);
      if(out.length>50000) break;
    }
  }else if(typeof value==="object"){
    for(const child of Object.values(value as Record<string,unknown>)){
      flattenObjects(child,out,depth+1);
      if(out.length>50000) break;
    }
  }

  return out;
}

function pick(obj:any,names:string[]){
  if(!obj||typeof obj!=="object") return undefined;
  for(const name of names){
    if(obj[name]!==undefined&&obj[name]!==null&&obj[name]!=="") return obj[name];
  }

  const normalized=new Map(Object.keys(obj).map(key=>[key.toLowerCase().replace(/[^a-z0-9]/g,""),key]));
  for(const name of names){
    const key=normalized.get(name.toLowerCase().replace(/[^a-z0-9]/g,""));
    if(key&&obj[key]!==undefined&&obj[key]!==null&&obj[key]!=="") return obj[key];
  }
  return undefined;
}

function periodFromRow(row:any){
  const raw=pick(row,[
    "TIME_PERIOD","timePeriod","time_period","Period","period","Year","year",
    "date","Date","time","Time","periodCode","period_code"
  ]);
  if(raw===undefined) return "";
  return String(raw).trim();
}

function yearFromPeriod(period:string){
  const match=period.match(/(18|19|20|21)\d{2}/);
  return match?Number(match[0]):NaN;
}

function pointsFromRows(rows:any[]){
  const points:Point[]=[];
  for(const row of rows){
    const period=periodFromRow(row);
    const value=numeric(pick(row,["OBS_VALUE","obsValue","obs_value","Value","value","val","Val"]));
    const year=yearFromPeriod(period);
    if(period&&value!==null&&Number.isFinite(year)) points.push({year,period,value});
  }
  return points;
}

function ensureUniquePeriods(points:Point[],provider:string){
  const byPeriod=new Map<string,number>();
  for(const point of points) byPeriod.set(point.period,(byPeriod.get(point.period)||0)+1);
  const duplicate=[...byPeriod.entries()].find(([,count])=>count>1);
  if(duplicate){
    throw new Error(provider+" returned multiple observations for "+duplicate[0]+". This series needs additional dimension selection before it can be merged safely.");
  }
  return points.sort((a,b)=>a.period.localeCompare(b.period,undefined,{numeric:true}));
}

async function worldBank(indicator:string,country:string,start:number,end:number){
  const url=new URL(`https://api.worldbank.org/v2/country/${encodeURIComponent(country)}/indicator/${encodeURIComponent(indicator)}`);
  url.searchParams.set("format","json");
  url.searchParams.set("date",`${start}:${end}`);
  url.searchParams.set("per_page","20000");

  const response=await fetch(url,{next:{revalidate:900},signal:AbortSignal.timeout(25000)});
  if(!response.ok) throw new Error(`World Bank returned HTTP ${response.status}`);

  const payload=await response.json();
  const rows=Array.isArray(payload)&&Array.isArray(payload[1])?payload[1]:[];
  const points:Point[]=rows.flatMap((row:any)=>{
    const year=Number(row.date);
    const value=numeric(row.value);
    return Number.isFinite(year)&&value!==null?[{year,period:String(year),value}]:[];
  }).sort((a,b)=>a.year-b.year);

  return {
    points,
    sourceUrl:url.toString(),
    meta:rows[0]?{country:rows[0].country?.value,indicator:rows[0].indicator?.value}:{}
  };
}

async function imf(indicator:string,country:string,start:number,end:number){
  const key=`${country.toUpperCase()}.${indicator}.A`;
  const url=new URL(`https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO/+/${encodeURIComponent(key)}`);
  url.searchParams.set("startPeriod",String(start));
  url.searchParams.set("endPeriod",String(end));

  let lastError="";
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetch(url,{
        headers:{
          Accept:"text/csv",
          "User-Agent":"PublicDataWorkbench/1.0 (+https://github.com/Oshione2002/Public-Data-Workbench)"
        },
        next:{revalidate:900},
        signal:AbortSignal.timeout(18000)
      });

      if(response.ok){
        const rows=parseCsv(await response.text()).filter(r=>r.some(cell=>cell.trim()!==""));
        if(rows.length<2) return {points:[] as Point[],sourceUrl:url.toString(),meta:{dataset:"IMF.RES:WEO",transport:"SDMX 3.0"}};

        const header=rows[0].map(x=>x.replace(/^\uFEFF/,"").trim());
        const timeIndex=header.findIndex(x=>x==="TIME_PERIOD"||x==="TIME_PERIOD_START");
        const valueIndex=header.findIndex(x=>x==="OBS_VALUE");
        if(timeIndex<0||valueIndex<0) throw new Error("IMF SDMX CSV response did not contain TIME_PERIOD and OBS_VALUE columns.");

        const points:Point[]=rows.slice(1).flatMap(cols=>{
          const period=String(cols[timeIndex]||"").trim();
          const year=yearFromPeriod(period);
          const value=numeric(cols[valueIndex]);
          return Number.isFinite(year)&&year>=start&&year<=end&&value!==null?[{year,period,value}]:[];
        }).sort((a,b)=>a.period.localeCompare(b.period,undefined,{numeric:true}));

        return {
          points,
          sourceUrl:url.toString(),
          meta:{dataset:"IMF.RES:WEO",transport:"SDMX 3.0",country:country.toUpperCase(),indicator}
        };
      }

      const body=(await response.text()).replace(/\s+/g," ").slice(0,240);
      lastError=`HTTP ${response.status}${body?" — "+body:""}`;
      if(response.status!==429&&response.status<500) break;
    }catch(error){
      lastError=error instanceof Error?error.message:"Unknown IMF request error";
    }

    if(attempt===0) await new Promise(resolve=>setTimeout(resolve,500));
  }

  throw new Error(`IMF SDMX request failed: ${lastError||"unknown error"}`);
}

async function fred(indicator:string,start:number,end:number){
  const provider=getProvider("fred")!;
  const key=process.env.FRED_API_KEY;
  if(!key) throw new Error("FRED_API_KEY is not configured on the server.");

  const url=new URL(provider.apiBase!+"/series/observations");
  url.searchParams.set("series_id",indicator);
  url.searchParams.set("api_key",key);
  url.searchParams.set("file_type","json");
  url.searchParams.set("observation_start",`${start}-01-01`);
  url.searchParams.set("observation_end",`${end}-12-31`);

  const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(25000)});
  if(!response.ok) throw new Error(`FRED returned HTTP ${response.status}`);

  const payload:any=await response.json();
  const points:Point[]=(payload.observations||[]).flatMap((row:any)=>{
    const period=String(row.date||"").trim();
    const year=yearFromPeriod(period);
    const value=numeric(row.value);
    return Number.isFinite(year)&&value!==null?[{year,period,value}]:[];
  });

  return {
    points:ensureUniquePeriods(points,"FRED"),
    sourceUrl:"https://fred.stlouisfed.org/series/"+encodeURIComponent(indicator),
    meta:{}
  };
}

async function iso2FromIso3(country:string){
  if(country.length===2) return country.toUpperCase();

  const url=new URL("https://api.worldbank.org/v2/country/"+encodeURIComponent(country));
  url.searchParams.set("format","json");
  const response=await fetch(url,{next:{revalidate:86400},signal:AbortSignal.timeout(8000)});
  if(!response.ok) return country.toUpperCase();

  const payload:any=await response.json();
  return String(payload?.[1]?.[0]?.iso2Code||country).toUpperCase();
}

async function wto(indicator:string,country:string,start:number,end:number){
  const key=process.env.WTO_API_KEY;
  if(!key) throw new Error("WTO_API_KEY is not configured on the server.");

  const reporter=await iso2FromIso3(country);
  const url=new URL("https://api.wto.org/timeseries/v1/data");
  url.searchParams.set("i",indicator);
  url.searchParams.set("r",reporter);
  url.searchParams.set("ps",`${start}-${end}`);
  url.searchParams.set("fmt","json");
  url.searchParams.set("mode","full");
  url.searchParams.set("off","0");
  url.searchParams.set("max","5000");
  url.searchParams.set("head","H");
  url.searchParams.set("lang","1");
  url.searchParams.set("meta","false");

  const response=await fetch(url,{
    headers:{Accept:"application/json","Ocp-Apim-Subscription-Key":key},
    cache:"no-store",
    signal:AbortSignal.timeout(20000)
  });
  if(!response.ok){
    const body=(await response.text()).replace(/\s+/g," ").slice(0,220);
    throw new Error(`WTO returned HTTP ${response.status}${body?" — "+body:""}`);
  }

  const payload:any=await response.json();
  const direct=
    payload?.dataset?.data||
    payload?.Dataset?.data||
    payload?.Dataset?.Data||
    payload?.dataset?.Data||
    payload?.data||
    payload?.Data;

  const rows=Array.isArray(direct)?direct:flattenObjects(payload);
  const points=pointsFromRows(rows).filter(p=>p.year>=start&&p.year<=end);

  return {
    points:ensureUniquePeriods(points,"WTO"),
    sourceUrl:url.toString(),
    meta:{reporter,indicator,transport:"WTO Timeseries API v1"}
  };
}

const unhcrFieldAliases:Record<string,string[]>={
  refugees:["refugees","refugee"],
  asylum_seekers:["asylum_seekers","asylumSeekers","asylum_seekers_total"],
  idps:["idps","idp","internally_displaced"],
  oip:["oip","other_people_in_need_of_international_protection"],
  stateless:["stateless","stateless_persons"],
  ooc:["ooc","others_of_concern","other_people_of_concern"]
};

async function unhcr(indicator:string,country:string,start:number,end:number){
  const url=new URL("https://api.unhcr.org/population/v1/population/");
  url.searchParams.set("yearFrom",String(start));
  url.searchParams.set("yearTo",String(end));
  url.searchParams.set("coa",country.toUpperCase());
  url.searchParams.set("cfType","ISO");
  url.searchParams.set("limit","20000");

  const response=await fetch(url,{next:{revalidate:3600},signal:AbortSignal.timeout(18000)});
  if(!response.ok) throw new Error(`UNHCR returned HTTP ${response.status}`);

  const payload:any=await response.json();
  const rows=flattenObjects(payload);
  const aliases=unhcrFieldAliases[indicator]||[indicator];
  const sums=new Map<number,number>();

  for(const row of rows){
    const year=Number(pick(row,["year","Year"]));
    if(!Number.isFinite(year)||year<start||year>end) continue;

    const value=numeric(pick(row,aliases));
    if(value===null) continue;
    sums.set(year,(sums.get(year)||0)+value);
  }

  const points:Point[]=[...sums.entries()]
    .sort(([a],[b])=>a-b)
    .map(([year,value])=>({year,period:String(year),value}));

  return {
    points,
    sourceUrl:url.toString(),
    meta:{countryDimension:"country of asylum",indicator,transport:"UNHCR Refugee Statistics API"}
  };
}

async function m49FromIso3(country:string){
  if(/^\d{3}$/.test(country)) return country;
  const url=new URL("https://restcountries.com/v3.1/alpha/"+encodeURIComponent(country));
  url.searchParams.set("fields","ccn3");
  const response=await fetch(url,{next:{revalidate:86400},signal:AbortSignal.timeout(8000)});
  if(!response.ok) throw new Error("Could not map "+country+" to a UN M49 country code.");

  const payload:any=await response.json();
  const ccn3=Array.isArray(payload)?payload[0]?.ccn3:payload?.ccn3;
  if(!ccn3) throw new Error("Could not map "+country+" to a UN M49 country code.");
  return String(ccn3).padStart(3,"0");
}

async function sdg(indicator:string,country:string,start:number,end:number){
  const area=await m49FromIso3(country);
  const url=new URL(`https://unstats.un.org/SDGAPI/v1/sdg/Series/${encodeURIComponent(indicator)}/GeoArea/${encodeURIComponent(area)}/DataSlice`);

  const response=await fetch(url,{next:{revalidate:3600},signal:AbortSignal.timeout(18000)});
  if(!response.ok) throw new Error(`UN SDG returned HTTP ${response.status}`);

  const payload:any=await response.json();
  const rows=flattenObjects(payload);
  const points=pointsFromRows(rows).filter(p=>p.year>=start&&p.year<=end);

  return {
    points:ensureUniquePeriods(points,"UN SDG"),
    sourceUrl:url.toString(),
    meta:{geoAreaCode:area,indicator,transport:"UNSD SDG API"}
  };
}

async function genericSdmx(item:SeriesCatalogItem,country:string,start:number,end:number){
  const url=buildSdmxDataUrl(item,country,start,end);
  const headers:Record<string,string>={"User-Agent":"PublicDataWorkbench/1.0"};
  if(item.providerId==="oecd") url.searchParams.set("format","csvfile");
  else if(item.providerId==="unicef"||item.providerId==="ilo") url.searchParams.set("format","csv");
  else if(item.providerId==="ecb") url.searchParams.set("format","csvdata");
  else if(item.providerId==="eurostat") url.searchParams.set("format","SDMX-CSV");
  else if(item.providerId==="bis") headers.Accept="application/vnd.sdmx.data+csv;version=2.0.0";
  else headers.Accept="text/csv";

  const response=await fetch(url,{headers,next:{revalidate:900},signal:AbortSignal.timeout(25000)});
  if(!response.ok){
    const body=(await response.text()).replace(/\s+/g," ").slice(0,220);
    if(response.status===404&&/no\s*results|noresultsfound/i.test(body)){
      return {points:[] as Point[],sourceUrl:url.toString(),meta:{dataset:item.dataset,dimensions:item.dimensions,transport:"SDMX"}};
    }
    throw new Error(`${item.provider} returned HTTP ${response.status}${body?" — "+body:""}`);
  }
  const table=parseCsv(await response.text()).filter(row=>row.some(cell=>cell.trim()!==""));
  if(table.length<2) return {points:[] as Point[],sourceUrl:url.toString(),meta:{dataset:item.dataset,dimensions:item.dimensions}};
  const header=table[0].map(cell=>cell.replace(/^\uFEFF/,"").trim());
  const rows=table.slice(1).map(columns=>Object.fromEntries(header.map((key,index)=>[key,columns[index]??""])));
  const points=pointsFromRows(rows).filter(point=>point.year>=start&&point.year<=end);
  return {
    points:ensureUniquePeriods(points,item.provider),
    sourceUrl:url.toString(),
    meta:{dataset:item.dataset,agency:item.agency,dimensions:item.dimensions,transport:"SDMX"}
  };
}

export async function GET(request:NextRequest){
  const sp=request.nextUrl.searchParams;
  const provider=sp.get("provider")||"";
  const indicator=sp.get("indicator")||"";
  const dataset=sp.get("dataset")||"";
  const agency=sp.get("agency")||"all";
  const datasetVersion=sp.get("datasetVersion")||"latest";
  const country=(sp.get("country")||"NGA").toUpperCase();
  const start=Math.max(1800,Math.min(2200,Number(sp.get("start")||1990)));
  const end=Math.max(start,Math.min(2200,Number(sp.get("end")||new Date().getUTCFullYear())));

  if(!indicator) return NextResponse.json({error:"indicator is required"},{status:400});

  try{
    let result;

    if(provider==="world-bank") result=await worldBank(indicator,country,start,end);
    else if(provider==="imf") result=await imf(indicator,country,start,end);
    else if(provider==="fred") result=await fred(indicator,start,end);
    else if(provider==="wto") result=await wto(indicator,country,start,end);
    else if(provider==="unhcr") result=await unhcr(indicator,country,start,end);
    else if(provider==="sdg") result=await sdg(indicator,country,start,end);
    else if(isSdmxProvider(provider)&&dataset){
      let dimensions:Record<string,string>={};
      try{ dimensions=JSON.parse(sp.get("dimensions")||"{}"); }catch{}
      result=await genericSdmx({
        id:`${provider}-${dataset}-${indicator}`,
        concept:"resolved-series",
        title:indicator,
        provider:getProvider(provider)?.shortName||provider,
        providerId:provider,
        indicator,
        unit:"See provider metadata",
        frequency:"Provider-defined",
        description:"Resolved SDMX series.",
        normalized:true,
        resultType:"series",
        selectable:true,
        dataset,
        datasetVersion,
        agency,
        dimensions
      },country,start,end);
    }else return NextResponse.json({
      error:"This provider result still needs dimension resolution before it can be loaded into the common workspace.",
      provider
    },{status:400});

    return NextResponse.json({
      provider,
      indicator,
      country,
      start,
      end,
      observations:result.points,
      coverage:result.points.length?{
        start:result.points[0].year,
        end:result.points[result.points.length-1].year,
        startPeriod:result.points[0].period,
        endPeriod:result.points[result.points.length-1].period,
        count:result.points.length
      }:null,
      sourceUrl:result.sourceUrl,
      metadata:result.meta,
      retrievedAt:new Date().toISOString()
    });
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Data request failed."},{status:502});
  }
}
