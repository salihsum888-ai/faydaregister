# Schools & Students Registration & Reporting Module

Introduce end-to-end school-based student registration tracking: officers can toggle **School Registration** when creating or editing a record to assign a **School Name** (with smart suggestions from previously registered schools), browse all schools and their student records on a dedicated **Schools & Students** page, and export school-specific ledgers to **PDF** and **Excel (.xlsx)**.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following product and design choices have been confirmed from your answers and are locked in for implementation:

- **Confirmed Decision 1 (Registration Form UX)**: A **"Registered at a School"** toggle switch inside the Registration modal that reveals a **School Name** input field with instant autocomplete suggestions of existing schools (plus support for typing any new school name).
- **Confirmed Decision 2 (Captured Fields)**: Capture **School Name only** (`schoolName` and `isSchoolRegistration` boolean flag) to keep data entry fast and friction-free during school registration drives.
- **Confirmed Decision 3 (Visual Style)**: **Glassmorphism UI** (`glass-card-surface`, `glass-subpanel`, `glass-auth-input`) matching the main Dashboard aesthetic, paired with tabular numerals (`tabular-nums`) for all student counts and 29-digit Registration IDs.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. Extends the registration record workflow so any registration can be tagged with a **School Name**.
  2. Provides a dedicated **Schools & Students** portal (`/schools-students`) accessible from the navigation menu for both Admins and Officers.
  3. Aggregates student registrations by school into interactive Glassmorphic school cards and allows drilling into any selected school to search, filter, edit, or export its student records in **PDF** and **Excel** formats.
- **Target Audience / Persona**: Bureau registration officers conducting field enrollment drives at schools and administrators auditing school-by-school registration output.
- **Key Value**: Eliminates manual sorting of school enrollment drives by automatically grouping student records by school and generating ready-to-share school reports in one click.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Registering a Student at a School**:
     - The officer opens **Add Registration** (or edits an existing record).
     - Toggles **"School / Student Registration"** ON.
     - Types a **School Name** or clicks one of the suggested school pills/dropdown items populated dynamically from existing registrations.
     - Saves the record; the school association is persisted in Firestore and logged in the Audit Ledger.
  2. **Browsing Schools & Selecting a School**:
     - The user navigates to **Schools & Students** from the Bureau Hub menu (or directly clicks **"Add Student Record"** on the page, which opens the Registration modal with the School toggle pre-enabled).
     - Top summary strip displays **Total Schools**, **Total Enrolled Students**, **Verified (Processed) Students**, and **Pending / Rejected Counts**.
     - A grid of **Glassmorphic School Cards** shows each school's name, total student count, completion rate progress bar, and status breakdown (`Processed`, `Processing/Pending`, `Rejected`).
  3. **Viewing & Exporting a Selected School's Student Records**:
     - Clicking any School Card selects that school (or "All Schools") and smoothly reveals the **School Student Registry Table** below.
     - Users can search students by **Name** or **29-digit Registration ID**, filter by **Registration Status**, copy RIDs with one click, or edit individual student records.
     - Clicking **Export Excel (.xlsx)** or **Export PDF (.pdf)** generates a formatted report scoped to the selected school (including school header metadata, accuracy summary, and full student roster).

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-craft **Glassmorphism** (`glass-card-surface`, `glass-subpanel`, `backdrop-blur-2xl`) consistent with the main Bureau Dashboard.
  - *Color Palette & Mood*: Translucent frosted white/slate surfaces over the ambient bureau canvas, using semantic status accents—Emerald (`#10b981`) for Processed, Amber (`#f59e0b`) for Processing/Pending, Rose (`#ef4444`) for Rejected, and Primary Blue (`hsl(var(--primary))`) for active school selection.
  - *Typography & Hierarchy*: Bold geometric headings for school titles and KPIs, paired with `font-mono tabular-nums` for 29-digit Registration IDs, phone numbers, dates, and student counts.
  - *Interactive Feedback & Motion*: Smooth card elevation on hover, active ring highlight on the currently selected school card, instant filter transitions, and toast confirmation upon PDF/Excel generation.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dynamic School Discovery + Pre-filled Quick Registration**
  - *Chosen Approach*: Derive the list of schools and their live student counts directly from the `registrations` collection (`where schoolName is present`), while also allowing the user to click **"Register Student"** directly inside a selected school view with that school's name pre-filled.
  - *Why*: Zero administrative overhead—officers don't have to pre-create a school in a separate settings screen before registering students in the field, and every school card stays 100% synchronized with live student records.
- **Decision 2: Role-Aware Data Scope**
  - *Chosen Approach*: Admins see all schools and student registrations across the entire bureau; officers see the schools and student records assigned to them (matching the existing security and query model across the app).
  - *Why*: Preserves data governance and seamlessly works with existing Firestore rules and audit logging.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:
```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Firestore `registrations` Collection                 │
│     Fields added: `isSchoolRegistration?: boolean`, `schoolName?: string`│
└───────────────────┬──────────────────────────────────────┬───────────────┘
                    │                                      │
                    ▼                                      ▼
┌───────────────────────────────────────┐  ┌───────────────────────────────┐
│      RegistrationFormModal            │  │   Schools & Students Page     │
│  ┌─────────────────────────────────┐  │  │  (/schools-students)          │
│  │ School Registration Switch      │  │  │  ┌─────────────────────────┐  │
│  │  └─► School Name Input +        │  │  │  │ Top KPI Glass Strip     │  │
│  │      Existing School Suggestions│  │  │  ├─────────────────────────┤  │
│  └─────────────────────────────────┘  │  │  │ Interactive School      │  │
└───────────────────────────────────────┘  │  │ Directory Grid (Glass)  │  │
                                           │  ├─────────────────────────┤  │
                                           │  │ Selected School Student │  │
                                           │  │ Table + Search + Status │  │
                                           │  ├─────────────────────────┤  │
                                           │  │ Scoped PDF & XLSX Export│  │
                                           │  └─────────────────────────┘  │
                                           └───────────────────────────────┘
```

- **Data Model & State**:
  - Extend `Registration` interface with optional `isSchoolRegistration?: boolean` and `schoolName?: string`.
  - In `RegistrationFormModal`:
    - Add `isSchoolRegistration` boolean toggle and `schoolName` string validation (required when the toggle is enabled, trimmed, with autocomplete suggestions from existing schools).
    - Support an optional `defaultSchoolName` prop so clicking **"Add Student"** while viewing a specific school pre-populates that school automatically.
- **Interactive Component & State Mapping**:
  - **School Directory Selector**: Clicking a school card sets `selectedSchool` state, filtering the student table, status counters, and export actions to that school. Clicking the active school again or clicking `"All Schools"` resets the filter to show all student records across all schools.
  - **PDF & Excel Generators**:
    - **Excel (`xlsx`)**: Exports Student Name, 29-digit RID, School Name, Phone, Status, Rejection Reason (if any), Submission Date, Officer, and Location into a clean worksheet named after the selected school.
    - **PDF (`jspdf` + `jspdf-autotable`)**: Renders an official Bureau School Enrollment Report header with the School Name, generation date, total students, processed rate, and a formatted student table, then logs a `SCHOOL_REPORT_EXPORT` entry via `logAuditAction`.
