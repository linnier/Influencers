import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const globalDB = globalThis as typeof globalThis & { influencersDB?: DatabaseSync };
export function database() {
  if (!globalDB.influencersDB) {
    const file = process.env.INFLUENCERS_DB_PATH || resolve(process.cwd(), "data/influencers.sqlite");
    if (file !== ":memory:") mkdirSync(dirname(resolve(file)), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS influencers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, handle TEXT NOT NULL, platform TEXT NOT NULL,
        category TEXT NOT NULL, followers INTEGER NOT NULL CHECK(followers >= 0),
        engagement REAL NOT NULL CHECK(engagement >= 0 AND engagement <= 100),
        quote REAL NOT NULL CHECK(quote >= 0), status TEXT NOT NULL, contact TEXT NOT NULL,
        city TEXT NOT NULL, notes TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, brand TEXT NOT NULL, budget REAL NOT NULL CHECK(budget >= 0),
        status TEXT NOT NULL, startDate TEXT NOT NULL, endDate TEXT NOT NULL,
        description TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS project_influencers (
        projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        influencerId TEXT NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
        PRIMARY KEY (projectId, influencerId)
      );
      CREATE TABLE IF NOT EXISTS followups (
        id TEXT PRIMARY KEY, influencerId TEXT NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
        channel TEXT NOT NULL, date TEXT NOT NULL, nextDate TEXT NOT NULL,
        content TEXT NOT NULL, createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS followups_influencer ON followups(influencerId);
      CREATE INDEX IF NOT EXISTS project_influencers_influencer ON project_influencers(influencerId);
    `);
    globalDB.influencersDB = db;
  }
  return globalDB.influencersDB;
}
export function transaction<T>(run: () => T): T {
  const db = database();
  db.exec("BEGIN IMMEDIATE");
  try { const result = run(); db.exec("COMMIT"); return result; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}
