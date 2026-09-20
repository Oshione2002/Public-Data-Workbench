export type SeriesCatalogItem = {
  id:string;
  concept:string;
  title:string;
  provider:string;
  providerId:string;
  indicator:string;
  unit:string;
  frequency:string;
  description:string;
  normalized:boolean;
};

export const catalog:SeriesCatalogItem[] = [
  { id:"wb-gdp-growth", concept:"gdp-growth", title:"GDP growth (annual %)", provider:"World Bank", providerId:"world-bank", indicator:"NY.GDP.MKTP.KD.ZG", unit:"Percent", frequency:"Annual", description:"Annual percentage growth rate of GDP at market prices based on constant local currency.", normalized:true },
  { id:"imf-gdp-growth", concept:"gdp-growth", title:"Real GDP growth", provider:"IMF", providerId:"imf", indicator:"NGDP_RPCH", unit:"Percent change", frequency:"Annual", description:"Real gross domestic product growth from IMF DataMapper.", normalized:true },
  { id:"wb-inflation", concept:"inflation", title:"Inflation, consumer prices (annual %)", provider:"World Bank", providerId:"world-bank", indicator:"FP.CPI.TOTL.ZG", unit:"Percent", frequency:"Annual", description:"Annual percentage change in consumer prices.", normalized:true },
  { id:"imf-inflation", concept:"inflation", title:"Inflation rate, average consumer prices", provider:"IMF", providerId:"imf", indicator:"PCPIPCH", unit:"Percent change", frequency:"Annual", description:"Average consumer-price inflation from IMF DataMapper.", normalized:true },
  { id:"imf-unemployment", concept:"unemployment", title:"Unemployment rate", provider:"IMF", providerId:"imf", indicator:"LUR", unit:"Percent", frequency:"Annual", description:"Unemployment rate from IMF DataMapper.", normalized:true },
  { id:"wb-unemployment", concept:"unemployment", title:"Unemployment, total (% of total labour force)", provider:"World Bank", providerId:"world-bank", indicator:"SL.UEM.TOTL.ZS", unit:"Percent", frequency:"Annual", description:"Share of the labour force without work, based on modelled estimates where applicable.", normalized:true },
  { id:"wb-remittances", concept:"remittances", title:"Personal remittances, received (% of GDP)", provider:"World Bank", providerId:"world-bank", indicator:"BX.TRF.PWKR.DT.GD.ZS", unit:"Percent of GDP", frequency:"Annual", description:"Personal remittances received as a share of GDP.", normalized:true },
  { id:"wb-gfcf", concept:"capital-formation", title:"Gross capital formation (% of GDP)", provider:"World Bank", providerId:"world-bank", indicator:"NE.GDI.TOTL.ZS", unit:"Percent of GDP", frequency:"Annual", description:"Gross capital formation as a share of GDP.", normalized:true },
  { id:"wb-trade", concept:"trade-openness", title:"Trade (% of GDP)", provider:"World Bank", providerId:"world-bank", indicator:"NE.TRD.GNFS.ZS", unit:"Percent of GDP", frequency:"Annual", description:"Sum of exports and imports of goods and services as a share of GDP.", normalized:true },
  { id:"wb-exchange", concept:"exchange-rate", title:"Official exchange rate (LCU per US$, period average)", provider:"World Bank", providerId:"world-bank", indicator:"PA.NUS.FCRF", unit:"Local currency per US$", frequency:"Annual", description:"Official exchange rate, period average.", normalized:true },
  { id:"wb-fdi", concept:"fdi", title:"Foreign direct investment, net inflows (% of GDP)", provider:"World Bank", providerId:"world-bank", indicator:"BX.KLT.DINV.WD.GD.ZS", unit:"Percent of GDP", frequency:"Annual", description:"Net FDI inflows as a percentage of GDP.", normalized:true },
  { id:"wb-population", concept:"population", title:"Population, total", provider:"World Bank", providerId:"world-bank", indicator:"SP.POP.TOTL", unit:"People", frequency:"Annual", description:"Total population.", normalized:true },
  { id:"imf-debt", concept:"government-debt", title:"General government gross debt", provider:"IMF", providerId:"imf", indicator:"GGXWDG_NGDP", unit:"Percent of GDP", frequency:"Annual", description:"General government gross debt as a share of GDP.", normalized:true },
  { id:"imf-current-account", concept:"current-account", title:"Current account balance", provider:"IMF", providerId:"imf", indicator:"BCA_NGDPD", unit:"Percent of GDP", frequency:"Annual", description:"Current account balance as a share of GDP.", normalized:true }
];

export function searchCatalog(q:string){
  const term=q.trim().toLowerCase();
  if(!term) return catalog;
  const tokens=term.split(/\s+/).filter(Boolean);
  return catalog
    .map(item=>{
      const hay=[item.title,item.concept,item.provider,item.indicator,item.description,item.unit].join(" ").toLowerCase();
      const score=tokens.reduce((n,t)=>n+(hay.includes(t)?1:0),0);
      return {item,score};
    })
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score)
    .map(x=>x.item);
}
