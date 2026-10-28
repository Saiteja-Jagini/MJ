import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  primaryKey,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { Dossier, Subject, FinalVerdict, Turn, EvidenceItem } from '../types';
export const resolvedSubjects = pgTable('resolved_subjects', {
  id: uuid('id').primaryKey(),
  sessionId: uuid('session_id').notNull(),
  subject: jsonb('subject').$type<Subject>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const runs = pgTable(
  'analysis_runs',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id').notNull(),
    title: text('title').notNull(),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('ready'),
    version: integer('schema_version').notNull().default(2),
    subject: jsonb('subject').$type<Subject>().notNull(),
    dossier: jsonb('dossier').$type<Dossier>().notNull(),
    verdict: jsonb('verdict').$type<FinalVerdict>(),
    coverage: integer('coverage').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('runs_session_created_idx').on(t.sessionId, t.createdAt),
    check('valid_coverage', sql`${t.coverage} BETWEEN 0 AND 100`),
  ],
);
export const evidence = pgTable(
  'evidence_items',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    id: text('evidence_id').notNull(),
    source: text('source').notNull(),
    componentKey: text('component_key').notNull(),
    data: jsonb('data').$type<EvidenceItem>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.id] })],
);
export const debateTurns = pgTable(
  'debate_turns',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    role: text('role').notNull(),
    data: jsonb('data').$type<Turn>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.sequence] })],
);
