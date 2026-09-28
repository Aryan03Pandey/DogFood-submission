import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL ?? 'postgres://dogfood:dogfood@localhost:5432/dogfood'
export const sql = postgres(connectionString, { max: 10, idle_timeout: 20, connect_timeout: 10 })
export const db = drizzle(sql, { schema })
