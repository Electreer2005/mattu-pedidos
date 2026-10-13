import {integer,sqliteTable,text} from 'drizzle-orm/sqlite-core';
export const orders=sqliteTable('orders',{id:text('id').primaryKey(),data:text('data').notNull(),revision:integer('revision').notNull().default(1),updatedAt:text('updated_at').notNull()});
