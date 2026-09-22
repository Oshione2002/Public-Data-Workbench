import { describe, expect, it } from "vitest";
import { sortAndDedupe } from "@/lib/federated-catalog";
import { buildSdmxDataUrl } from "@/lib/sdmx";
import type { SeriesCatalogItem } from "@/lib/catalog";

function item(overrides:Partial<SeriesCatalogItem>):SeriesCatalogItem{
  return {
    id:"id",concept:"test",title:"Title",provider:"Provider",providerId:"provider",
    indicator:"CODE",unit:"Unit",frequency:"Annual",description:"Definition",normalized:true,
    ...overrides
  };
}

describe("catalogue ordering",()=>{
  it("sorts case-insensitively by title, provider, then code and removes duplicates",()=>{
    const result=sortAndDedupe([
      item({id:"2",title:"beta",provider:"Zed",indicator:"B"}),
      item({id:"1",title:"Alpha",provider:"Zed",indicator:"C"}),
      item({id:"3",title:"alpha",provider:"Able",indicator:"D"}),
      item({id:"4",title:"alpha",provider:"Able",indicator:"A"}),
      item({id:"5",title:"alpha",provider:"Able",indicator:"A"})
    ]);
    expect(result.map(value=>`${value.title}|${value.provider}|${value.indicator}`)).toEqual([
      "alpha|Able|A","alpha|Able|D","Alpha|Zed|C","beta|Zed|B"
    ]);
  });
});

describe("SDMX keys",()=>{
  it("orders dimensions and substitutes the workspace country",()=>{
    const url=buildSdmxDataUrl(item({
      provider:"OECD",providerId:"oecd",dataset:"FLOW",datasetVersion:"1.0",agency:"AGENCY",
      dimensions:{"3:FREQ":"A","1:REF_AREA":"__COUNTRY__","2:MEASURE":"GDP"}
    }),"NGA",2000,2020);
    expect(decodeURIComponent(url.pathname)).toContain("AGENCY,FLOW,1.0/NGA.GDP.A");
    expect(url.searchParams.get("startPeriod")).toBe("2000");
    expect(url.searchParams.get("endPeriod")).toBe("2020");
  });

  it("rejects unresolved dataset metadata",()=>{
    expect(()=>buildSdmxDataUrl(item({providerId:"oecd"}),"NGA",2000,2020)).toThrow(/complete SDMX key/);
  });
});
