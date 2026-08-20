-- Certification master library (single source) + candidate certifications.
-- Broadens the 32-row seed into a comprehensive, industry-tagged catalog so
-- recruiters and candidates pick from one shared list instead of typing.
-- Also adds the candidate-side table mirroring candidate_skills.

CREATE TABLE IF NOT EXISTS candidate_certifications (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  application_id TEXT NOT NULL,
  certification  TEXT NOT NULL,
  category       TEXT
);

CREATE INDEX IF NOT EXISTS idx_candidate_certifications_application
  ON candidate_certifications(application_id);

INSERT OR IGNORE INTO certification_library (id, name, category, full_name, industry_slug) VALUES
  -- Finance, accounting & audit
  ('a1000001-0000-0000-0000-000000000001', 'ACA', 'Finance & Accounting', 'Associate Chartered Accountant', 'finance-administration'),
  ('a1000001-0000-0000-0000-000000000002', 'AAT', 'Finance & Accounting', 'Association of Accounting Technicians', 'finance-administration'),
  ('a1000001-0000-0000-0000-000000000003', 'CIA', 'Finance & Accounting', 'Certified Internal Auditor', 'finance-administration'),
  ('a1000001-0000-0000-0000-000000000004', 'CMA', 'Finance & Accounting', 'Certified Management Accountant', 'finance-administration'),
  ('a1000001-0000-0000-0000-000000000005', 'CGMA', 'Finance & Accounting', 'Chartered Global Management Accountant', 'finance-administration'),
  ('a1000001-0000-0000-0000-000000000006', 'CFE', 'Finance & Accounting', 'Certified Fraud Examiner', 'finance-administration'),
  ('a1000001-0000-0000-0000-000000000007', 'CISA', 'Finance & Accounting', 'Certified Information Systems Auditor', 'finance-administration'),
  ('a1000001-0000-0000-0000-000000000008', 'CAMS', 'Finance & Accounting', 'Certified Anti-Money Laundering Specialist', 'banking-insurance'),
  ('a1000001-0000-0000-0000-000000000009', 'CIPFA', 'Finance & Accounting', 'Chartered Institute of Public Finance and Accountancy', 'finance-administration'),
  ('a1000001-0000-0000-0000-000000000010', 'ACFE', 'Finance & Accounting', 'Certified in Financial Forensics', 'finance-administration'),

  -- Banking, insurance & risk
  ('a1000002-0000-0000-0000-000000000001', 'CERP', 'Banking & Risk', 'Certified Enterprise Risk Professional', 'banking-insurance'),
  ('a1000002-0000-0000-0000-000000000002', 'FRM', 'Banking & Risk', 'Financial Risk Manager', 'banking-insurance'),
  ('a1000002-0000-0000-0000-000000000003', 'PRM', 'Banking & Risk', 'Professional Risk Manager', 'banking-insurance'),
  ('a1000002-0000-0000-0000-000000000004', 'ACII', 'Banking & Risk', 'Associate of the Chartered Insurance Institute', 'banking-insurance'),
  ('a1000002-0000-0000-0000-000000000005', 'ARM', 'Banking & Risk', 'Associate in Risk Management', 'banking-insurance'),
  ('a1000002-0000-0000-0000-000000000006', 'CIC', 'Banking & Risk', 'Certified Insurance Counselor', 'banking-insurance'),

  -- IT, software & cybersecurity
  ('a1000003-0000-0000-0000-000000000001', 'AWS Certified Solutions Architect', 'Information Technology', 'AWS Certified Solutions Architect – Associate', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000002', 'AWS Certified Developer', 'Information Technology', 'AWS Certified Developer – Associate', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000003', 'AWS Certified SysOps Administrator', 'Information Technology', 'AWS Certified SysOps Administrator – Associate', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000004', 'Microsoft Azure Fundamentals', 'Information Technology', 'Microsoft Certified: Azure Fundamentals (AZ-900)', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000005', 'Microsoft Azure Administrator', 'Information Technology', 'Microsoft Certified: Azure Administrator Associate (AZ-104)', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000006', 'Microsoft Azure Solutions Architect', 'Information Technology', 'Microsoft Certified: Azure Solutions Architect Expert (AZ-305)', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000007', 'Google Cloud Professional Cloud Architect', 'Information Technology', 'Google Cloud Professional Cloud Architect', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000008', 'Google Cloud Professional Data Engineer', 'Information Technology', 'Google Cloud Professional Data Engineer', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000009', 'CISSP', 'Information Technology', 'Certified Information Systems Security Professional', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000010', 'CISM', 'Information Technology', 'Certified Information Security Manager', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000011', 'Security+', 'Information Technology', 'CompTIA Security+', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000012', 'Network+', 'Information Technology', 'CompTIA Network+', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000013', 'CCNP', 'Information Technology', 'Cisco Certified Network Professional', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000014', 'CEH', 'Information Technology', 'Certified Ethical Hacker', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000015', 'OSCP', 'Information Technology', 'Offensive Security Certified Professional', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000016', 'PMP', 'Information Technology', 'Project Management Professional', NULL),
  ('a1000003-0000-0000-0000-000000000017', 'ISTQB Foundation', 'Information Technology', 'ISTQB Certified Tester Foundation Level', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000018', 'Scrum Master Certified', 'Information Technology', 'Scrum Master Certified (SMC)', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000019', 'Professional Scrum Master', 'Information Technology', 'Professional Scrum Master I (PSM I)', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000020', 'Salesforce Administrator', 'Information Technology', 'Salesforce Certified Administrator', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000021', 'Salesforce Platform Developer', 'Information Technology', 'Salesforce Certified Platform Developer I', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000022', 'Oracle Certified Professional', 'Information Technology', 'Oracle Certified Professional Java SE', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000023', 'VMware Certified Professional', 'Information Technology', 'VMware Certified Professional – Data Center Virtualization', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000024', 'Linux Professional Institute', 'Information Technology', 'LPIC-1 Linux Administrator', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000025', 'Docker Certified Associate', 'Information Technology', 'Docker Certified Associate', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000026', 'Kubernetes Administrator', 'Information Technology', 'Certified Kubernetes Administrator (CKA)', 'information-technology'),
  ('a1000003-0000-0000-0000-000000000027', 'Google Data Analytics', 'Data & Analytics', 'Google Data Analytics Professional Certificate', 'data-research-statistics'),
  ('a1000003-0000-0000-0000-000000000028', 'Microsoft Power BI', 'Data & Analytics', 'Microsoft Certified: Power BI Data Analyst Associate', 'data-research-statistics'),
  ('a1000003-0000-0000-0000-000000000029', 'Tableau Desktop Specialist', 'Data & Analytics', 'Tableau Desktop Specialist', 'data-research-statistics'),

  -- Project, programme & operations
  ('a1000004-0000-0000-0000-000000000001', 'CAPM', 'Project Management', 'Certified Associate in Project Management', NULL),
  ('a1000004-0000-0000-0000-000000000002', 'PgMP', 'Project Management', 'Program Management Professional', NULL),
  ('a1000004-0000-0000-0000-000000000003', 'PRINCE2 Agile', 'Project Management', 'PRINCE2 Agile Practitioner', NULL),
  ('a1000004-0000-0000-0000-000000000004', 'MSP', 'Project Management', 'Managing Successful Programmes', NULL),
  ('a1000004-0000-0000-0000-000000000005', 'Lean Six Sigma Green Belt', 'Operations', 'Lean Six Sigma Green Belt', 'manufacturing-operations'),
  ('a1000004-0000-0000-0000-000000000006', 'Lean Six Sigma Black Belt', 'Operations', 'Lean Six Sigma Black Belt', 'manufacturing-operations'),
  ('a1000004-0000-0000-0000-000000000007', 'ISO 9001 Lead Auditor', 'Operations', 'ISO 9001 Quality Management Lead Auditor', 'manufacturing-operations'),
  ('a1000004-0000-0000-0000-000000000008', 'ISO 14001 Lead Auditor', 'Operations', 'ISO 14001 Environmental Management Lead Auditor', 'environment-conservation'),
  ('a1000004-0000-0000-0000-000000000009', 'ISO 45001 Lead Auditor', 'Operations', 'ISO 45001 Occupational Health and Safety Lead Auditor', 'manufacturing-operations'),
  ('a1000004-0000-0000-0000-000000000010', 'Supply Chain Professional', 'Operations', 'Certified Supply Chain Professional (CSCP)', 'logistics-transport'),
  ('a1000004-0000-0000-0000-000000000011', 'CPIM', 'Operations', 'Certified in Production and Inventory Management', 'manufacturing-operations'),
  ('a1000004-0000-0000-0000-000000000012', 'Green Belt', 'Operations', 'Lean Six Sigma Green Belt (Generic)', 'manufacturing-operations'),

  -- Human resources & training
  ('a1000005-0000-0000-0000-000000000001', 'CIPD', 'Human Resources', 'Chartered Institute of Personnel and Development', 'human-resources'),
  ('a1000005-0000-0000-0000-000000000002', 'SHRM-CP', 'Human Resources', 'SHRM Certified Professional', 'human-resources'),
  ('a1000005-0000-0000-0000-000000000003', 'SHRM-SCP', 'Human Resources', 'SHRM Senior Certified Professional', 'human-resources'),
  ('a1000005-0000-0000-0000-000000000004', 'PHR', 'Human Resources', 'Professional in Human Resources', 'human-resources'),
  ('a1000005-0000-0000-0000-000000000005', 'SPHR', 'Human Resources', 'Senior Professional in Human Resources', 'human-resources'),
  ('a1000005-0000-0000-0000-000000000006', 'TEFL', 'Education & Training', 'Teaching English as a Foreign Language', 'education-training'),
  ('a1000005-0000-0000-0000-000000000007', 'TESOL', 'Education & Training', 'Teaching English to Speakers of Other Languages', 'education-training'),
  ('a1000005-0000-0000-0000-000000000008', 'CELTA', 'Education & Training', 'Certificate in English Language Teaching to Adults', 'education-training'),

  -- Health, safety & environment
  ('a1000006-0000-0000-0000-000000000001', 'IOSH Managing Safely', 'Health & Safety', 'IOSH Managing Safely', 'manufacturing-operations'),
  ('a1000006-0000-0000-0000-000000000002', 'IOSH Working Safely', 'Health & Safety', 'IOSH Working Safely', 'manufacturing-operations'),
  ('a1000006-0000-0000-0000-000000000003', 'Fire Warden Training', 'Health & Safety', 'Fire Warden / Fire Marshal Training', 'manufacturing-operations'),
  ('a1000006-0000-0000-0000-000000000004', 'Defensive Driving Certificate', 'Health & Safety', 'Defensive Driving Certificate', 'logistics-transport'),
  ('a1000006-0000-0000-0000-000000000005', 'HACCP', 'Food & Hospitality', 'Hazard Analysis and Critical Control Points', 'manufacturing-operations'),
  ('a1000006-0000-0000-0000-000000000006', 'Barista Certification', 'Food & Hospitality', 'Professional Barista Certification', 'hospitality-tourism'),
  ('a1000006-0000-0000-0000-000000000007', 'Food Handler Certificate', 'Food & Hospitality', 'Food Handler Certificate', 'hospitality-tourism'),
  ('a1000006-0000-0000-0000-000000000008', 'ServSafe', 'Food & Hospitality', 'ServSafe Food Protection Manager', 'hospitality-tourism'),

  -- Health & medical
  ('a1000007-0000-0000-0000-000000000001', 'BLS', 'Health & Medical', 'Basic Life Support Certification', 'health-social-care'),
  ('a1000007-0000-0000-0000-000000000002', 'ACLS', 'Health & Medical', 'Advanced Cardiovascular Life Support', 'health-social-care'),
  ('a1000007-0000-0000-0000-000000000003', 'PALS', 'Health & Medical', 'Pediatric Advanced Life Support', 'health-social-care'),
  ('a1000007-0000-0000-0000-000000000004', 'EMT Certification', 'Health & Medical', 'Emergency Medical Technician Certification', 'health-social-care'),
  ('a1000007-0000-0000-0000-000000000005', 'Phlebotomy Certification', 'Health & Medical', 'Certified Phlebotomy Technician', 'health-social-care'),
  ('a1000007-0000-0000-0000-000000000006', 'Medical Coding', 'Health & Medical', 'Certified Professional Coder (CPC)', 'health-social-care'),
  ('a1000007-0000-0000-0000-000000000007', 'Nursing License', 'Health & Medical', 'Registered Nurse Practising License', 'health-social-care'),

  -- Sales, marketing & media
  ('a1000008-0000-0000-0000-000000000001', 'Google Ads Certification', 'Marketing', 'Google Ads Search Certification', 'media-creative'),
  ('a1000008-0000-0000-0000-000000000002', 'Google Analytics Individual Qualification', 'Marketing', 'Google Analytics Individual Qualification', 'media-creative'),
  ('a1000008-0000-0000-0000-000000000003', 'HubSpot Inbound Marketing', 'Marketing', 'HubSpot Inbound Marketing Certification', 'media-creative'),
  ('a1000008-0000-0000-0000-000000000004', 'HubSpot Sales Software', 'Sales', 'HubSpot Sales Software Certification', 'sales-retail'),
  ('a1000008-0000-0000-0000-000000000005', 'Meta Blueprint', 'Marketing', 'Meta Certified Digital Marketing Associate', 'media-creative'),
  ('a1000008-0000-0000-0000-000000000006', 'Facebook Blueprint', 'Marketing', 'Facebook Certified Media Buying Professional', 'media-creative'),
  ('a1000008-0000-0000-0000-000000000007', 'CIM Certificate', 'Marketing', 'Chartered Institute of Marketing Certificate', 'media-creative'),
  ('a1000008-0000-0000-0000-000000000008', 'Certified Sales Professional', 'Sales', 'Certified Sales Professional (CSP)', 'sales-retail'),

  -- Legal, compliance & procurement
  ('a1000009-0000-0000-0000-000000000001', 'CIPP', 'Legal & Compliance', 'Certified Information Privacy Professional', 'legal-compliance'),
  ('a1000009-0000-0000-0000-000000000002', 'CIPM', 'Legal & Compliance', 'Certified Information Privacy Manager', 'legal-compliance'),
  ('a1000009-0000-0000-0000-000000000003', 'Certified Procurement Professional', 'Procurement', 'Certified Procurement Professional', 'procurement-supply'),
  ('a1000009-0000-0000-0000-000000000004', 'MCIPS', 'Procurement', 'MCIPS Chartered Procurement and Supply Professional', 'procurement-supply'),
  ('a1000009-0000-0000-0000-000000000005', 'CFCS', 'Legal & Compliance', 'Certified Financial Crime Specialist', 'legal-compliance'),

  -- Agriculture, environment & energy
  ('a1000010-0000-0000-0000-000000000001', 'Pest Control Certification', 'Agriculture', 'Pest Control Operator Certification', 'agriculture-food-production'),
  ('a1000010-0000-0000-0000-000000000002', 'Organic Farming Certificate', 'Agriculture', 'Certified Organic Farming Certificate', 'agriculture-food-production'),
  ('a1000010-0000-0000-0000-000000000003', 'Solar Installer Certification', 'Energy', 'NABCEP Solar PV Installer Certification', 'energy-utilities'),
  ('a1000010-0000-0000-0000-000000000004', 'Electrician License', 'Energy', 'Certified Electrician License', 'construction-engineering'),
  ('a1000010-0000-0000-0000-000000000005', 'Welding Certification', 'Construction', 'Certified Welding Inspector', 'construction-engineering'),
  ('a1000010-0000-0000-0000-000000000006', 'Scaffolding Certificate', 'Construction', 'Certified Scaffolding Erection Certificate', 'construction-engineering'),
  ('a1000010-0000-0000-0000-000000000007', 'Forklift Certification', 'Operations', 'Forklift Operator Certification', 'logistics-transport'),
  ('a1000010-0000-0000-0000-000000000008', 'HGV License', 'Operations', 'Heavy Goods Vehicle Driving License', 'logistics-transport'),
  ('a1000010-0000-0000-0000-000000000009', 'CPC Driver Certificate', 'Operations', 'Certificate of Professional Competence for Drivers', 'logistics-transport');
