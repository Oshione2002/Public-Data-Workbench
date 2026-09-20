import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";

export const runtime="nodejs";

function safePath(value:string){
  const path=value.replace(/^\/+/, "");
  if(!path || path.includes("://") || path.includes("..") || path.includes("\\")) return null;
  return path;
}

export async function GET(request:NextRequest,{params}:{params:Promise<{provider:string}>}){
  const {provider:providerId}=await params;
  const provider=getProvider(providerId);
  if(!provider) return NextResponse.json({error:"Unknown provider."},{status:404});
  if(!provider.apiBase) return NextResponse.json({
    error:"This provider is registered, but a verified public base endpoint is not configured in the workbench. Use the official portal.",
    docs:provider.docs
  },{status:400});

  const rawPath=request.nextUrl.searchParams.get("path")||"";
  const path=safePath(rawPath);
  if(!path) return NextResponse.json({error:"Provide a relative API path, for example ?path=indicator/NY.GDP.MKTP.CD."},{status:400});

  const target=new URL(provider.apiBase.replace(/\/$/,"")+"/"+path);
  request.nextUrl.searchParams.forEach((value,key)=>{
    if(key!=="path") target.searchParams.append(key,value);
  });

  const headers=new Headers({Accept:request.headers.get("accept")||"application/json, text/csv;q=0.9, */*;q=0.8"});
  if(provider.id==="imf"){
    headers.set("User-Agent","PublicDataWorkbench/1.0 (+https://github.com/Oshione2002/Public-Data-Workbench)");
  }
  if(provider.mode==="keyed"){
    const key=provider.keyEnv?process.env[provider.keyEnv]:"";
    if(!key) return NextResponse.json({error:`${provider.shortName} requires a server-side API key.`,docs:provider.docs},{status:503});
    if(provider.keyPlacement==="query") target.searchParams.set(provider.keyName||"api_key",key);
    if(provider.keyPlacement==="subscription-header") headers.set(provider.keyName||"Ocp-Apim-Subscription-Key",key);
    if(provider.keyPlacement==="bearer") headers.set("Authorization","Bearer "+key);
  }

  try{
    const upstream=await fetch(target,{headers,cache:"no-store",signal:AbortSignal.timeout(25000)});
    const length=Number(upstream.headers.get("content-length")||0);
    if(length>6_000_000) return NextResponse.json({error:"Response is larger than the workbench proxy limit. Narrow the query."},{status:413});
    const body=await upstream.arrayBuffer();
    if(body.byteLength>6_000_000) return NextResponse.json({error:"Response is larger than the workbench proxy limit. Narrow the query."},{status:413});
    return new NextResponse(body,{
      status:upstream.status,
      headers:{
        "content-type":upstream.headers.get("content-type")||"application/octet-stream",
        "cache-control":"no-store"
      }
    });
  }catch(error){
    return NextResponse.json({error:"Provider request failed.",detail:error instanceof Error?error.message:"Unknown error"},{status:502});
  }
}
