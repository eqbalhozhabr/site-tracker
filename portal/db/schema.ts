import { sqliteTable, text, integer, primaryKey, index, check } from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const records = sqliteTable('records', {
  store: text('store').notNull(),
  id: text('id').notNull(),
  spaceId: text('space_id'),
  payload: text('payload').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [primaryKey({ columns: [table.store, table.id] }), index('records_space_idx').on(table.store, table.spaceId)]);
export const siteUsers = sqliteTable('site_users', {
 userId:text('user_id').primaryKey(), email:text('email').notNull(), displayName:text('display_name').notNull(), role:text('role').notNull(), createdAt:text('created_at').notNull()
}, t=>[check('site_users_role',sql`${t.role} IN ('administrator','management','project_manager','site_supervisor')`)]);
export const projectMembers = sqliteTable('project_members', {
 userId:text('user_id').notNull().references(()=>siteUsers.userId), projectId:text('project_id').notNull()
},t=>[primaryKey({columns:[t.userId,t.projectId]})]);
export const inspections = sqliteTable('inspections', {
 id:text('id').primaryKey(),projectId:text('project_id').notNull(),inspectionDate:text('inspection_date').notNull(),inspectorId:text('inspector_id').notNull(),inspectorName:text('inspector_name').notNull(),inspectorRole:text('inspector_role').notNull(),total:integer('total').notNull(),classification:text('classification').notNull(),criticalHse:integer('critical_hse').notNull().default(0),payload:text('payload').notNull(),createdAt:text('created_at').notNull()
},t=>[index('inspections_project_date').on(t.projectId,t.inspectionDate),check('inspections_total',sql`${t.total} BETWEEN 0 AND 100`)]);
export const correctiveActions = sqliteTable('corrective_actions', {
 id:text('id').primaryKey(),inspectionId:text('inspection_id').notNull().references(()=>inspections.id),projectId:text('project_id').notNull(),categoryId:text('category_id').notNull(),description:text('description').notNull(),responsiblePerson:text('responsible_person').notNull(),priority:text('priority').notNull(),targetDate:text('target_date').notNull(),status:text('status').notNull(),criticalHse:integer('critical_hse').notNull().default(0),beforePhotos:text('before_photos').notNull().default('[]'),afterPhotos:text('after_photos').notNull().default('[]'),closureNotes:text('closure_notes').notNull().default(''),revision:integer('revision').notNull().default(1),createdBy:text('created_by').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),closedAt:text('closed_at'),lastChangeId:text('last_change_id')
},t=>[index('corrective_actions_project_status').on(t.projectId,t.status,t.targetDate),check('corrective_actions_priority',sql`${t.priority} IN ('Low','Medium','High','Critical')`),check('corrective_actions_status',sql`${t.status} IN ('Open','In Progress','Closed')`)]);
export const evidence = sqliteTable('evidence', {
 id:text('id').primaryKey(),projectId:text('project_id').notNull(),inspectionId:text('inspection_id').references(()=>inspections.id),categoryId:text('category_id').notNull(),kind:text('kind').notNull(),objectKey:text('object_key').notNull().unique(),contentType:text('content_type').notNull(),size:integer('size').notNull(),uploadedBy:text('uploaded_by').notNull(),createdAt:text('created_at').notNull()
},t=>[check('evidence_kind',sql`${t.kind} IN ('category','before','after')`)]);
export const inspectionAudit = sqliteTable('inspection_audit', {
 id:text('id').primaryKey(),actorId:text('actor_id').notNull(),projectId:text('project_id'),event:text('event').notNull(),resourceId:text('resource_id').notNull(),details:text('details').notNull(),createdAt:text('created_at').notNull()
},t=>[index('inspection_audit_project_date').on(t.projectId,t.createdAt)]);
