import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";

export const runtime="nodejs";

type Point={year:number,value:number};

function numeric(value:unknown){
  if(value===null||value===undefined||value===""||value===".") return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}

function years(start:number,end:number){
  const out:number[]=[];
  for(let y=start;y<=end && out.length<200;y++) out.push(y);
  return out;
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
    return Number.isFinite(year)&&value!==null?[{year,value}]:[];
  }).sort((a:Point,b:Point)=>a.year-b.year);
  return {points,sourceUrl:url.toString(),meta:rows[0]?{country:rows[0].country?.value,indicator:rows[0].indicator?.value}:{}};
}

async function imf(indicator:string,country:string,start:number,end:number){
  const url=new URL(`https://www.imf.org/external/datamapper/api/v2/${encodeURIComponent(indicator)}/${encodeURIComponent(country)}`);
  url.searchParams.set("periods",years(start,end).join(","));
  const response=await fetch(url,{next:{revalidate:900},signal:AbortSignal.timeout(25000)});
  if(!response.ok) throw new Error(`IMF DataMapper returned HTTP ${response.status}`);
  const payload:any=await response.json();
  const root=payload?.values?.[indicator]??payload?.values??{};
  const series=root?.[country]??root?.[country.toUpperCase()]??root;
  const points:Point[]=Object.entries(series||{}).flatMap(([year,value])=>{
    const y=Number(year);
    const v=numeric(value);
    return Number.isFinite(y)&&y>=start&&y<=end&&v!==null?[{year:y,value:v}]:[];
  }).sort((a:Point,b:Point)=>a.year-b.year);
  return {points,sourceUrl:url.toString(),meta:payload?.api??{}};
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
    const year=Number(String(row.date).slice(0,4));
    const value=numeric(row.value);
    return Number.isFinite(year)&&value!==null?[{year,value}]:[];
  });
  return {points,sourceUrl:"https://fred.stlouisfed.org/series/"+encodeURIComponent(indicator),meta:{}};
}

export async function GET(request:NextRequest){
  const sp=request.nextUrl.searchParams;
  const provider=sp.get("provider")||"";
  const indicator=sp.get("indicator")||"";
  const country=(sp.get("country")||"NGA").toUpperCase();
  const start=Math.max(1800,Math.min(2200,Number(sp.get("start")||1990)));
  const end=Math.max(start,Math.min(2200,Number(sp.get("end")||new Date().getUTCFullYear())));
  if(!indicator) return NextResponse.json({error:"indicator is required"},{status:400});

  try{
    let result;
    if(provider==="world-bank") result=await worldBank(indicator,country,start,end);
    else if(provider==="imf") result=await imf(indicator,country,start,end);
    else if(provider==="fred") result=await fred(indicator,start,end);
    else return NextResponse.json({
      error:"This provider is available through the advanced provider API console but does not yet have a normalized series adapter.",
      provider
    },{status:400});

    return NextResponse.json({
      provider,indicator,country,start,end,
      observations:result.points,
      coverage:result.points.length?{start:result.points[0].year,end:result.points[result.points.length-1].year,count:result.points.length}:null,
      sourceUrl:result.sourceUrl,
      metadata:result.meta,
      retrievedAt:new Date().toISOString()
    });
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Data request failed."},{status:502});
  }
}
