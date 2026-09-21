import { NextResponse } from "next/server";
import { providerCatalogueCounts } from "@/lib/federated-catalog";

export const runtime="nodejs";

export async function GET(){
  const sources=await providerCatalogueCounts();
  return NextResponse.json({
    sources,
    cap:1000,
    checkedAt:new Date().toISOString()
  });
}
