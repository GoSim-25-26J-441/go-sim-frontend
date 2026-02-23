export interface GenericRegion {
  id: string;
  displayName: string;
  aws: string;
  azure: string;
}

export const GENERIC_REGIONS: GenericRegion[] = [
  // ——— US ———
  {
    id: "us-east-n-virginia",
    displayName: "US East (N. Virginia / East US)",
    aws: "useastn.virginia",
    azure: "eastus",
  },
  {
    id: "us-east-ohio",
    displayName: "US East 2 (Ohio / East US 2)",
    aws: "useastohio",
    azure: "eastus2",
  },
  {
    id: "us-east-atlanta",
    displayName: "US East (Atlanta)",
    aws: "useastatlanta",
    azure: "eastus",
  },
  {
    id: "us-east-boston",
    displayName: "US East (Boston)",
    aws: "useastboston",
    azure: "eastus",
  },
  {
    id: "us-east-chicago",
    displayName: "US East (Chicago / N. Central US)",
    aws: "useastchicago",
    azure: "northcentralus",
  },
  {
    id: "us-east-dallas",
    displayName: "US East (Dallas / South Central US)",
    aws: "useastdallas",
    azure: "southcentralus",
  },
  {
    id: "us-east-houston",
    displayName: "US East (Houston)",
    aws: "useasthouston",
    azure: "southcentralus",
  },
  {
    id: "us-east-miami",
    displayName: "US East (Miami)",
    aws: "useastmiami",
    azure: "eastus",
  },
  {
    id: "us-east-minneapolis",
    displayName: "US East (Minneapolis)",
    aws: "useastminneapolis",
    azure: "northcentralus",
  },
  {
    id: "us-east-new-york",
    displayName: "US East (New York City)",
    aws: "useastnewyorkcity",
    azure: "eastus",
  },
  {
    id: "us-east-philadelphia",
    displayName: "US East (Philadelphia)",
    aws: "useastphiladelphia",
    azure: "eastus",
  },
  {
    id: "us-southeast",
    displayName: "US Southeast (Southeast US)",
    aws: "useastmiami",
    azure: "southeastus",
  },
  {
    id: "us-west-oregon",
    displayName: "US West (Oregon / West US 2)",
    aws: "uswestoregon",
    azure: "westus2",
  },
  {
    id: "us-west-n-california",
    displayName: "US West (N. California / West US)",
    aws: "uswestn.california",
    azure: "westus",
  },
  {
    id: "us-west-central",
    displayName: "US West Central (West Central US)",
    aws: "uswestdenver",
    azure: "westcentralus",
  },
  {
    id: "us-west-denver",
    displayName: "US West (Denver)",
    aws: "uswestdenver",
    azure: "westcentralus",
  },
  {
    id: "us-west-seattle",
    displayName: "US West (Seattle)",
    aws: "uswestseattle",
    azure: "westus2",
  },
  {
    id: "us-west-los-angeles",
    displayName: "US West (Los Angeles)",
    aws: "uswestlosangeles",
    azure: "westus",
  },
  {
    id: "us-west-phoenix",
    displayName: "US West (Phoenix)",
    aws: "uswestphoenix",
    azure: "westus3",
  },
  {
    id: "us-west-portland",
    displayName: "US West (Portland)",
    aws: "uswestportland",
    azure: "portland",
  },
  {
    id: "us-west-las-vegas",
    displayName: "US West (Las Vegas)",
    aws: "uswestlasvegas",
    azure: "westus3",
  },
  {
    id: "us-west-honolulu",
    displayName: "US West (Honolulu)",
    aws: "uswesthonolulu",
    azure: "westus3",
  },
  {
    id: "us-gov-east",
    displayName: "US Gov (East / Virginia)",
    aws: "awsgovcloudus-east",
    azure: "usgovvirginia",
  },
  {
    id: "us-gov-west",
    displayName: "US Gov (West)",
    aws: "awsgovcloudus-west",
    azure: "usgoviowa",
  },

  // ——— Canada ———
  {
    id: "canada-central",
    displayName: "Canada Central",
    aws: "canadacentral",
    azure: "canadacentral",
  },
  {
    id: "canada-east",
    displayName: "Canada East",
    aws: "canadacentral",
    azure: "canadaeast",
  },
  {
    id: "canada-calgary",
    displayName: "Canada West (Calgary)",
    aws: "canadawestcalgary",
    azure: "canadacentral",
  },
  {
    id: "canada-toronto-bell",
    displayName: "Canada (Toronto / Bell)",
    aws: "canadabell-toronto",
    azure: "canadacentral",
  },

  // ——— South America ———
  {
    id: "south-america-sao-paulo",
    displayName: "South America (São Paulo / Brazil South)",
    aws: "southamericasaopaulo",
    azure: "brazilsouth",
  },
  {
    id: "brazil-southeast",
    displayName: "Brazil Southeast",
    aws: "southamericasaopaulo",
    azure: "brazilsoutheast",
  },
  {
    id: "argentina-buenos-aires",
    displayName: "Argentina (Buenos Aires)",
    aws: "argentinabuenosaires",
    azure: "brazilsouth",
  },
  {
    id: "chile-santiago",
    displayName: "Chile (Santiago / Central)",
    aws: "chilesantiago",
    azure: "chilecentral",
  },
  {
    id: "peru-lima",
    displayName: "Peru (Lima)",
    aws: "perulima",
    azure: "brazilsouth",
  },

  // ——— Europe ———
  {
    id: "europe-west-ireland",
    displayName: "Europe West (Ireland / West Europe)",
    aws: "euireland",
    azure: "westeurope",
  },
  {
    id: "europe-north-stockholm",
    displayName: "Europe North (Stockholm / North Europe)",
    aws: "eustockholm",
    azure: "northeurope",
  },
  {
    id: "europe-central-frankfurt",
    displayName: "Europe Central (Frankfurt / Germany West Central)",
    aws: "eufrankfurt",
    azure: "germanywestcentral",
  },
  {
    id: "europe-uk-london",
    displayName: "UK (London / UK South)",
    aws: "eulondon",
    azure: "uksouth",
  },
  {
    id: "europe-uk-west",
    displayName: "UK West",
    aws: "eulondon",
    azure: "ukwest",
  },
  {
    id: "europe-uk-manchester-bt",
    displayName: "UK (Manchester / BT)",
    aws: "europebritishtelecom-manchester",
    azure: "uksouth",
  },
  {
    id: "europe-paris",
    displayName: "Europe (Paris / France Central)",
    aws: "euparis",
    azure: "francecentral",
  },
  {
    id: "europe-france-south",
    displayName: "France South",
    aws: "euparis",
    azure: "francesouth",
  },
  {
    id: "europe-milan",
    displayName: "Europe (Milan / Italy North)",
    aws: "eumilan",
    azure: "italynorth",
  },
  {
    id: "europe-spain",
    displayName: "Europe (Spain / Spain Central)",
    aws: "europespain",
    azure: "spaincentral",
  },
  {
    id: "europe-zurich",
    displayName: "Switzerland (Zurich / Switzerland North)",
    aws: "europezurich",
    azure: "switzerlandnorth",
  },
  {
    id: "europe-switzerland-west",
    displayName: "Switzerland West",
    aws: "europezurich",
    azure: "switzerlandwest",
  },
  {
    id: "europe-germany-hamburg",
    displayName: "Germany (Hamburg / North)",
    aws: "germanyhamburg",
    azure: "germanynorth",
  },
  {
    id: "europe-vodafone-berlin",
    displayName: "Europe (Berlin / Vodafone)",
    aws: "europevodafone-berlin",
    azure: "germanywestcentral",
  },
  {
    id: "europe-vodafone-dortmund",
    displayName: "Europe (Dortmund / Vodafone)",
    aws: "europevodafone-dortmund",
    azure: "germanywestcentral",
  },
  {
    id: "europe-vodafone-london",
    displayName: "Europe (London / Vodafone)",
    aws: "europevodafone-london",
    azure: "uksouth",
  },
  {
    id: "europe-vodafone-manchester",
    displayName: "Europe (Manchester / Vodafone)",
    aws: "europevodafone-manchester",
    azure: "uksouth",
  },
  {
    id: "europe-vodafone-munich",
    displayName: "Europe (Munich / Vodafone)",
    aws: "europevodafone-munich",
    azure: "germanywestcentral",
  },
  {
    id: "europe-denmark",
    displayName: "Denmark (Copenhagen / East)",
    aws: "denmarkcopenhagen",
    azure: "denmarkeast",
  },
  {
    id: "europe-finland",
    displayName: "Finland (Helsinki)",
    aws: "finlandhelsinki",
    azure: "northeurope",
  },
  {
    id: "europe-norway-east",
    displayName: "Norway East",
    aws: "eustockholm",
    azure: "norwayeast",
  },
  {
    id: "europe-norway-west",
    displayName: "Norway West",
    aws: "eustockholm",
    azure: "norwaywest",
  },
  {
    id: "europe-poland",
    displayName: "Poland (Warsaw / Central)",
    aws: "polandwarsaw",
    azure: "polandcentral",
  },
  {
    id: "europe-austria",
    displayName: "Austria East",
    aws: "eufrankfurt",
    azure: "austriaeast",
  },
  {
    id: "europe-belgium",
    displayName: "Belgium Central",
    aws: "euireland",
    azure: "belgiumcentral",
  },
  {
    id: "europe-sweden-central",
    displayName: "Sweden Central",
    aws: "eustockholm",
    azure: "swedencentral",
  },
  {
    id: "europe-sweden-south",
    displayName: "Sweden South",
    aws: "eustockholm",
    azure: "swedensouth",
  },

  // ——— Middle East & Africa ———
  {
    id: "middle-east-uae",
    displayName: "UAE (Middle East / UAE Central)",
    aws: "middleeastuae",
    azure: "uaecentral",
  },
  {
    id: "middle-east-uae-north",
    displayName: "UAE North",
    aws: "middleeastuae",
    azure: "uaenorth",
  },
  {
    id: "middle-east-bahrain",
    displayName: "Middle East (Bahrain)",
    aws: "middleeastbahrain",
    azure: "uaecentral",
  },
  {
    id: "middle-east-qatar",
    displayName: "Qatar Central",
    aws: "middleeastuae",
    azure: "qatarcentral",
  },
  {
    id: "middle-east-israel",
    displayName: "Israel (Tel Aviv / Central)",
    aws: "israeltelaviv",
    azure: "israelcentral",
  },
  {
    id: "middle-east-israel-nw",
    displayName: "Israel Northwest",
    aws: "israeltelaviv",
    azure: "israelnorthwest",
  },
  {
    id: "middle-east-oman",
    displayName: "Oman (Muscat)",
    aws: "omanmuscat",
    azure: "uaecentral",
  },
  {
    id: "africa-south-north",
    displayName: "South Africa North",
    aws: "africacapetown",
    azure: "southafricanorth",
  },
  {
    id: "africa-south-west",
    displayName: "South Africa West / Cape Town",
    aws: "africacapetown",
    azure: "southafricawest",
  },
  {
    id: "africa-nigeria",
    displayName: "Nigeria (Lagos)",
    aws: "nigerialagos",
    azure: "southafricanorth",
  },
  {
    id: "africa-morocco",
    displayName: "Morocco (Casablanca)",
    aws: "moroccocasablanca",
    azure: "westeurope",
  },
  {
    id: "africa-senegal",
    displayName: "Senegal (Dakar)",
    aws: "senegaldakar",
    azure: "westeurope",
  },

  // ——— Asia Pacific ———
  {
    id: "asia-singapore",
    displayName: "Asia Pacific (Singapore / Southeast Asia)",
    aws: "asiapacificsingapore",
    azure: "southeastasia",
  },
  {
    id: "asia-singapore-sgx",
    displayName: "Singapore (SGX)",
    aws: "asiapacificsingapore",
    azure: "sgxsingapore1",
  },
  {
    id: "asia-tokyo",
    displayName: "Asia Pacific (Tokyo / Japan East)",
    aws: "asiapacifictokyo",
    azure: "japaneast",
  },
  {
    id: "asia-japan-west",
    displayName: "Japan West",
    aws: "asiapacificosaka",
    azure: "japanwest",
  },
  {
    id: "asia-osaka",
    displayName: "Asia Pacific (Osaka)",
    aws: "asiapacificosaka",
    azure: "japanwest",
  },
  {
    id: "asia-kddi-osaka",
    displayName: "Japan (Osaka / KDDI)",
    aws: "asiapacifickddi-osaka",
    azure: "japaneast",
  },
  {
    id: "asia-kddi-tokyo",
    displayName: "Japan (Tokyo / KDDI)",
    aws: "asiapacifickddi-tokyo",
    azure: "japaneast",
  },
  {
    id: "asia-sydney",
    displayName: "Asia Pacific (Sydney / Australia East)",
    aws: "asiapacificsydney",
    azure: "australiaeast",
  },
  {
    id: "asia-melbourne",
    displayName: "Australia (Melbourne)",
    aws: "asiapacificmelbourne",
    azure: "australiasoutheast",
  },
  {
    id: "asia-perth",
    displayName: "Australia (Perth)",
    aws: "australiaperth",
    azure: "australiacentral",
  },
  {
    id: "asia-australia-central",
    displayName: "Australia Central",
    aws: "asiapacificsydney",
    azure: "australiacentral",
  },
  {
    id: "asia-australia-central-2",
    displayName: "Australia Central 2",
    aws: "asiapacificsydney",
    azure: "australiacentral2",
  },
  {
    id: "asia-hong-kong",
    displayName: "Asia Pacific (Hong Kong / East Asia)",
    aws: "asiapacifichongkong",
    azure: "eastasia",
  },
  {
    id: "asia-seoul",
    displayName: "Asia Pacific (Seoul / Korea Central)",
    aws: "asiapacificseoul",
    azure: "koreacentral",
  },
  {
    id: "asia-korea-south",
    displayName: "Korea South",
    aws: "asiapacificseoul",
    azure: "koreasouth",
  },
  {
    id: "asia-skt-seoul",
    displayName: "South Korea (Seoul / SKT)",
    aws: "asiapacificskt-seoul",
    azure: "koreacentral",
  },
  {
    id: "asia-skt-daejeon",
    displayName: "South Korea (Daejeon / SKT)",
    aws: "asiapacificskt-daejeon",
    azure: "koreacentral",
  },
  {
    id: "asia-mumbai",
    displayName: "Asia Pacific (Mumbai / Central India)",
    aws: "asiapacificmumbai",
    azure: "centralindia",
  },
  {
    id: "asia-hyderabad",
    displayName: "India (Hyderabad)",
    aws: "asiapacifichyderabad",
    azure: "centralindia",
  },
  {
    id: "asia-delhi",
    displayName: "India (Delhi)",
    aws: "indiadelhi",
    azure: "centralindia",
  },
  {
    id: "asia-kolkata",
    displayName: "India (Kolkata)",
    aws: "indiakolkata",
    azure: "eastasia",
  },
  {
    id: "asia-south-india",
    displayName: "South India",
    aws: "asiapacificmumbai",
    azure: "southindia",
  },
  {
    id: "asia-west-india",
    displayName: "West India",
    aws: "asiapacificmumbai",
    azure: "westindia",
  },
  {
    id: "asia-jio-central",
    displayName: "India (Jio Central)",
    aws: "asiapacificmumbai",
    azure: "jioindiacentral",
  },
  {
    id: "asia-jio-west",
    displayName: "India (Jio West)",
    aws: "asiapacificmumbai",
    azure: "jioindiawest",
  },
  {
    id: "asia-jakarta",
    displayName: "Indonesia (Jakarta / Central)",
    aws: "asiapacificjakarta",
    azure: "indonesiacentral",
  },
  {
    id: "asia-malaysia",
    displayName: "Malaysia",
    aws: "asiapacificmalaysia",
    azure: "malaysiawest",
  },
  {
    id: "asia-taipei",
    displayName: "Taiwan (Taipei)",
    aws: "asiapacifictaipei",
    azure: "eastasia",
  },
  {
    id: "asia-taiwan-taipei",
    displayName: "Taiwan Taipei",
    aws: "taiwantaipei",
    azure: "eastasia",
  },
  {
    id: "asia-thailand",
    displayName: "Thailand",
    aws: "asiapacificthailand",
    azure: "southeastasia",
  },
  {
    id: "asia-bangkok",
    displayName: "Thailand (Bangkok)",
    aws: "thailandbangkok",
    azure: "southeastasia",
  },
  {
    id: "asia-philippines",
    displayName: "Philippines (Manila)",
    aws: "philippinesmanila",
    azure: "southeastasia",
  },
  {
    id: "asia-new-zealand",
    displayName: "New Zealand (Auckland / North)",
    aws: "newzealandauckland",
    azure: "newzealandnorth",
  },
  {
    id: "asia-new-zealand-aws",
    displayName: "New Zealand (AWS)",
    aws: "asiapacificnewzealand",
    azure: "newzealandnorth",
  },

  // ——— China (special / sovereign) ———
  {
    id: "china-beijing",
    displayName: "China (Beijing)",
    aws: "chinabeijing",
    azure: "eastasia",
  },
  {
    id: "china-ningxia",
    displayName: "China (Ningxia)",
    aws: "chinaningxia",
    azure: "eastasia",
  },
  {
    id: "china-beijing-autocloud",
    displayName: "China (Beijing / Auto Cloud)",
    aws: "chinaautocloudbeijing",
    azure: "eastasia",
  },

  // ——— Mexico ———
  {
    id: "mexico-central",
    displayName: "Mexico Central",
    aws: "mexicocentral",
    azure: "mexicocentral",
  },
  {
    id: "mexico-queretaro",
    displayName: "Mexico (Queretaro)",
    aws: "mexicoqueretaro",
    azure: "mexicocentral",
  },

  // ——— US carrier / special ———
  {
    id: "us-att-atlanta",
    displayName: "US (AT&T Atlanta)",
    aws: "useastatlanta",
    azure: "attatlanta1",
  },
  {
    id: "us-att-dallas",
    displayName: "US (AT&T Dallas)",
    aws: "useastdallas",
    azure: "attdallas1",
  },
  {
    id: "us-att-detroit",
    displayName: "US (AT&T Detroit)",
    aws: "useastminneapolis",
    azure: "attdetroit1",
  },
  {
    id: "us-att-new-york",
    displayName: "US (AT&T New York)",
    aws: "useastnewyorkcity",
    azure: "attnewyork1",
  },
  {
    id: "us-gov-arizona",
    displayName: "US Gov Arizona",
    aws: "awsgovcloudus-west",
    azure: "usgovarizona",
  },
  {
    id: "us-gov-texas",
    displayName: "US Gov Texas",
    aws: "awsgovcloudus-west",
    azure: "usgovtexas",
  },
];

export function getGenericRegionById(id: string): GenericRegion | undefined {
  return GENERIC_REGIONS.find((r) => r.id === id);
}

export function getRegionCodeForProvider(
  genericRegionId: string,
  provider: "aws" | "azure",
): string | undefined {
  const region = getGenericRegionById(genericRegionId);
  if (!region) return undefined;
  return provider === "aws" ? region.aws : region.azure;
}
