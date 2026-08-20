export type CatalogIndustry = { id: string; name: string; slug: string };
export type CatalogFamily = { id: string; industryId: string; name: string };
export type CatalogTitle = { id: string; familyId: string; name: string };
export type CatalogSkill = { name: string; category: string; industry_slug: string | null };
export type CatalogLicense = { name: string; classes: string[] };

const industry = (slug: string) => `fallback:industry:${slug}`;
const family = (industrySlug: string, name: string) =>
  `fallback:family:${industrySlug}:${slugify(name)}`;
const title = (industrySlug: string, familyName: string, name: string) =>
  `fallback:title:${industrySlug}:${slugify(familyName)}:${slugify(name)}`;

export const FALLBACK_INDUSTRIES: CatalogIndustry[] = [
  {
    id: industry("logistics-transport"),
    name: "Logistics and Transport",
    slug: "logistics-transport",
  },
  {
    id: industry("finance-administration"),
    name: "Finance and Administration",
    slug: "finance-administration",
  },
  {
    id: industry("information-technology"),
    name: "Information Technology",
    slug: "information-technology",
  },
  { id: industry("sales-retail"), name: "Sales and Retail", slug: "sales-retail" },
  { id: industry("human-resources"), name: "Human Resources", slug: "human-resources" },
  {
    id: industry("manufacturing-operations"),
    name: "Manufacturing and Operations",
    slug: "manufacturing-operations",
  },
  {
    id: industry("agriculture-food-production"),
    name: "Agriculture and Food Production",
    slug: "agriculture-food-production",
  },
  {
    id: industry("health-social-care"),
    name: "Health and Social Care",
    slug: "health-social-care",
  },
  {
    id: industry("education-training"),
    name: "Education and Training",
    slug: "education-training",
  },
  {
    id: industry("hospitality-tourism"),
    name: "Hospitality and Tourism",
    slug: "hospitality-tourism",
  },
  {
    id: industry("construction-engineering"),
    name: "Construction and Engineering",
    slug: "construction-engineering",
  },
  { id: industry("banking-insurance"), name: "Banking and Insurance", slug: "banking-insurance" },
  { id: industry("legal-compliance"), name: "Legal and Compliance", slug: "legal-compliance" },
  { id: industry("media-creative"), name: "Media and Creative", slug: "media-creative" },
  {
    id: industry("nonprofit-development"),
    name: "Nonprofit and Development",
    slug: "nonprofit-development",
  },
  { id: industry("energy-utilities"), name: "Energy and Utilities", slug: "energy-utilities" },
  {
    id: industry("mining-extractives"),
    name: "Mining and Extractives",
    slug: "mining-extractives",
  },
  {
    id: industry("real-estate-property"),
    name: "Real Estate and Property",
    slug: "real-estate-property",
  },
  { id: industry("security-services"), name: "Security Services", slug: "security-services" },
  {
    id: industry("government-public-administration"),
    name: "Government and Public Administration",
    slug: "government-public-administration",
  },
  {
    id: industry("environment-conservation"),
    name: "Environment and Conservation",
    slug: "environment-conservation",
  },
  {
    id: industry("automotive-equipment"),
    name: "Automotive and Equipment",
    slug: "automotive-equipment",
  },
  { id: industry("telecommunications"), name: "Telecommunications", slug: "telecommunications" },
  {
    id: industry("pharmaceutical-laboratory"),
    name: "Pharmaceutical and Laboratory",
    slug: "pharmaceutical-laboratory",
  },
];

export const FALLBACK_FAMILIES: CatalogFamily[] = [
  ["logistics-transport", ["Warehouse", "Fleet", "Supply Chain", "Inventory", "Procurement"]],
  [
    "finance-administration",
    ["Accounting", "Financial Management", "Administration", "Audit and Risk", "Customer Service"],
  ],
  [
    "information-technology",
    ["Software", "Infrastructure", "Data and Analytics", "Product Support"],
  ],
  ["sales-retail", ["Store Operations", "Business Development", "Marketing", "Merchandising"]],
  [
    "human-resources",
    ["HR Generalist", "Recruitment", "Learning and Development", "Payroll and Benefits"],
  ],
  [
    "manufacturing-operations",
    ["Production", "Quality Assurance", "Maintenance", "Health and Safety"],
  ],
  [
    "agriculture-food-production",
    ["Farm Operations", "Extension Services", "Agribusiness", "Food Processing"],
  ],
  ["health-social-care", ["Clinical", "Nursing", "Pharmacy", "Community Health"]],
  [
    "education-training",
    ["Teaching", "School Administration", "Training and Facilitation", "Student Support"],
  ],
  ["hospitality-tourism", ["Front Office", "Food and Beverage", "Housekeeping", "Travel Services"]],
  [
    "construction-engineering",
    [
      "Civil Engineering",
      "Electrical and Mechanical",
      "Site Management",
      "Architecture and Design",
    ],
  ],
  [
    "banking-insurance",
    ["Retail Banking", "Credit and Risk", "Insurance", "Treasury and Investments"],
  ],
  ["legal-compliance", ["Legal Practice", "Compliance", "Governance", "Contracts"]],
  ["media-creative", ["Communications", "Design", "Digital Content", "Broadcasting"]],
  [
    "nonprofit-development",
    ["Programmes", "Monitoring and Evaluation", "Fundraising", "Community Development"],
  ],
  [
    "energy-utilities",
    ["Electrical Power", "Water and Sanitation", "Renewable Energy", "Operations"],
  ],
  [
    "mining-extractives",
    ["Geology", "Mine Operations", "Plant and Processing", "Safety and Environment"],
  ],
  ["real-estate-property", ["Property Management", "Estate Agency", "Facilities", "Valuation"]],
  ["security-services", ["Guarding Operations", "Investigations", "Security Systems"]],
  ["government-public-administration", ["Policy", "Public Finance", "Service Delivery"]],
  [
    "environment-conservation",
    ["Environmental Management", "Conservation Programmes", "Climate and Sustainability"],
  ],
  [
    "automotive-equipment",
    ["Vehicle Service", "Body and Paint", "Parts and Service Advisory", "Heavy Equipment"],
  ],
  ["telecommunications", ["Network Operations", "Field Services", "Commercial"]],
  [
    "pharmaceutical-laboratory",
    ["Laboratory Science", "Pharmacy", "Quality Assurance", "Regulatory Affairs"],
  ],
].flatMap(([industrySlug, names]) =>
  (names as string[]).map((name) => ({
    id: family(industrySlug as string, name),
    industryId: industry(industrySlug as string),
    name,
  })),
);

const titles: [string, string, string[]][] = [
  [
    "logistics-transport",
    "Warehouse",
    ["Warehouse Supervisor", "Warehouse Manager", "Stores Clerk"],
  ],
  ["logistics-transport", "Fleet", ["Fleet Manager", "Transport Coordinator", "Driver"]],
  ["logistics-transport", "Supply Chain", ["Supply Chain Officer", "Logistics Coordinator"]],
  ["logistics-transport", "Inventory", ["Inventory Controller"]],
  ["logistics-transport", "Procurement", ["Procurement Officer"]],
  [
    "finance-administration",
    "Accounting",
    ["Accounts Assistant", "Accounts Officer", "Management Accountant"],
  ],
  ["finance-administration", "Financial Management", ["Finance Manager", "Credit Controller"]],
  [
    "finance-administration",
    "Administration",
    ["Administrative Assistant", "Office Administrator"],
  ],
  ["finance-administration", "Audit and Risk", ["Internal Auditor"]],
  ["finance-administration", "Customer Service", ["Customer Service Officer"]],
  [
    "information-technology",
    "Software",
    ["Software Developer", "Frontend Developer", "Backend Developer"],
  ],
  ["information-technology", "Infrastructure", ["IT Support Technician", "Systems Administrator"]],
  ["information-technology", "Data and Analytics", ["Data Analyst"]],
  ["information-technology", "Product Support", ["Application Support Analyst"]],
  ["sales-retail", "Store Operations", ["Shop Manager", "Retail Supervisor", "Sales Assistant"]],
  [
    "sales-retail",
    "Business Development",
    ["Sales Representative", "Business Development Officer"],
  ],
  ["sales-retail", "Marketing", ["Marketing Officer"]],
  ["sales-retail", "Merchandising", ["Merchandiser"]],
  ["human-resources", "HR Generalist", ["Human Resources Officer", "Human Resources Manager"]],
  ["human-resources", "Recruitment", ["Recruitment Officer"]],
  ["human-resources", "Learning and Development", ["Training Coordinator"]],
  ["human-resources", "Payroll and Benefits", ["Payroll Officer"]],
  ["manufacturing-operations", "Production", ["Production Supervisor", "Machine Operator"]],
  ["manufacturing-operations", "Quality Assurance", ["Quality Control Officer"]],
  ["manufacturing-operations", "Maintenance", ["Maintenance Technician"]],
  ["manufacturing-operations", "Health and Safety", ["Health and Safety Officer"]],
  ["agriculture-food-production", "Farm Operations", ["Farm Manager", "Field Supervisor"]],
  ["agriculture-food-production", "Extension Services", ["Agricultural Extension Officer"]],
  ["agriculture-food-production", "Agribusiness", ["Agribusiness Officer"]],
  ["agriculture-food-production", "Food Processing", ["Food Processing Supervisor"]],
  ["health-social-care", "Clinical", ["Clinical Officer"]],
  ["health-social-care", "Nursing", ["Registered Nurse", "Nurse Midwife Technician"]],
  ["health-social-care", "Pharmacy", ["Pharmacy Technician"]],
  ["health-social-care", "Community Health", ["Community Health Worker"]],
  [
    "education-training",
    "Teaching",
    ["Primary School Teacher", "Secondary School Teacher", "Lecturer"],
  ],
  ["education-training", "School Administration", ["School Administrator"]],
  ["education-training", "Training and Facilitation", ["Training Facilitator"]],
  ["education-training", "Student Support", ["Student Support Officer"]],
  ["hospitality-tourism", "Front Office", ["Receptionist", "Front Office Supervisor"]],
  ["hospitality-tourism", "Food and Beverage", ["Restaurant Supervisor", "Chef"]],
  ["hospitality-tourism", "Housekeeping", ["Housekeeping Supervisor"]],
  ["hospitality-tourism", "Travel Services", ["Travel Consultant"]],
  [
    "construction-engineering",
    "Civil Engineering",
    ["Civil Engineer", "Quantity Surveyor", "Structural Engineer"],
  ],
  [
    "construction-engineering",
    "Electrical and Mechanical",
    ["Electrical Engineer", "Mechanical Engineer", "Maintenance Engineer"],
  ],
  [
    "construction-engineering",
    "Site Management",
    ["Construction Project Manager", "Site Supervisor", "Construction Foreman"],
  ],
  [
    "construction-engineering",
    "Architecture and Design",
    ["Architect", "CAD Technician", "Draughtsperson"],
  ],
  [
    "banking-insurance",
    "Retail Banking",
    ["Bank Teller", "Relationship Officer", "Branch Manager"],
  ],
  [
    "banking-insurance",
    "Credit and Risk",
    ["Credit Officer", "Risk Analyst", "Compliance Officer"],
  ],
  [
    "banking-insurance",
    "Insurance",
    ["Insurance Underwriter", "Claims Officer", "Insurance Broker"],
  ],
  ["banking-insurance", "Treasury and Investments", ["Treasury Analyst", "Investment Analyst"]],
  ["legal-compliance", "Legal Practice", ["Legal Counsel", "Legal Assistant", "Paralegal"]],
  ["legal-compliance", "Compliance", ["Compliance Officer", "Compliance Manager"]],
  ["legal-compliance", "Governance", ["Company Secretary", "Governance Officer"]],
  ["legal-compliance", "Contracts", ["Contracts Administrator", "Contracts Manager"]],
  ["media-creative", "Communications", ["Communications Officer", "Public Relations Officer"]],
  ["media-creative", "Design", ["Graphic Designer", "Creative Director"]],
  ["media-creative", "Digital Content", ["Content Writer", "Social Media Manager"]],
  ["media-creative", "Broadcasting", ["Radio Producer", "Video Producer"]],
  ["nonprofit-development", "Programmes", ["Programme Manager", "Project Coordinator"]],
  [
    "nonprofit-development",
    "Monitoring and Evaluation",
    ["Monitoring and Evaluation Officer", "Data Collection Officer"],
  ],
  ["nonprofit-development", "Fundraising", ["Fundraising Officer", "Grants Officer"]],
  [
    "nonprofit-development",
    "Community Development",
    ["Community Development Officer", "Field Officer"],
  ],
  ["energy-utilities", "Electrical Power", ["Power Systems Engineer", "Electrical Technician"]],
  ["energy-utilities", "Water and Sanitation", ["Water Engineer", "Sanitation Officer"]],
  ["energy-utilities", "Renewable Energy", ["Solar Technician", "Renewable Energy Engineer"]],
  ["energy-utilities", "Operations", ["Plant Operator", "Utilities Operations Manager"]],
  ["mining-extractives", "Geology", ["Geologist", "Exploration Geologist"]],
  ["mining-extractives", "Mine Operations", ["Mining Engineer", "Mine Supervisor"]],
  ["mining-extractives", "Plant and Processing", ["Process Plant Operator", "Metallurgist"]],
  [
    "mining-extractives",
    "Safety and Environment",
    ["Mine Safety Officer", "Environmental Officer"],
  ],
  ["real-estate-property", "Property Management", ["Property Manager", "Property Administrator"]],
  ["real-estate-property", "Estate Agency", ["Estate Agent", "Sales Negotiator"]],
  ["real-estate-property", "Facilities", ["Facilities Manager", "Facilities Officer"]],
  ["real-estate-property", "Valuation", ["Property Valuer", "Valuation Assistant"]],
  [
    "security-services",
    "Guarding Operations",
    ["Security Guard", "Security Supervisor", "Security Operations Manager"],
  ],
  ["security-services", "Investigations", ["Investigator", "Loss Prevention Officer"]],
  ["security-services", "Security Systems", ["CCTV Operator", "Security Systems Technician"]],
  ["government-public-administration", "Policy", ["Policy Analyst", "Policy Officer"]],
  [
    "government-public-administration",
    "Public Finance",
    ["Public Finance Officer", "Procurement Officer"],
  ],
  [
    "government-public-administration",
    "Service Delivery",
    ["Public Service Officer", "District Development Officer"],
  ],
  [
    "environment-conservation",
    "Environmental Management",
    ["Environmental Officer", "Environmental Impact Assessment Specialist"],
  ],
  [
    "environment-conservation",
    "Conservation Programmes",
    ["Conservation Officer", "Wildlife Officer"],
  ],
  [
    "environment-conservation",
    "Climate and Sustainability",
    ["Climate Change Officer", "Sustainability Manager"],
  ],
  ["automotive-equipment", "Vehicle Service", ["Automotive Technician", "Service Manager"]],
  ["automotive-equipment", "Body and Paint", ["Panel Beater", "Spray Painter"]],
  ["automotive-equipment", "Parts and Service Advisory", ["Parts Advisor", "Service Advisor"]],
  ["automotive-equipment", "Heavy Equipment", ["Heavy Equipment Mechanic", "Equipment Operator"]],
  [
    "telecommunications",
    "Network Operations",
    ["Network Engineer", "Network Operations Centre Technician"],
  ],
  ["telecommunications", "Field Services", ["Telecommunications Technician", "Fibre Technician"]],
  [
    "telecommunications",
    "Commercial",
    ["Telecommunications Sales Officer", "Customer Support Specialist"],
  ],
  [
    "pharmaceutical-laboratory",
    "Laboratory Science",
    ["Laboratory Scientist", "Laboratory Technician"],
  ],
  ["pharmaceutical-laboratory", "Pharmacy", ["Pharmacist", "Pharmacy Assistant"]],
  [
    "pharmaceutical-laboratory",
    "Quality Assurance",
    ["Quality Assurance Officer", "Quality Control Analyst"],
  ],
  [
    "pharmaceutical-laboratory",
    "Regulatory Affairs",
    ["Regulatory Affairs Officer", "Pharmacovigilance Officer"],
  ],
];

export const FALLBACK_TITLES: CatalogTitle[] = titles.flatMap(
  ([industrySlug, familyName, titleNames]) =>
    titleNames.map((name) => ({
      id: title(industrySlug, familyName, name),
      familyId: family(industrySlug, familyName),
      name,
    })),
);

export const FALLBACK_SKILLS: CatalogSkill[] = [
  ["Customer service", "soft", null],
  ["Communication", "soft", null],
  ["Problem solving", "soft", null],
  ["Team supervision", "leadership", null],
  ["Report writing", "administration", null],
  ["Microsoft Excel", "software", null],
  ["Microsoft Word", "software", null],
  ["Google Workspace", "software", null],
  ["Inventory management", "technical", "logistics-transport"],
  ["Stock control", "technical", "logistics-transport"],
  ["Fleet scheduling", "technical", "logistics-transport"],
  ["Procurement planning", "technical", "logistics-transport"],
  ["Supplier management", "technical", "logistics-transport"],
  ["QuickBooks", "software", "finance-administration"],
  ["Sage Accounting", "software", "finance-administration"],
  ["Bank reconciliation", "technical", "finance-administration"],
  ["Accounts payable", "technical", "finance-administration"],
  ["Accounts receivable", "technical", "finance-administration"],
  ["Payroll processing", "technical", "finance-administration"],
  ["React", "software", "information-technology"],
  ["TypeScript", "software", "information-technology"],
  ["Node.js", "software", "information-technology"],
  ["SQL", "technical", "information-technology"],
  ["PostgreSQL", "software", "information-technology"],
  ["API integration", "technical", "information-technology"],
  ["Network troubleshooting", "technical", "information-technology"],
  ["Power BI", "software", "information-technology"],
  ["Point of sale systems", "software", "sales-retail"],
  ["Cash handling", "technical", "sales-retail"],
  ["Sales closing", "technical", "sales-retail"],
  ["Visual merchandising", "technical", "sales-retail"],
  ["Digital marketing", "technical", "sales-retail"],
  ["Recruitment coordination", "technical", "human-resources"],
  ["Employee relations", "technical", "human-resources"],
  ["Performance management", "technical", "human-resources"],
  ["Training facilitation", "technical", "human-resources"],
  ["Production planning", "technical", "manufacturing-operations"],
  ["Machine operation", "technical", "manufacturing-operations"],
  ["Quality inspection", "technical", "manufacturing-operations"],
  ["Health and safety compliance", "technical", "manufacturing-operations"],
  ["Crop production", "technical", "agriculture-food-production"],
  ["Livestock management", "technical", "agriculture-food-production"],
  ["Irrigation management", "technical", "agriculture-food-production"],
  ["Farm budgeting", "technical", "agriculture-food-production"],
  ["Clinical assessment", "technical", "health-social-care"],
  ["Patient care", "technical", "health-social-care"],
  ["Medication dispensing", "technical", "health-social-care"],
  ["Infection prevention", "technical", "health-social-care"],
  ["Lesson planning", "technical", "education-training"],
  ["Classroom management", "technical", "education-training"],
  ["Learner assessment", "technical", "education-training"],
  ["Front desk operations", "technical", "hospitality-tourism"],
  ["Reservation management", "technical", "hospitality-tourism"],
  ["Food preparation", "technical", "hospitality-tourism"],
  ["Guest relations", "technical", "hospitality-tourism"],
  ["AutoCAD", "software", "construction-engineering"],
  ["Construction planning", "technical", "construction-engineering"],
  ["Credit assessment", "technical", "banking-insurance"],
  ["Financial risk management", "technical", "banking-insurance"],
  ["Contract drafting", "technical", "legal-compliance"],
  ["Regulatory compliance", "technical", "legal-compliance"],
  ["Adobe Creative Suite", "software", "media-creative"],
  ["Media relations", "technical", "media-creative"],
  ["Grant management", "technical", "nonprofit-development"],
  ["Programme monitoring", "technical", "nonprofit-development"],
  ["Solar installation", "technical", "energy-utilities"],
  ["Water quality testing", "technical", "energy-utilities"],
  ["Mine planning", "technical", "mining-extractives"],
  ["Mineral processing", "technical", "mining-extractives"],
  ["Property leasing", "technical", "real-estate-property"],
  ["Facilities maintenance", "technical", "real-estate-property"],
  ["Access control systems", "technical", "security-services"],
  ["Incident investigation", "technical", "security-services"],
  ["Policy development", "technical", "government-public-administration"],
  ["Stakeholder engagement", "technical", "government-public-administration"],
  ["Environmental impact assessment", "technical", "environment-conservation"],
  ["Sustainability reporting", "technical", "environment-conservation"],
  ["Vehicle diagnostics", "technical", "automotive-equipment"],
  ["Fibre optic installation", "technical", "telecommunications"],
  ["Laboratory information systems", "software", "pharmaceutical-laboratory"],
  ["Good manufacturing practice", "technical", "pharmaceutical-laboratory"],
].map(([name, category, industrySlug]) => ({
  name: name as string,
  category: category as string,
  industry_slug: industrySlug as string | null,
}));

export const FALLBACK_CERTIFICATIONS = [
  "ACCA",
  "CIMA",
  "CPA",
  "ICAM",
  "CIPS",
  "CILT",
  "HSE Certificate",
  "Food Safety Certificate",
  "First Aid Certificate",
  "PMP",
  "PRINCE2",
  "CCNA",
  "CompTIA A+",
  "ITIL Foundation",
  "HR Practitioner Certificate",
  "Teaching Certificate",
  "Registered Nurse License",
  "Clinical Officer License",
  "Pharmacy Technician License",
  "NEBOSH",
  "CFA",
  "Certified Compliance Professional",
  "Google Analytics Certification",
  "MEAL Certificate",
  "Solar PV Installation Certificate",
  "Mine Safety Certificate",
  "Property Management Certificate",
  "Security Management Certificate",
  "Environmental Management Certificate",
  "Automotive Service Excellence",
  "Fibre Optic Technician Certificate",
  "Good Manufacturing Practice Certificate",
];

export const FALLBACK_LICENSES: CatalogLicense[] = [
  { name: "Malawi Driving License", classes: ["A", "B", "C", "D", "PG"] },
  { name: "Zambia Driving License", classes: ["A", "B", "C", "D", "PSV"] },
  { name: "South Africa Driving License", classes: ["A", "B", "C1", "C", "EB", "EC1", "EC"] },
  { name: "Forklift Operator License", classes: ["Counterbalance", "Reach Truck"] },
  { name: "Motorcycle License", classes: ["A", "A1"] },
  { name: "Professional Driver Permit", classes: ["Goods", "Passengers", "Dangerous Goods"] },
  { name: "Nursing Practising License", classes: ["RN", "NMT", "Midwife"] },
  { name: "Clinical Practising License", classes: ["Clinical Officer", "Medical Assistant"] },
  { name: "Pharmacy Practising License", classes: ["Pharmacy Technician", "Pharmacist"] },
];

// Broader sector coverage keeps the builder useful before the database catalog
// has been seeded, and mirrors the expanded Supabase seed migration.
FALLBACK_INDUSTRIES.push(
  { id: industry("aviation-maritime"), name: "Aviation and Maritime", slug: "aviation-maritime" },
  {
    id: industry("arts-culture-sport"),
    name: "Arts, Culture and Sport",
    slug: "arts-culture-sport",
  },
  {
    id: industry("beauty-personal-care"),
    name: "Beauty and Personal Care",
    slug: "beauty-personal-care",
  },
  {
    id: industry("customer-experience"),
    name: "Customer Experience and Contact Centres",
    slug: "customer-experience",
  },
  {
    id: industry("data-research-statistics"),
    name: "Data, Research and Statistics",
    slug: "data-research-statistics",
  },
  {
    id: industry("forestry-fisheries"),
    name: "Forestry, Fisheries and Wildlife",
    slug: "forestry-fisheries",
  },
  {
    id: industry("faith-community-services"),
    name: "Faith and Community Services",
    slug: "faith-community-services",
  },
  {
    id: industry("garments-textiles-fashion"),
    name: "Garments, Textiles and Fashion",
    slug: "garments-textiles-fashion",
  },
  {
    id: industry("international-trade-customs"),
    name: "International Trade and Customs",
    slug: "international-trade-customs",
  },
  {
    id: industry("waste-recycling"),
    name: "Waste Management and Recycling",
    slug: "waste-recycling",
  },
  {
    id: industry("printing-publishing"),
    name: "Printing and Publishing",
    slug: "printing-publishing",
  },
  {
    id: industry("emergency-disaster-management"),
    name: "Emergency and Disaster Management",
    slug: "emergency-disaster-management",
  },
);

const EXPANDED_FAMILY_ROWS: [string, string[]][] = [
  [
    "aviation-maritime",
    ["Flight Operations", "Aircraft Maintenance", "Passenger Services", "Maritime Operations"],
  ],
  ["arts-culture-sport", ["Visual Arts", "Performing Arts", "Sports Development", "Events"]],
  ["beauty-personal-care", ["Hair Services", "Beauty Therapy", "Wellness", "Salon Operations"]],
  [
    "customer-experience",
    ["Contact Centre", "Customer Success", "Complaints Resolution", "Customer Insights"],
  ],
  [
    "data-research-statistics",
    ["Research Design", "Data Management", "Statistical Analysis", "Market Insights"],
  ],
  [
    "forestry-fisheries",
    ["Forestry", "Fisheries and Aquaculture", "Wildlife Management", "Natural Resources"],
  ],
  [
    "faith-community-services",
    ["Ministry", "Community Care", "Faith Administration", "Youth Services"],
  ],
  [
    "garments-textiles-fashion",
    ["Garment Production", "Fashion Design", "Textile Quality", "Merchandising"],
  ],
  [
    "international-trade-customs",
    ["Customs", "Import and Export", "Trade Compliance", "Freight Forwarding"],
  ],
  [
    "waste-recycling",
    ["Waste Operations", "Recycling", "Environmental Health", "Resource Recovery"],
  ],
  ["printing-publishing", ["Print Production", "Editorial", "Publishing", "Digital Content"]],
  [
    "emergency-disaster-management",
    [
      "Emergency Response",
      "Humanitarian Logistics",
      "Disaster Risk Reduction",
      "Recovery Programmes",
    ],
  ],
];

FALLBACK_FAMILIES.push(
  ...EXPANDED_FAMILY_ROWS.flatMap(([industrySlug, names]) =>
    names.map((name) => ({
      id: family(industrySlug, name),
      industryId: industry(industrySlug),
      name,
    })),
  ),
);

const EXPANDED_TITLE_ROWS: [string, string, string[]][] = [
  [
    "aviation-maritime",
    "Flight Operations",
    ["Flight Dispatcher", "Flight Operations Officer", "Airport Operations Manager"],
  ],
  [
    "aviation-maritime",
    "Aircraft Maintenance",
    ["Aircraft Technician", "Avionics Technician", "Aircraft Maintenance Engineer"],
  ],
  [
    "aviation-maritime",
    "Passenger Services",
    ["Cabin Crew Member", "Passenger Services Agent", "Ground Operations Officer"],
  ],
  [
    "aviation-maritime",
    "Maritime Operations",
    ["Port Operations Officer", "Ship Agent", "Marine Operations Coordinator"],
  ],
  ["arts-culture-sport", "Visual Arts", ["Artist", "Curator", "Art Teacher"]],
  ["arts-culture-sport", "Performing Arts", ["Musician", "Stage Manager", "Theatre Producer"]],
  [
    "arts-culture-sport",
    "Sports Development",
    ["Sports Coach", "Fitness Instructor", "Sports Development Officer"],
  ],
  ["arts-culture-sport", "Events", ["Events Coordinator", "Events Manager", "Conference Producer"]],
  ["beauty-personal-care", "Hair Services", ["Hairdresser", "Barber", "Salon Manager"]],
  [
    "beauty-personal-care",
    "Beauty Therapy",
    ["Beauty Therapist", "Nail Technician", "Spa Therapist"],
  ],
  ["beauty-personal-care", "Wellness", ["Massage Therapist", "Wellness Coach", "Personal Trainer"]],
  [
    "beauty-personal-care",
    "Salon Operations",
    ["Salon Receptionist", "Salon Supervisor", "Beauty Sales Consultant"],
  ],
  [
    "customer-experience",
    "Contact Centre",
    ["Call Centre Agent", "Contact Centre Team Leader", "Contact Centre Quality Analyst"],
  ],
  [
    "customer-experience",
    "Customer Success",
    ["Customer Success Manager", "Client Service Officer", "Customer Relationship Specialist"],
  ],
  [
    "customer-experience",
    "Complaints Resolution",
    ["Complaints Officer", "Customer Care Supervisor", "Escalations Specialist"],
  ],
  [
    "customer-experience",
    "Customer Insights",
    ["Customer Insights Analyst", "Voice of Customer Analyst", "Service Design Officer"],
  ],
  [
    "data-research-statistics",
    "Research Design",
    ["Research Officer", "Research Analyst", "Research Manager"],
  ],
  [
    "data-research-statistics",
    "Data Management",
    ["Data Manager", "Data Entry Clerk", "Database Administrator"],
  ],
  [
    "data-research-statistics",
    "Statistical Analysis",
    ["Statistician", "Data Analyst", "Biostatistician"],
  ],
  [
    "data-research-statistics",
    "Market Insights",
    ["Market Researcher", "Economist", "Demographer"],
  ],
  ["forestry-fisheries", "Forestry", ["Forestry Officer", "Forest Ranger", "Tree Nursery Manager"]],
  [
    "forestry-fisheries",
    "Fisheries and Aquaculture",
    ["Fisheries Officer", "Aquaculture Technician", "Hatchery Manager"],
  ],
  [
    "forestry-fisheries",
    "Wildlife Management",
    ["Wildlife Officer", "Park Ranger", "Wildlife Research Assistant"],
  ],
  [
    "forestry-fisheries",
    "Natural Resources",
    ["Natural Resources Officer", "Conservation Technician", "Land Management Officer"],
  ],
  [
    "faith-community-services",
    "Ministry",
    ["Pastor", "Ministry Coordinator", "Religious Education Officer"],
  ],
  [
    "faith-community-services",
    "Community Care",
    ["Community Outreach Worker", "Case Worker", "Counselling Officer"],
  ],
  [
    "faith-community-services",
    "Faith Administration",
    ["Church Administrator", "Faith Organisation Finance Officer", "Membership Officer"],
  ],
  [
    "faith-community-services",
    "Youth Services",
    ["Youth Programme Officer", "Youth Mentor", "Child Protection Officer"],
  ],
  [
    "garments-textiles-fashion",
    "Garment Production",
    ["Garment Technician", "Textile Production Supervisor", "Pattern Maker"],
  ],
  ["garments-textiles-fashion", "Fashion Design", ["Fashion Designer", "Tailor", "Garment Cutter"]],
  [
    "garments-textiles-fashion",
    "Textile Quality",
    ["Textile Quality Inspector", "Textile Technologist", "Quality Assurance Supervisor"],
  ],
  [
    "garments-textiles-fashion",
    "Merchandising",
    ["Fashion Merchandiser", "Product Developer", "Retail Buyer"],
  ],
  [
    "international-trade-customs",
    "Customs",
    ["Customs Clearing Agent", "Customs Officer", "Trade Compliance Officer"],
  ],
  [
    "international-trade-customs",
    "Import and Export",
    ["Import and Export Coordinator", "Export Officer", "International Trade Officer"],
  ],
  [
    "international-trade-customs",
    "Trade Compliance",
    ["Trade Compliance Manager", "Sanctions Screening Analyst", "Customs Documentation Officer"],
  ],
  [
    "international-trade-customs",
    "Freight Forwarding",
    ["Freight Forwarder", "Shipping Coordinator", "Freight Operations Manager"],
  ],
  [
    "waste-recycling",
    "Waste Operations",
    ["Waste Collection Supervisor", "Landfill Operator", "Waste Operations Manager"],
  ],
  [
    "waste-recycling",
    "Recycling",
    ["Recycling Officer", "Materials Recovery Technician", "Recycling Plant Operator"],
  ],
  [
    "waste-recycling",
    "Environmental Health",
    ["Environmental Health Officer", "Sanitation Inspector", "Public Health Inspector"],
  ],
  [
    "waste-recycling",
    "Resource Recovery",
    ["Resource Recovery Officer", "Circular Economy Analyst", "Composting Technician"],
  ],
  [
    "printing-publishing",
    "Print Production",
    ["Print Operator", "Prepress Technician", "Print Production Manager"],
  ],
  ["printing-publishing", "Editorial", ["Editor", "Copy Editor", "Proofreader"]],
  [
    "printing-publishing",
    "Publishing",
    ["Publishing Manager", "Rights Coordinator", "Publications Officer"],
  ],
  [
    "printing-publishing",
    "Digital Content",
    ["Digital Content Producer", "Web Editor", "Content Strategist"],
  ],
  [
    "emergency-disaster-management",
    "Emergency Response",
    ["Emergency Response Officer", "Emergency Medical Technician", "Incident Commander"],
  ],
  [
    "emergency-disaster-management",
    "Humanitarian Logistics",
    [
      "Humanitarian Logistics Officer",
      "Relief Supplies Coordinator",
      "Emergency Warehouse Officer",
    ],
  ],
  [
    "emergency-disaster-management",
    "Disaster Risk Reduction",
    ["Disaster Risk Reduction Officer", "Early Warning Systems Officer", "Resilience Officer"],
  ],
  [
    "emergency-disaster-management",
    "Recovery Programmes",
    ["Recovery Programme Manager", "Shelter Officer", "Livelihoods Recovery Officer"],
  ],
];

FALLBACK_TITLES.push(
  ...EXPANDED_TITLE_ROWS.flatMap(([industrySlug, familyName, names]) =>
    names.map((name) => ({
      id: title(industrySlug, familyName, name),
      familyId: family(industrySlug, familyName),
      name,
    })),
  ),
);

FALLBACK_SKILLS.push(
  ...([
    ["Air traffic procedures", "technical", "aviation-maritime"],
    ["Aviation safety", "technical", "aviation-maritime"],
    ["Cargo handling", "technical", "aviation-maritime"],
    ["Event production", "technical", "arts-culture-sport"],
    ["Performance coaching", "technical", "arts-culture-sport"],
    ["Arts curation", "technical", "arts-culture-sport"],
    ["Hair styling", "technical", "beauty-personal-care"],
    ["Beauty treatments", "technical", "beauty-personal-care"],
    ["Client consultation", "technical", "beauty-personal-care"],
    ["Call handling", "technical", "customer-experience"],
    ["Complaint resolution", "technical", "customer-experience"],
    ["Customer journey mapping", "technical", "customer-experience"],
    ["Survey design", "technical", "data-research-statistics"],
    ["Statistical modelling", "technical", "data-research-statistics"],
    ["SPSS", "software", "data-research-statistics"],
    ["Stata", "software", "data-research-statistics"],
    ["Forest management", "technical", "forestry-fisheries"],
    ["Aquaculture husbandry", "technical", "forestry-fisheries"],
    ["Wildlife monitoring", "technical", "forestry-fisheries"],
    ["Case management", "technical", "faith-community-services"],
    ["Safeguarding", "technical", "faith-community-services"],
    ["Community mobilisation", "technical", "faith-community-services"],
    ["Pattern cutting", "technical", "garments-textiles-fashion"],
    ["Textile production", "technical", "garments-textiles-fashion"],
    ["Garment quality control", "technical", "garments-textiles-fashion"],
    ["Customs declarations", "technical", "international-trade-customs"],
    ["Import documentation", "technical", "international-trade-customs"],
    ["Incoterms", "technical", "international-trade-customs"],
    ["Waste segregation", "technical", "waste-recycling"],
    ["Recycling operations", "technical", "waste-recycling"],
    ["Environmental sanitation", "technical", "waste-recycling"],
    ["Prepress", "technical", "printing-publishing"],
    ["Print finishing", "technical", "printing-publishing"],
    ["Editorial standards", "technical", "printing-publishing"],
    ["Incident management", "technical", "emergency-disaster-management"],
    ["Humanitarian coordination", "technical", "emergency-disaster-management"],
    ["Emergency preparedness", "technical", "emergency-disaster-management"],
  ] as [string, string, string][]).map(([name, category, industry_slug]) => ({
    name,
    category,
    industry_slug,
  })),
);

export function isFallbackCatalogId(value: string | null | undefined) {
  return Boolean(value?.startsWith("fallback:"));
}

export function fallbackFamiliesForIndustry(slug: string | null | undefined) {
  const fallbackIndustry = FALLBACK_INDUSTRIES.find((item) => item.slug === slug);
  if (!fallbackIndustry) return [];
  return FALLBACK_FAMILIES.filter((item) => item.industryId === fallbackIndustry.id).map(
    ({ id, name }) => ({
      id,
      name,
    }),
  );
}

export function fallbackTitlesForFamily({
  fallbackFamilyId,
  familyName,
  industrySlug,
}: {
  fallbackFamilyId?: string | null;
  familyName?: string | null;
  industrySlug?: string | null;
}) {
  const familyId =
    fallbackFamilyId && isFallbackCatalogId(fallbackFamilyId)
      ? fallbackFamilyId
      : industrySlug && familyName
        ? family(industrySlug, familyName)
        : null;

  if (!familyId) return [];
  return FALLBACK_TITLES.filter((item) => item.familyId === familyId).map(({ id, name }) => ({
    id,
    name,
  }));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
