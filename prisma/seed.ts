import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });

async function seed() {
  console.log("Seeding database...");

  // ─── Industries ──────────────────────────────────────────────────────
  const industries = [
    "Technology", "Healthcare", "Finance", "Education", "Manufacturing",
    "Retail", "Construction", "Agriculture", "Mining", "Telecommunications",
    "Logistics and Transport", "Supply Chain and Procurement",
    "Wholesale and Distribution", "Maritime and Shipping", "Aviation",
    "Government and Public Sector", "Energy and Utilities",
    "Environmental Services", "Water and Sanitation",
    "Real Estate", "Construction and Property",
    "Consulting and Advisory", "Legal and Compliance", "Insurance",
    "Banking and Financial Services", "Event Management",
    "Automotive and Fleet", "Cooperatives and Social Enterprise",
    "Security and Protection", "Hospitality and Tourism",
    "Media and Entertainment", "Advertising and Marketing",
    "Non-Profit and NGO", "Research and Development",
    "Pharmaceutical", "Biotechnology", "Automotive",
    "Food and Beverage", "Textile and Fashion", "FMCG",
    "Professional Services", "Human Resources",
    "Information Technology", "Cybersecurity", "Data and Analytics",
    "Artificial Intelligence", "E-Commerce", "Renewable Energy",
    "Public Health", "Social Work", "Mining and Extraction",
  ];
  for (const name of industries) {
    await prisma.industry.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`  ✓ ${industries.length} industries`);

  // ─── Fields of Study ─────────────────────────────────────────────────
  const fieldsOfStudy = [
    "Accounting", "Actuarial Science", "Aerospace Engineering",
    "Agricultural Economics", "Agricultural Engineering",
    "Agriculture", "Architecture", "Automotive Engineering",
    "Banking and Finance", "Biochemistry", "Biology",
    "Biomedical Engineering", "Business Administration",
    "Business Information Systems", "Business Management",
    "Chemical Engineering", "Chemistry", "Civil Engineering",
    "Computer Engineering", "Computer Science",
    "Construction Management", "Criminology",
    "Dentistry", "Digital Marketing", "Economics",
    "Education", "Electrical Engineering", "Electronics Engineering",
    "Environmental Engineering", "Environmental Science",
    "Fashion Design", "Finance", "Food Science and Technology",
    "Forestry", "General Arts", "General Science",
    "Geography", "Geology", "Health Sciences",
    "History", "Home Economics", "Human Resource Management",
    "Humanities", "Industrial Engineering", "Information Technology",
    "International Relations", "Journalism", "Law",
    "Library Science", "Linguistics", "Literature",
    "Logistics and Supply Chain Management", "Marketing",
    "Mass Communication", "Mathematics", "Mechanical Engineering",
    "Media Studies", "Medicine", "Meteorology",
    "Mining Engineering", "Modern Languages", "Nursing",
    "Nutrition and Dietetics", "Occupational Health and Safety",
    "Oceanography", "Performing Arts", "Pharmacy",
    "Philosophy", "Physical Education", "Physics",
    "Physiotherapy", "Political Science", "Population Studies",
    "Psychology", "Public Administration", "Public Health",
    "Quantity Surveying", "Radiography", "Religious Studies",
    "Social Work", "Sociology", "Software Engineering",
    "Statistics", "Surveying", "Telecommunications Engineering",
    "Theology", "Tourism and Hospitality Management",
    "Transport and Logistics", "Urban and Regional Planning",
    "Veterinary Science", "Water Resources Engineering",
    "Zoology",
  ];
  for (const name of fieldsOfStudy) {
    await prisma.fieldOfStudy.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`  ✓ ${fieldsOfStudy.length} fields of study`);

  // ─── Skill Library ───────────────────────────────────────────────────
  const skills = [
    { name: "JavaScript", category: "Programming" },
    { name: "TypeScript", category: "Programming" },
    { name: "Python", category: "Programming" },
    { name: "Java", category: "Programming" },
    { name: "C#", category: "Programming" },
    { name: "PHP", category: "Programming" },
    { name: "Go", category: "Programming" },
    { name: "Rust", category: "Programming" },
    { name: "SQL", category: "Database" },
    { name: "PostgreSQL", category: "Database" },
    { name: "MongoDB", category: "Database" },
    { name: "MySQL", category: "Database" },
    { name: "React", category: "Frontend" },
    { name: "Angular", category: "Frontend" },
    { name: "Vue.js", category: "Frontend" },
    { name: "Next.js", category: "Frontend" },
    { name: "Node.js", category: "Backend" },
    { name: "Express.js", category: "Backend" },
    { name: "Django", category: "Backend" },
    { name: "Spring Boot", category: "Backend" },
    { name: "AWS", category: "Cloud" },
    { name: "Azure", category: "Cloud" },
    { name: "Google Cloud", category: "Cloud" },
    { name: "Docker", category: "DevOps" },
    { name: "Kubernetes", category: "DevOps" },
    { name: "CI/CD", category: "DevOps" },
    { name: "Git", category: "DevOps" },
    { name: "Linux", category: "DevOps" },
    { name: "Project Management", category: "Management" },
    { name: "Team Leadership", category: "Management" },
    { name: "Strategic Planning", category: "Management" },
    { name: "Budget Management", category: "Management" },
    { name: "Communication", category: "Soft Skills" },
    { name: "Problem Solving", category: "Soft Skills" },
    { name: "Critical Thinking", category: "Soft Skills" },
    { name: "Time Management", category: "Soft Skills" },
    { name: "Leadership", category: "Soft Skills" },
    { name: "Negotiation", category: "Soft Skills" },
    { name: "Teamwork", category: "Soft Skills" },
    { name: "Adaptability", category: "Soft Skills" },
    { name: "Fleet Management", category: "Operations" },
    { name: "Vehicle Tracking", category: "Operations" },
    { name: "Fuel Management", category: "Operations" },
    { name: "Driver Management", category: "Operations" },
    { name: "Route Planning", category: "Operations" },
    { name: "Logistics Coordination", category: "Operations" },
    { name: "Inventory Management", category: "Operations" },
    { name: "Procurement", category: "Operations" },
    { name: "Quality Assurance", category: "Operations" },
    { name: "Safety Management", category: "Operations" },
    { name: "Regulatory Compliance", category: "Compliance" },
    { name: "Data Analysis", category: "Analytics" },
    { name: "Financial Reporting", category: "Finance" },
    { name: "Bookkeeping", category: "Finance" },
    { name: "Tax Compliance", category: "Finance" },
    { name: "Patient Care", category: "Healthcare" },
    { name: "Clinical Assessment", category: "Healthcare" },
    { name: "Medical Records", category: "Healthcare" },
    { name: "Pharmacy Dispensing", category: "Healthcare" },
    { name: "Wound Care", category: "Healthcare" },
    { name: "Physiotherapy", category: "Healthcare" },
    { name: "Nursing Care", category: "Healthcare" },
    { name: "First Aid", category: "Healthcare" },
    { name: "CPR", category: "Healthcare" },
    { name: "Critical Care", category: "Healthcare" },
  ];
  for (const skill of skills) {
    await prisma.skillLibrary.upsert({
      where: { name: skill.name },
      update: {},
      create: skill,
    });
  }
  console.log(`  ✓ ${skills.length} skills`);

  // ─── Certification Library ───────────────────────────────────────────
  const certs = [
    { name: "PMP", category: "Project Management" },
    { name: "AWS Solutions Architect", category: "Cloud" },
    { name: "Google Cloud Professional", category: "Cloud" },
    { name: "Certified Scrum Master", category: "Agile" },
    { name: "BLS (Basic Life Support)", category: "Healthcare" },
    { name: "ACLS (Advanced Cardiovascular Life Support)", category: "Healthcare" },
    { name: "Registered Physiotherapist", category: "Healthcare" },
    { name: "Registered Nurse", category: "Healthcare" },
    { name: "Certified Nursing Assistant", category: "Healthcare" },
    { name: "CompTIA A+", category: "IT" },
    { name: "CompTIA Network+", category: "IT" },
    { name: "CompTIA Security+", category: "IT" },
    { name: "Cisco CCNA", category: "Networking" },
    { name: "Microsoft Azure Fundamentals", category: "Cloud" },
    { name: "Google Analytics", category: "Marketing" },
    { name: "CFA (Chartered Financial Analyst)", category: "Finance" },
    { name: "ACCA (Association of Chartered Certified Accountants)", category: "Accounting" },
    { name: "CIMA (Chartered Institute of Management Accountants)", category: "Accounting" },
    { name: "PRINCE2", category: "Project Management" },
    { name: "Six Sigma Green Belt", category: "Quality" },
    { name: "Six Sigma Black Belt", category: "Quality" },
    { name: "ISO 9001 Lead Auditor", category: "Quality" },
    { name: "ISO 14001 Lead Auditor", category: "Environment" },
    { name: "NEBOSH (National Examination Board in Occupational Safety and Health)", category: "Safety" },
    { name: "OSHA Safety Certification", category: "Safety" },
    { name: "First Aid at Work", category: "Safety" },
    { name: "CDL (Commercial Driver's License)", category: "Transport" },
    { name: "Forklift Operator License", category: "Warehouse" },
    { name: "Food Safety Level 3", category: "Hospitality" },
    { name: "Hotel Management Certificate", category: "Hospitality" },
    { name: "Chartered Institute of Personnel and Development (CIPD)", category: "HR" },
    { name: "SHRM Certified Professional", category: "HR" },
    { name: "Google Project Management Certificate", category: "Project Management" },
    { name: "Meta Marketing Analytics", category: "Marketing" },
    { name: "HubSpot Inbound Marketing", category: "Marketing" },
  ];
  for (const cert of certs) {
    await prisma.certificationLibrary.upsert({
      where: { name: cert.name },
      update: {},
      create: cert,
    });
  }
  console.log(`  ✓ ${certs.length} certifications`);

  // ─── License Library ─────────────────────────────────────────────────
  const licenses = [
    { name: "Driving License Class B", category: "Transport", classes: '["Class B"]' },
    { name: "Driving License Class C", category: "Transport", classes: '["Class C"]' },
    { name: "Heavy Vehicle License", category: "Transport", classes: '["Heavy Vehicle"]' },
    { name: "Motorcycle License", category: "Transport", classes: '["Motorcycle"]' },
    { name: "Professional Engineer License", category: "Engineering", classes: '["PE"]' },
    { name: "Pharmacy License", category: "Healthcare", classes: '["Pharmacist"]' },
    { name: "Medical Practitioner License", category: "Healthcare", classes: '["Medical Doctor"]' },
    { name: "Nursing License", category: "Healthcare", classes: '["Registered Nurse"]' },
    { name: "Teaching License", category: "Education", classes: '["Teacher"]' },
    { name: "Real Estate Agent License", category: "Real Estate", classes: '["Agent", "Broker"]' },
  ];
  for (const lic of licenses) {
    await prisma.licenseLibrary.upsert({
      where: { name: lic.name },
      update: {},
      create: lic,
    });
  }
  console.log(`  ✓ ${licenses.length} licenses`);

  // ─── Test admin user + tenant ────────────────────────────────────────
  // Create a test tenant (company)
  const tenant = await prisma.tenant.upsert({
    where: { slug: "test-company" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Test Company Ltd",
      slug: "test-company",
      industry: "Technology",
      country: "Malawi",
      city: "Blantyre",
      email: "admin@test.com",
    },
  });

  // Create test user profile
  const profile = await prisma.profile.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      tenant_id: tenant.id,
      full_name: "Admin User",
      email: "admin@test.com",
      email_verified: true,
    },
  });

  // Create auth credentials (password: Admin123!)
  const bcrypt = await import("bcryptjs");
  const hash = await bcrypt.hash("Admin123!", 10);

  await prisma.authCredential.upsert({
    where: { user_id: profile.id },
    update: {},
    create: {
      user_id: profile.id,
      password_hash: hash,
    },
  });

  // Create user role
  await prisma.userRole.upsert({
    where: { user_id_role: { user_id: profile.id, role: "admin" } },
    update: {},
    create: {
      user_id: profile.id,
      tenant_id: tenant.id,
      role: "admin",
    },
  });

  console.log("  ✓ Test user: admin@test.com / Admin123!");
  // Create default plan (needed for payment flow)
  await prisma.plan.upsert({
    where: { slug: "day-based" },
    update: {},
    create: {
      name: "Day-Based",
      slug: "day-based",
      description: "Pay per day",
      duration_days: 1,
      price: 15000,
      currency: "MWK",
      candidate_limit: 100,
      recruiter_limit: 5,
      active: true,
    },
  });
  console.log("  Default plan: day-based (MWK 15,000/day)");
  console.log("Seed complete.");
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
