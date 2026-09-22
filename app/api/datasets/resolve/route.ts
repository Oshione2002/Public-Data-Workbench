import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";
import type { SeriesCatalogItem } from "@/lib/catalog";
import type { DatasetDimension } from "@/lib/sdmx";

export const runtime="nodejs";

type Body={
  providerId:string;
  agency:string;
  dataset:string;
  datasetVersion?:string;
  datasetTitle?:string;
  dimensions:DatasetDimension[];
  selections:Record<string,string[]>;
  sourceUrl?:string;
};

function combinations(entries:[string,string[]][],limit=100){
  let rows:Record<string,string>[]=[{}];
  for(const [key,values] of entries){
    rows=rows.flatMap(row=>values.map(value=>({...row,[key]:value})));
    if(rows.length>limit) throw new Error(`Selection creates more than ${limit} series. Narrow one or more dimensions.`);
  }
  return rows;
}

export async function POST(request:NextRequest){
  try{
    const body=await request.json() as Body;
    const provider=getProvider(body.providerId);
    if(!provider) return NextResponse.json({error:"Unknown provider."},{status:404});
    if(!body.dataset||!Array.isArray(body.dimensions)) return NextResponse.json({error:"Dataset and dimensions are required."},{status:400});

    const selectable=body.dimensions.filter(dimension=>dimension.role!=="time"&&dimension.role!=="geography");
    const missing=selectable.filter(dimension=>!(body.selections[dimension.id]||[]).length);
    if(missing.length) return NextResponse.json({
      error:"Resolve every non-country dimension before adding a series.",
      missingDimensions:missing.map(dimension=>dimension.id)
    },{status:422});

    const rows=combinations(selectable.map(dimension=>[dimension.id,body.selections[dimension.id]]));
    const geography=body.dimensions.find(dimension=>dimension.role==="geography");
    const items=rows.map((selection,index)=>{
      const dimensions:Record<string,string>={};
      for(const dimension of body.dimensions){
        if(dimension.role==="time") continue;
        dimensions[`${dimension.position}:${dimension.id}`]=dimension.role==="geography"?"__COUNTRY__":selection[dimension.id];
      }
      const labels=selectable.map(dimension=>{
        const code=selection[dimension.id];
        return dimension.values.find(value=>value.code===code)?.label||code;
      });
      const frequencyDimension=selectable.find(dimension=>dimension.role==="frequency");
      const frequencyCode=frequencyDimension?selection[frequencyDimension.id]:"";
      const frequency=frequencyDimension?.values.find(value=>value.code===frequencyCode)?.label||frequencyCode||"Provider-defined";
      const indicator=Object.entries(selection).map(([key,value])=>`${key}=${value}`).join(";");
      return {
        id:`${body.providerId}-${body.dataset}-${Object.values(selection).join("-")}-${index}`,
        concept:"resolved-series",
        title:`${body.datasetTitle||body.dataset} — ${labels.filter(Boolean).join(" · ")}`,
        provider:provider.shortName,
        providerId:provider.id,
        indicator,
        unit:"See provider metadata",
        frequency,
        description:`Resolved ${provider.shortName} series from ${body.datasetTitle||body.dataset}.`,
        normalized:true,
        resultType:"series",
        selectable:true,
        sourceUrl:body.sourceUrl||provider.docs,
        dataset:body.dataset,
        datasetVersion:body.datasetVersion||"latest",
        agency:body.agency||"all",
        dimensions,
        geographyMode:geography?"country":"none",
        retrieval:"resolved"
      } satisfies SeriesCatalogItem;
    });
    return NextResponse.json({items,count:items.length});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Series resolution failed."},{status:400});
  }
}
