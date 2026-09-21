import { NextResponse } from "next/server";

export const runtime="nodejs";

type CheckResult={
  configured:boolean;
  reachable:boolean;
  status:number|null;
  detail?:string;
};

async function probe(url:string,init:RequestInit,configured:boolean):Promise<CheckResult>{
  if(!configured) return {configured:false,reachable:false,status:null,detail:"Environment variable not configured"};
  try{
    const res=await fetch(url,{...init,cache:"no-store",signal:AbortSignal.timeout(10000)});
    const text=await res.text();
    return {
      configured:true,
      reachable:res.ok,
      status:res.status,
      detail:res.ok?"OK":text.replace(/\s+/g," ").slice(0,180)
    };
  }catch(error){
    return {
      configured:true,
      reachable:false,
      status:null,
      detail:error instanceof Error?error.message:"Request failed"
    };
  }
}

export async function GET(){
  const fred=process.env.FRED_API_KEY||"";
  const eia=process.env.EIA_API_KEY||"";
  const wto=process.env.WTO_API_KEY||"";
  const comtrade=process.env.COMTRADE_API_KEY||"";
  const population=process.env.UN_POPULATION_TOKEN||"";

  const checks=await Promise.all([
    probe(
      "https://api.stlouisfed.org/fred/category?category_id=0&file_type=json&api_key="+encodeURIComponent(fred),
      {headers:{Accept:"application/json"}},
      Boolean(fred)
    ),
    probe(
      "https://api.eia.gov/v2/?api_key="+encodeURIComponent(eia),
      {headers:{Accept:"application/json"}},
      Boolean(eia)
    ),
    probe(
      "https://api.wto.org/timeseries/v1/indicator_categories?lang=1",
      {headers:{Accept:"application/json","Ocp-Apim-Subscription-Key":wto}},
      Boolean(wto)
    ),
    probe(
      "https://comtradeapi.un.org/data/v1/getLiveUpdate?subscription-key="+encodeURIComponent(comtrade),
      {headers:{Accept:"application/json"}},
      Boolean(comtrade)
    ),
    probe(
      "https://population.un.org/dataportalapi/api/v1/Indicators?pageSize=1",
      {headers:{Accept:"application/json",Authorization:"Bearer "+population}},
      Boolean(population)
    )
  ]);

  return NextResponse.json({
    fred:checks[0],
    eia:checks[1],
    wto:checks[2],
    comtrade:checks[3],
    unPopulation:checks[4],
    checkedAt:new Date().toISOString()
  });
}
