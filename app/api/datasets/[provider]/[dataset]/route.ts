import { NextRequest, NextResponse } from "next/server";
import { getDatasetStructure } from "@/lib/sdmx";
import { getProvider } from "@/lib/providers";

export const runtime="nodejs";

function decodeRouteValue(value:string){
  try{return decodeURIComponent(value);}catch{return value;}
}

export async function GET(
  request:NextRequest,
  {params}:{params:Promise<{provider:string;dataset:string}>}
){
  const raw=await params;
  const provider=decodeRouteValue(raw.provider);
  const dataset=decodeRouteValue(raw.dataset);
  const registered=getProvider(provider);
  if(!registered) return NextResponse.json({error:"Unknown provider."},{status:404});

  const agency=request.nextUrl.searchParams.get("agency")||"all";
  const version=request.nextUrl.searchParams.get("version")||"latest";
  try{
    const structure=await getDatasetStructure(provider,agency,dataset,version);
    return NextResponse.json(structure);
  }catch(error){
    return NextResponse.json({
      error:error instanceof Error?error.message:"Dataset structure request failed.",
      provider,
      dataset
    },{status:502});
  }
}
