# Hire Flow

RECRUITING PLATFORM PRD

1. PRODUCT OVERVIEW

Build a premium, modern, multi-tenant recruitment platform designed for companies that need to run professional hiring campaigns without purchasing or maintaining a permanent ATS.

The platform allows a company to:

Register.

Create a recruitment campaign.

Select or create a job from the Job Catalog.

Configure the job and scoring requirements.

Publish a branded candidate application link.

Receive applications through a structured candidate wizard.

Automatically score candidates using the Operon Recruitment Standard (ORS).

Review candidates through a recruiter Kanban/dashboard.

Shortlist candidates.

Move candidates through recruitment stages.

Generate interview questions based on the job.

Communicate with candidates.

Export recruitment results.

Close the campaign when hiring is complete.

The product must feel like a serious corporate recruitment platform, not a basic form builder.

2. PRODUCT PRINCIPLES

Primary principles

Simple for recruiters.

Extremely simple for candidates.

Minimal typing.

Structured data wherever possible.

Automated scoring.

Professional corporate appearance.

Mobile responsive.

Fast.

Multi-tenant.

Campaign-based.

No unnecessary AI features.

Smart forms instead of relying on AI.

Every candidate should be comparable using structured data.

Important

The system should NOT depend on an AI model to determine candidate scores.

The scoring engine must be deterministic and based on:

Qualifications

Experience

Skills

Job requirements

Answers

Certifications

Location

Availability

Other job-specific criteria

3. USER TYPES

3.1 Platform Administrator

Can:

Manage companies.

Manage tenants.

Manage job catalog.

Manage ORS blueprints.

Manage industries.

Manage job titles.

Manage system settings.

View platform statistics.

Manage subscription/campaign packages.

Suspend tenants.

3.2 Company Administrator

Can:

Register company.

Configure company profile.

Upload company logo.

Set brand colours.

Create campaigns.

Invite recruiters.

Manage jobs.

View candidates.

Configure recruitment stages.

Export candidates.

Close campaigns.

3.3 Recruiter

Can:

View assigned campaigns.

Review candidates.

Filter candidates.

Score/review candidates.

Move candidates through Kanban stages.

View candidate profiles.

Add notes.

Schedule interviews.

Send communications.

Export candidate information.

3.4 Candidate

Candidates do not need an account before applying.

They access a campaign through a public URL.

Example:

jobs.companyname.com/campaign/warehouse-manager

or:

apply.platform.com/company/campaign-id

4. MULTI-TENANT ARCHITECTURE

Every company must have isolated data.

Core entities must contain:

tenant_id

created_at

updated_at

No company should be able to access another company's:

Candidates

Jobs

Campaigns

Recruiters

Applications

Notes

Documents

Use role-based access control.

5. MAIN APPLICATION STRUCTURE

The application should contain:

Public

Landing page

Company registration

Login

Candidate application pages

Candidate application status page

Recruiter Application

Dashboard

Campaigns

Jobs

Candidates

Kanban

Job Catalog

Interviews

Communications

Reports

Company Settings

Platform Administration

Tenants

Users

Job Catalog

ORS Blueprints

Industries

Job Titles

Campaign Packages

System Settings

Audit Logs

6. LANDING PAGE

Create a premium corporate landing page.

Sections:

Hero

Headline:

Recruit Better. Hire Smarter.

Subheading:

A structured recruitment platform that helps companies collect, compare, score and manage candidates from application to hire.

Primary button:

Start Hiring

Secondary button:

See How It Works

Feature sections

Show:

Smart Applications

Structured Candidate Profiles

Automated Scoring

Recruitment Kanban

Interview Management

Candidate Communication

Job Templates

Recruitment Reports

Do not make the website overly technical.

7. COMPANY REGISTRATION

Registration fields:

Company Information

Company name

Industry

Country

City

Phone

Email

Website

Company logo

Administrator

Full name

Email

Phone

Password

Confirm password

After registration:

Company → Dashboard → Create Campaign

8. RECRUITER DASHBOARD

The dashboard should immediately show recruitment activity.

KPI cards

Active Campaigns

Total Applicants

Shortlisted

Interviews

Hired

Rejected

Recent campaigns

Table:

CampaignApplicantsShortlistedInterviewsStatus

Candidate activity

Show:

New applications

Candidates requiring review

Upcoming interviews

Recent candidate movements

Quick actions

Buttons:

Create Campaign

Add Job

View Candidates

Job Catalog

9. CAMPAIGN CREATION WIZARD

Campaign creation must be a guided wizard.

Step 1 — Campaign

Fields:

Campaign name

Internal reference

Start date

Closing date

Hiring manager

Recruiters

Step 2 — Job

Options:

Use Job Catalog

Search:

Industry

Job title

Department

Example:

Logistics → Warehouse → Warehouse Manager

Selecting a catalog job automatically loads:

Job description

Required qualifications

Experience

Skills

Questions

Scoring rules

Interview questions

Candidate form structure

Step 3 — Customize Job

Recruiter can modify:

Job title

Job description

Minimum qualification

Experience

Skills

Location

Salary information

Employment type

Closing date

The recruiter should not have to build the entire scoring system manually.

Step 4 — Candidate Requirements

Define:

Required qualifications

Required experience

Required certificates

Required skills

Location requirements

Work authorization

Availability

Documents

Step 5 — Application Form

The system generates a structured application.

Recruiter can enable/disable fields.

Step 6 — Recruitment Stages

Default Kanban:

Applied

Screening

Shortlisted

Interview

Final Review

Offer

Hired

Rejected

Recruiters can add custom stages.

Step 7 — Publish

Show:

Campaign URL

https://apply.platform.com/company/job

Buttons:

Copy Link

Preview Application

Publish Campaign

10. JOB CATALOG

The Job Catalog is one of the most important parts of the system.

It should contain standardized job templates.

Structure:

Industry → Job Family → Job Title → Blueprint

Example:

Logistics → Warehouse → Warehouse Manager → Blueprint

Each template contains:

Job title

Job description

Responsibilities

Qualifications

Experience

Skills

Competencies

Application questions

Scoring rules

Interview questions

Required documents

11. ORS — OPERON RECRUITMENT STANDARD

Build the scoring architecture around reusable blueprints.

The system should support master blueprints that control how jobs are evaluated.

Example scoring dimensions:

Qualification

0–20 points

Experience

0–20 points

Technical Skills

0–20 points

Job-specific Knowledge

0–15 points

Competencies

0–15 points

Additional Requirements

0–10 points

Total:

100 points

Different jobs can use different weights.

The database should allow:

Job → Blueprint → Criteria → Questions → Score

12. SMART APPLICATION WIZARD

This is the main candidate experience.

Candidates should not be presented with a long traditional form.

Use a multi-step wizard.

Progress indicator:

1 Personal → 2 Education → 3 Experience → 4 Skills → 5 Questions → 6 Documents → 7 Referees → 8 Review

STEP 1 — Personal Information

Fields:

First name

Middle name

Last name

Phone

Email

Date of birth

Gender

Nationality

Current location

STEP 2 — Education

Structured fields:

Qualification

Institution

Country

Start year

Completion year

Allow multiple education records.

Use dropdowns where possible.

STEP 3 — Work Experience

For each employer:

Employer

Position

Start date

End date

Current position

Responsibilities

Reason for leaving

Allow multiple records.

STEP 4 — Skills

Candidate selects skills from predefined lists.

Allow:

Technical skills

Software skills

Professional skills

Languages

STEP 5 — Job Questions

Questions are generated from the selected job template.

Question types:

Yes/No

Multiple choice

Single choice

Dropdown

Number

Date

Short text

Long text

Questions should be scored where applicable.

13. CV BUILDER

Candidates can upload an existing CV.

The platform also creates a structured candidate profile from the application.

If no CV exists, the candidate can still complete the application.

The platform should generate a clean structured CV view from:

Personal details

Education

Experience

Skills

Certifications

Referees

14. DOCUMENTS

Candidate can upload:

CV

Certificates

Identification

Licenses

Other requested documents

The recruiter can configure which documents are required.

Show:

Required

or

Optional

15. REFEREES

Collect:

Name

Organisation

Position

Relationship

Phone

Email

Allow 2–3 referees depending on campaign configuration.

16. APPLICATION REVIEW

Before submission:

Display a complete summary.

Sections:

Personal

Education

Experience

Skills

Questions

Documents

Referees

Button:

Submit Application

After submission:

Show:

Application Submitted Successfully

Provide:

Application reference

Job title

Company

Submission date

17. CANDIDATE DATABASE

Recruiter candidate table:

CandidateJobScoreExperienceQualificationStageApplied

Filters:

Campaign

Job

Score

Qualification

Experience

Skills

Location

Stage

Application date

Search:

Search candidates...

18. CANDIDATE SCORE

Every candidate receives an ORS score.

Example:

82 / 100

Display:

Qualification: 18/20

Experience: 17/20

Skills: 18/20

Knowledge: 12/15

Competencies: 12/15

Additional: 5/10

Also show:

Recommendation

Strong Match

Good Match

Possible Match

Weak Match

This recommendation must be based on configurable score thresholds.

19. KANBAN

The recruiter should have a visual Kanban.

Columns:

Applied → Screening → Shortlisted → Interview → Final Review → Offer → Hired

Candidates are cards.

Each card displays:

Candidate name

Score

Job

Experience

Qualification

Application date

Actions:

Open Profile

Move

Shortlist

Reject

Schedule Interview

Drag-and-drop should move candidates between stages.

20. CANDIDATE PROFILE

Candidate profile should be comprehensive but easy to scan.

Header:

Candidate Name

82/100 — Strong Match

Actions:

Shortlist

Move Stage

Schedule Interview

Contact

Download CV

Reject

Tabs:

Overview

Experience

Education

Skills

Documents

Answers

Referees

Interviews

Notes

Activity

21. INTERVIEW GENERATOR

For every job template, the system generates structured interview questions from the job's:

Responsibilities

Skills

Competencies

Technical requirements

Categories:

General

Technical

Behavioural

Situational

Role-specific

Recruiter can:

Use question

Edit question

Add question

Remove question

22. INTERVIEW SCORECARD

Recruiter records:

Question

Candidate answer/notes

Rating

Comments

Example:

Technical Knowledge:

1 2 3 4 5

Communication:

1 2 3 4 5

Problem Solving:

1 2 3 4 5

Overall Interview Score:

/100

23. COMMUNICATION

Campaign communication should support:

Email

Application received

Shortlisted

Interview invitation

Rejection

Offer

SMS

For important notifications.

Create reusable templates.

24. REPORTS

Recruiters can view:

Total applicants

Applicants by stage

Average candidate score

Qualification distribution

Experience distribution

Interview results

Hired candidates

Rejected candidates

Export:

Excel

CSV

PDF

25. CAMPAIGN MANAGEMENT

Campaign status:

Draft

Active

Closing Soon

Closed

Archived

Campaign dashboard should display:

Public application link

Applicant statistics

Candidate pipeline

Campaign dates

Recruiters

Job

Activity

26. BRANDING

Each company can configure:

Logo

Primary colour

Secondary colour

Company name

Application page header

Footer

Candidate application should visually reflect the company's branding while keeping the platform structure consistent.

27. UI/UX REQUIREMENTS

Use a premium corporate SaaS design.

Style:

Clean

Minimal

Professional

Spacious

Modern

Responsive

Do NOT make it look like a generic admin template.

Use:

Cards

Tables

Tabs

Side navigation

Step indicators

Progress bars

Badges

Modals

Drawers

Toast notifications

Desktop should be the primary recruiter experience.

Candidate application must be excellent on mobile.

28. NAVIGATION

Recruiter sidebar:

Dashboard

Campaigns

Candidates

Kanban

Jobs

Job Catalog

Interviews

Reports

Communications

Settings

Bottom:

Company Profile

Help

Logout

29. DATABASE CORE ENTITIES

Create database structures for:

tenants

users

roles

campaigns

jobs

job_templates

industries

job_families

job_titles

master_blueprints

blueprint_criteria

questions

question_options

scoring_rules

candidates

applications

candidate_education

candidate_experience

candidate_skills

candidate_documents

candidate_referees

candidate_answers

candidate_scores

recruitment_stages

application_stage_history

interviews

interview_questions

interview_scores

communications

notes

reports

audit_logs

All tenant-owned data must include tenant_id.

30. APPLICATION STATES

Candidate application:

Started

In Progress

Submitted

Under Review

Shortlisted

Interview

Offer

Hired

Rejected

Withdrawn

31. SECURITY

Implement:

Authentication

Role-based access

Tenant isolation

Protected routes

Secure document access

Input validation

File type validation

File size limits

Audit logging

Session management

Never expose another tenant's records through client-side filtering alone.

Database-level security must be implemented.

32. RESPONSIVE DESIGN

Desktop

Recruiter dashboard optimized for desktop.

Tablet

Dashboard remains fully usable.

Mobile

Candidate application must be optimized for mobile first.

Buttons should be large enough to tap.

Avoid large tables on mobile.

Convert tables into cards where appropriate.

33. EMPTY STATES

Every module needs a useful empty state.

Example:

No campaigns yet

"Create your first recruitment campaign to start receiving applications."

Button:

Create Campaign

34. LOADING STATES

Use:

Skeleton loaders

Button loading states

Progress indicators

Upload progress

Never leave users wondering whether an action worked.

35. ERROR HANDLING

Errors should be understandable.

Avoid technical messages such as:

500 Internal Server Error

Instead:

Something went wrong

"Your application could not be submitted. Please try again."

Provide:

Try Again

36. MVP BUILD ORDER

Build in this order.

Phase 1

Authentication

Company registration

Tenant architecture

Dashboard shell

Navigation

Company profile

Phase 2

Job Catalog

Industries

Job families

Job titles

Master blueprints

Scoring criteria

Phase 3

Campaign creation

Job selection

Job customization

Recruitment stages

Campaign publishing

Phase 4

Candidate application wizard

Candidate profile

CV upload

Documents

Referees

Application submission

Phase 5

Candidate scoring

ORS engine

Candidate database

Filters

Candidate profile

Phase 6

Kanban

Stage management

Candidate notes

Candidate activity

Phase 7

Interviews

Interview questions

Interview scorecards

Interview results

Phase 8

Communications

Email templates

SMS integration layer

Notifications

Phase 9

Reports

Exports

Campaign analytics

Phase 10

Platform administration

Tenant management

Job catalog administration

Blueprint administration

Audit logs

37. IMPLEMENTATION RULES

Do not build everything as static mockups.

Every major button should have a real action.

Examples:

Create Campaign

→ Creates database record.

Publish Campaign

→ Changes campaign status to Active.

Copy Link

→ Copies actual campaign URL.

Apply

→ Creates candidate/application records.

Submit Application

→ Saves application and changes status to Submitted.

Shortlist

→ Changes candidate/application stage.

Move Candidate

→ Updates stage and creates stage history.

Schedule Interview

→ Creates interview record.

Export

→ Generates real export data.

38. DEVELOPMENT ENVIRONMENT

The application must work in:

Development

Local development environment with:

Development database

Development authentication

Test email/SMS providers

Seed data

Demo tenant

Demo candidates

Production

Production environment must use:

Production database

Production authentication

Production storage

Production email/SMS providers

Environment variables

Secure secrets

Never hard-code credentials.

39. DEMO DATA

Create a realistic demo company.

Example:

Demo Logistics Ltd

Jobs:

Warehouse Manager

Logistics Officer

Fleet Manager

Procurement Officer

Operations Assistant

Create demo:

Candidates

Applications

Scores

Kanban stages

Interviews

Campaigns

This allows the dashboard to look populated immediately after development.

40. SUCCESS CRITERIA

The MVP is considered functional when a company can complete this entire process:

Register

↓

Create Campaign

↓

Select Job from Catalog

↓

Customize Job

↓

Publish Campaign

↓

Candidate Opens Link

↓

Candidate Completes Wizard

↓

Candidate Uploads Documents

↓

Candidate Submits Application

↓

Application Is Saved

↓

ORS Calculates Score

↓

Recruiter Sees Candidate

↓

Recruiter Reviews Score

↓

Candidate Moves Through Kanban

↓

Recruiter Schedules Interview

↓

Interview Is Scored

↓

Candidate Is Hired

↓

Recruiter Exports Recruitment Data

The entire flow must work with real database records, not simulated frontend data.

41. IMPORTANT IMPLEMENTATION INSTRUCTION

Build the application as a real production-ready SaaS foundation.

Do not prioritize visual screens over functionality.

Do not create fake buttons.

Do not use hardcoded candidate data in production views.

Use reusable components.

Use a clean database architecture.

Keep business logic separate from UI components.

Keep the ORS scoring engine independent from the UI so scoring rules can later be changed without rebuilding the candidate interface.

The Job Catalog must be reusable across thousands of job titles.

The architecture must support adding new industries, job titles, questions, scoring criteria and blueprints without changing the core application.

The candidate application must be generated from the selected job template rather than being manually recreated for every campaign.

The system must be designed so the same platform can eventually support recruitment across Malawi, Zambia and other markets.

END OF PRD, i have attached the logo

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
