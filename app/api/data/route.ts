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

async function imf(indicator:string,country:string,start:number,end:number){
  // IMF migrated WEO to its official SDMX API. DataMapper is intentionally
  // not used here because its edge protection can return 403s or hang on
  // server-side requests.
  const key=`${country.toUpperCase()}.${indicator}.A`;
  const url=new URL(
    `https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO/+/${encodeURIComponent(key)}`
  );
  url.searchParams.set("startPeriod",String(start));
  url.searchParams.set("endPeriod",String(end));

  let lastError="";
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetch(url,{
        headers:{
          "Accept":"text/csv",
          "User-Agent":"PublicDataWorkbench/1.0 (+https://github.com/Oshione2002/Public-Data-Workbench)"
        },
        next:{revalidate:900},
        signal:AbortSignal.timeout(18000)
      });

      if(response.ok){
        const csv=await response.text();
        const rows=parseCsv(csv).filter(r=>r.some(cell=>cell.trim()!==""));
        if(rows.length<2) return {points:[] as Point[],sourceUrl:url.toString(),meta:{dataset:"IMF.RES:WEO",transport:"SDMX 3.0"}};

        const header=rows[0].map(x=>x.replace(/^\uFEFF/,"").trim());
        const timeIndex=header.findIndex(x=>x==="TIME_PERIOD"||x==="TIME_PERIOD_START");
        const valueIndex=header.findIndex(x=>x==="OBS_VALUE");
        if(timeIndex<0||valueIndex<0){
          throw new Error("IMF SDMX CSV response did not contain TIME_PERIOD and OBS_VALUE columns.");
        }

        const points:Point[]=rows.slice(1).flatMap(cols=>{
          const year=Number(String(cols[timeIndex]||"").slice(0,4));
          const value=numeric(cols[valueIndex]);
          return Number.isFinite(year)&&year>=start&&year<=end&&value!==null?[{year,value}]:[];
        }).sort((a,b)=>a.year-b.year);

        return {
          points,
          sourceUrl:url.toString(),
          meta:{
            dataset:"IMF.RES:WEO",
            transport:"SDMX 3.0",
            country:country.toUpperCase(),
            indicator
          }
        };
      }

      const body=(await response.text()).replace(/\s+/g," ").slice(0,240);
      lastError=`HTTP ${response.status}${body?" — "+body:""}`;
      if(response.status!==429 && response.status<500) break;
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
