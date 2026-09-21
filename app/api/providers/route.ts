import { NextResponse } from "next/server";
import { isConfigured, providers } from "@/lib/providers";

export async function GET(){
  return NextResponse.json({
    providers:providers.map(p=>({
      id:p.id,name:p.name,shortName:p.shortName,description:p.description,
      protocol:p.protocol,mode:p.mode,docs:p.docs,frequencies:p.frequencies,
      queryable:Boolean(p.apiBase),configured:isConfigured(p)
    }))
  });
}
