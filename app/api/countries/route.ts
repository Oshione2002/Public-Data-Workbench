import { NextResponse } from "next/server";

export const runtime="nodejs";

export async function GET(){
  const url=new URL("https://api.worldbank.org/v2/country");
  url.searchParams.set("format","json");
  url.searchParams.set("per_page","400");

  try{
    const response=await fetch(url,{
      next:{revalidate:86400},
      signal:AbortSignal.timeout(12000)
    });

    if(!response.ok){
      return NextResponse.json({error:"Country list provider returned HTTP "+response.status},{status:502});
    }

    const payload:any=await response.json();
    const rows=Array.isArray(payload)&&Array.isArray(payload[1])?payload[1]:[];

    const countries=rows
      .filter((row:any)=>row?.id&&row?.name&&row?.region?.value&&row.region.value!=="Aggregates")
      .map((row:any)=>({
        code:String(row.id).toUpperCase(),
        iso2:String(row.iso2Code||"").toUpperCase(),
        name:String(row.name),
        region:String(row.region?.value||""),
        incomeLevel:String(row.incomeLevel?.value||"")
      }))
      .sort((a:any,b:any)=>a.name.localeCompare(b.name));

    return NextResponse.json({countries,source:"World Bank country metadata"});
  }catch(error){
    return NextResponse.json({
      error:error instanceof Error?error.message:"Country list request failed"
    },{status:502});
  }
}
