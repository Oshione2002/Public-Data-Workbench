export type ProviderProtocol = "rest" | "sdmx" | "bulk";
export type ProviderMode = "live" | "keyed" | "portal";

export type Provider = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  protocol: ProviderProtocol;
  mode: ProviderMode;
  apiBase?: string;
  docs: string;
  keyEnv?: string;
  keyPlacement?: "query" | "subscription-header" | "bearer";
  keyName?: string;
};

export const providers: Provider[] = [
  { id:"world-bank", name:"World Bank", shortName:"World Bank", description:"Development, macroeconomic, social, demographic and environmental indicators.", protocol:"rest", mode:"live", apiBase:"https://api.worldbank.org/v2", docs:"https://datahelpdesk.worldbank.org/knowledgebase/articles/889392" },
  { id:"imf", name:"International Monetary Fund", shortName:"IMF", description:"Macroeconomic, fiscal, external-sector and financial indicators through the IMF Data Portal SDMX APIs.", protocol:"sdmx", mode:"live", apiBase:"https://api.imf.org/external/sdmx/3.0", docs:"https://data.imf.org/en/Resource-Pages/IMF-API" },
  { id:"ilo", name:"International Labour Organization", shortName:"ILO", description:"Employment, unemployment, wages, occupations and labour-force statistics.", protocol:"sdmx", mode:"live", apiBase:"https://www.ilo.org/sdmx/rest", docs:"https://www.ilo.org/resource/other/ilostat-sdmx-user-guide" },
  { id:"oecd", name:"Organisation for Economic Co-operation and Development", shortName:"OECD", description:"Economic, tax, labour, trade, education, health and productivity statistics.", protocol:"sdmx", mode:"live", apiBase:"https://sdmx.oecd.org/public/rest", docs:"https://www.oecd.org/en/data/insights/data-explainers/2024/09/api.html" },
  { id:"eurostat", name:"Eurostat", shortName:"Eurostat", description:"European economic, demographic, labour, energy, trade and regional statistics.", protocol:"rest", mode:"live", apiBase:"https://ec.europa.eu/eurostat/api/dissemination", docs:"https://ec.europa.eu/eurostat/data/web-services" },
  { id:"unicef", name:"UNICEF Data Warehouse", shortName:"UNICEF", description:"Children, health, nutrition, education, WASH and child-protection indicators.", protocol:"sdmx", mode:"live", apiBase:"https://sdmx.data.unicef.org/ws/public/sdmxapi/rest", docs:"https://data.unicef.org/sdmx-api-documentation/" },
  { id:"unesco", name:"UNESCO Institute for Statistics", shortName:"UNESCO UIS", description:"Education, literacy, science, culture and research statistics.", protocol:"rest", mode:"live", apiBase:"https://api.uis.unesco.org/api/public", docs:"https://api.uis.unesco.org/api/public/documentation/" },
  { id:"undp", name:"United Nations Development Programme", shortName:"UNDP", description:"Human development, inequality, gender and poverty indicators.", protocol:"rest", mode:"portal", docs:"https://hdr.undp.org/data-center/documentation-and-downloads" },
  { id:"fao", name:"Food and Agriculture Organization", shortName:"FAO", description:"FAOSTAT agriculture, food, prices, trade, land, emissions and food-security data.", protocol:"rest", mode:"portal", docs:"https://www.fao.org/faostat/en/" },
  { id:"wto", name:"World Trade Organization", shortName:"WTO", description:"Merchandise trade, services trade, tariffs and trade-policy statistics.", protocol:"rest", mode:"keyed", docs:"https://apiportal.wto.org/", keyEnv:"WTO_API_KEY", keyPlacement:"subscription-header", keyName:"Ocp-Apim-Subscription-Key" },
  { id:"un-comtrade", name:"UN Comtrade", shortName:"UN Comtrade", description:"Bilateral merchandise and services trade by reporter, partner and commodity.", protocol:"rest", mode:"keyed", docs:"https://uncomtrade.org/docs/un-comtrade-api/", keyEnv:"COMTRADE_API_KEY", keyPlacement:"subscription-header", keyName:"Ocp-Apim-Subscription-Key" },
  { id:"sdg", name:"UN Sustainable Development Goals Database", shortName:"UN SDG", description:"Official global SDG indicators and disaggregated observations.", protocol:"rest", mode:"live", apiBase:"https://unstats.un.org/SDGAPI/v1/sdg", docs:"https://unstats.un.org/SDGAPI/swagger/" },
  { id:"unhcr", name:"UNHCR Refugee Statistics", shortName:"UNHCR", description:"Refugees, asylum seekers, internally displaced and stateless populations.", protocol:"rest", mode:"live", apiBase:"https://api.unhcr.org", docs:"https://api.unhcr.org/docs/refugee-statistics.html" },
  { id:"un-population", name:"UN Population Division", shortName:"UN Population", description:"Population, fertility, mortality, migration and age-structure indicators.", protocol:"rest", mode:"keyed", apiBase:"https://population.un.org/dataportalapi/api/v1", docs:"https://population.un.org/dataportalapi/index.html", keyEnv:"UN_POPULATION_TOKEN", keyPlacement:"bearer" },
  { id:"adb", name:"Asian Development Bank", shortName:"ADB", description:"Asian macroeconomic, trade, price, population, labour and SDG indicators.", protocol:"sdmx", mode:"portal", docs:"https://kidb.adb.org/api" },
  { id:"afdb", name:"African Development Bank", shortName:"AfDB", description:"African macroeconomic, demographic, agricultural and infrastructure indicators.", protocol:"rest", mode:"portal", docs:"https://dataportal.opendataforafrica.org/dev/docs" },
  { id:"bis", name:"Bank for International Settlements", shortName:"BIS", description:"Banking, credit, debt securities, property prices, exchange rates and global liquidity.", protocol:"sdmx", mode:"live", apiBase:"https://stats.bis.org/api/v2", docs:"https://stats.bis.org/api-doc/v2/" },
  { id:"ecb", name:"European Central Bank", shortName:"ECB", description:"Interest rates, exchange rates, monetary, banking and euro-area financial statistics.", protocol:"sdmx", mode:"live", apiBase:"https://data-api.ecb.europa.eu/service", docs:"https://data.ecb.europa.eu/help/getting-data-web-services-sdmx-0" },
  { id:"fred", name:"Federal Reserve Economic Data", shortName:"FRED", description:"Macroeconomic and financial time series from the St. Louis Fed and contributing institutions.", protocol:"rest", mode:"keyed", apiBase:"https://api.stlouisfed.org/fred", docs:"https://fred.stlouisfed.org/docs/api/fred/", keyEnv:"FRED_API_KEY", keyPlacement:"query", keyName:"api_key" },
  { id:"eia", name:"U.S. Energy Information Administration", shortName:"EIA", description:"Oil, gas, electricity, coal, energy prices and emissions data.", protocol:"rest", mode:"keyed", apiBase:"https://api.eia.gov/v2", docs:"https://www.eia.gov/opendata/documentation.php", keyEnv:"EIA_API_KEY", keyPlacement:"query", keyName:"api_key" },
  { id:"unctad", name:"UNCTADstat", shortName:"UNCTAD", description:"Trade, FDI, maritime transport, commodities and development statistics.", protocol:"bulk", mode:"portal", docs:"https://unctadstat.unctad.org/EN/" }
];

export function getProvider(id:string){ return providers.find(p=>p.id===id); }
export function isConfigured(provider:Provider){
  if(provider.mode!=="keyed") return true;
  return Boolean(provider.keyEnv && process.env[provider.keyEnv]);
}
