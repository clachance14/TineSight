---
name: db-alignment-audit
description: Check that database schema, queries, and code types are in alignment.
---

You are Claude Code working inside an existing codebase.

Goal:
Check that the **database schema**, the **queries**, and the **code level types** are consistent.
Find mismatches in table names, column names, types, enums, relationships, and flags.

This command must work for different stacks. Do not assume a specific framework or database.
Common stacks include:
- SQL databases: Postgres, MySQL, SQLite
- ORMs: Prisma, Sequelize, TypeORM, Django ORM, SQLAlchemy, Ecto, etc
- Raw SQL in code
- Generated types or models in TypeScript, Python, or other languages

When this command is run, follow these steps.

---

## 1. Determine scope

If the codebase is large (more than 10 tables or models), ask the user:

- Audit all tables, or
- Focus on specific tables or modules

For smaller codebases, audit everything without asking.

---

## 2. Detect the database and schema source

**TineSight fast-path** (this repo): the stack is fixed — Supabase Postgres, migrations in `supabase/migrations/`, generated types in `types/database.ts` (regen: `npx supabase gen types typescript --linked > types/database.ts`). Data access goes through `lib/services/*.ts`; tenancy is primarily `user_id` (with `account_id` on a few tables), enforced by RLS via `auth.uid()`. Treat `types/database.ts` as the generated source of truth and skip straight to step 3. The generic detection below applies when this command is reused in another repo.

Figure out how the project defines its database.

Look for, in this rough order:

- Migration or schema folders and files
  Examples:
  - `migrations/`, `db/migrations/`, `database/migrations/`, `supabase/migrations/`
  - `schema.sql`, `db/schema.sql`
- ORM schema or models
  Examples:
  - `prisma/schema.prisma`
  - `models/`, `entities/`, `src/models/`, `app/models/`
  - Django `models.py` files
  - SQLAlchemy models
- Generated type files
  Examples:
  - `types/database.ts`, `generated/`, `prisma/generated/`
- Database config
  Examples:
  - `ormconfig.*`, `alembic.ini`, `knexfile.*`, `config/database.*`

From what you find, build an internal picture of:

- Tables or collections
- Columns or fields
  - Name
  - Type
  - Nullability
  - Default values, if visible
- Enums or status fields, if defined
- Foreign keys and relationships
- Row level security or access policies, if present

If the project has more than one schema source, note that and say which one appears to be primary.

If you cannot find any schema, say that clearly and stop with a short explanation.

---

## 3. Check for stale generated types

If the project uses generated types (Prisma, Supabase, GraphQL codegen, etc):

- Compare timestamps of schema files vs generated type files
- If schema files are newer than generated types, flag this immediately
- Note which regeneration command should be run

This check happens before the main audit because stale types cause false positives.

---

## 4. Scan the code for database usage

Search the codebase for database usage. Cover:

- Raw SQL strings in code
  - `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE TABLE`, etc
- ORM calls and query builders
  Examples:
  - Prisma client calls like `prisma.user.findMany`
  - Sequelize or TypeORM model calls
  - Knex query builders
  - Django ORM queries
  - SQLAlchemy queries
  - Supabase client calls like `supabase.from('users').select()`
- Types or models that mirror database rows
  - TypeScript interfaces or types
  - Python dataclasses or Pydantic models
  - Go structs
  - Other domain models that clearly map to tables
- Join queries and relationship traversals
- RLS bypass patterns (service role usage, if applicable)

Flag as high priority:

- Hard coded table names and column names
- Hard coded status strings and enums
- Flags or milestone style fields that look like booleans or enums
- Relationship traversals and joins

---

## 5. Compare schema vs code

Compare what the schema says with what the code expects.

Look for:

1. **Missing or extra columns**
   - Column name used in queries but not present in schema
   - Column in schema that is never referenced anywhere in code (note as info, lower priority)

2. **Type mismatches**
   - Code treats a column as string but schema says integer
   - Code treats a column as non nullable but schema allows null
   - Code assumes a default that the schema does not set

3. **Enum and status mismatches**
   - Enum values in code that do not exist in the database enum
   - Strings used in code that do not match the documented or modeled enum
   - Spelling and casing differences that will break in production

4. **Relationship mismatches**
   - Code expects a relation that does not exist in schema
   - Join queries reference non existent foreign keys
   - Cascade behavior assumptions that do not match schema
   - Incorrect cardinality (code assumes one-to-one but schema is one-to-many)

5. **Duplicate sources of truth**
   - Same table or enum definitions repeated in multiple files
   - Status or milestone names repeated as string literals instead of a single shared definition

6. **Access control mismatches** (if RLS or similar is detected)
   - Queries from client code that assume access the schema does not grant
   - Missing RLS policies for tables accessed from browser
   - Service role usage where anon would suffice, or vice versa

If the stack has generated types, check that:

- Custom types or models in code match those generated types
- There are no hand written types that drift from the generated ones

---

## 6. Produce a structured report

Output a clear report in this format.

### 1. Summary

Short summary of what you checked:

- Detected database and ORM
- Schema source file or folder
- Generated types location and freshness
- Tables or models audited
- Scope (full or partial)

If detection is uncertain, say so.

### 2. Problems found

Group issues by severity and category.

#### Severity Levels

- **Critical**: Will cause runtime errors or data corruption. Fix before deploying.
- **Warning**: May cause subtle bugs or unexpected behavior. Fix soon.
- **Info**: Hygiene issues, technical debt. Fix when convenient.

#### 2.1 Critical issues

For each issue:

- Severity: Critical
- File and location in code
- What the code expects
- What the schema defines
- Impact: specific error or failure mode

Examples: missing columns, type mismatches that cause crashes, broken foreign keys.

#### 2.2 Warnings

Same pattern:

- Severity: Warning
- File and location
- Code assumption vs schema reality
- Impact: what could go wrong

Examples: nullability mismatches, enum drift, relationship assumptions.

#### 2.3 Info

- Severity: Info
- Location
- Description
- Recommendation

Examples: unused columns, scattered definitions, redundant types.

If there are no issues in a category, say "None found" and move on.

### 3. Source of truth strategy

Based on what you found, recommend:

- Which file or system should be the primary source of truth
- How types should flow (schema → generated types → code)
- Where enums and constants should live
- How to prevent future drift

Tie recommendations to specific issues found.

### 4. Code level patch suggestions

Provide targeted diffs for the highest value fixes.
For each diff:

- Show a minimal, focused `diff` block
- State the severity of the issue it fixes
- Explain what bug or failure it prevents

Prioritize critical issues first, then warnings.

Examples:

- Fixing a column name in a query
- Aligning a TypeScript type to the actual schema
- Replacing repeated strings with a shared enum
- Adding a missing foreign key check

### 5. Validation commands

If applicable, list stack specific commands the developer should run:

| Stack | Command |
|-------|---------|
| Prisma | `npx prisma validate && npx prisma generate` |
| Supabase | `npx supabase gen types typescript --linked > types/database.ts` |
| Django | `python manage.py check && python manage.py makemigrations --check` |
| Alembic | `alembic check` |
| TypeORM | `npx typeorm schema:log` |

Only list commands relevant to the detected stack.

---

## 7. Behavior rules

- Be explicit. Do not say "all good" unless you actually inspected the relevant files.
- If detection of the database or ORM is ambiguous, say what clues you saw and what you assumed.
- Prefer small, low risk changes that improve alignment.
- If you cannot safely guess which side is correct, present both options and recommend a standard, but leave the final choice to the developer.
- Always check generated type freshness before reporting type mismatches.
- When reporting issues, be specific about file paths and line numbers.
- Do not overwhelm with info level issues. Cap at 5 unless the user asks for more.
