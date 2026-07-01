import { integer, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { appSchema } from './users';
import { projects } from './projects';

export const httpMethodValues = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const;
export type HttpMethod = (typeof httpMethodValues)[number];

export const responseTypeValues = ['json', 'url_encoded'] as const;
export type ResponseType = (typeof responseTypeValues)[number];

export const projectApis = appSchema.table('project_apis', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const apiRoutes = appSchema.table(
  'api_routes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    api_id: uuid('api_id')
      .notNull()
      .references(() => projectApis.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    method: text('method').$type<HttpMethod>().notNull(),
    status_code: integer('status_code').notNull().default(200),
    response_type: text('response_type').$type<ResponseType>().notNull(),
    response_body: text('response_body').notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    apiMethodPathUnique: unique('api_routes_api_method_path_unique').on(
      table.api_id,
      table.method,
      table.path
    ),
  })
);

export type ProjectApi = typeof projectApis.$inferSelect;
export type ApiRoute = typeof apiRoutes.$inferSelect;
