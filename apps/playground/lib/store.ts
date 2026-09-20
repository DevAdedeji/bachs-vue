import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export class DemoError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export interface Visitor {
  id: string;
  customer_id: string | null;
  expires: number;
}
interface Order {
  plan: string;
  status: string;
  url: string | null;
  lease: number;
}
export class DemoStore {
  db: DatabaseSync;
  now: () => number;
  constructor(path: string, now = Date.now) {
    this.now = now;
    if (path !== ':memory:')
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, expires INTEGER NOT NULL, customer_id TEXT, customer_lease INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS orders (visitor TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE, id TEXT NOT NULL, plan TEXT NOT NULL, status TEXT NOT NULL, url TEXT, lease INTEGER NOT NULL, PRIMARY KEY(visitor,id));
      CREATE TABLE IF NOT EXISTS quotas (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
  }
  close() {
    this.db.close();
  }
  transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = action();
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  quota(scope: string, limit: number, window = 86_400_000) {
    const period = Math.floor(this.now() / window);
    const row = this.db
      .prepare(
        `INSERT INTO quotas VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count`,
      )
      .get(`${scope}:${period}`, (period + 1) * window, limit);
    if (!row)
      throw new DemoError(
        429,
        'The sandbox demo limit has been reached. Please try again later.',
      );
  }
  issue() {
    return this.transaction(() => {
      this.db
        .prepare('DELETE FROM visitors WHERE expires <= ?')
        .run(this.now());
      this.db.prepare('DELETE FROM quotas WHERE expires <= ?').run(this.now());
      this.quota('sessions:minute', 20, 60_000);
      this.quota('sessions:day', 100);
      const token = randomBytes(32).toString('hex');
      const id = randomUUID();
      this.db
        .prepare('INSERT INTO visitors(id,token_hash,expires) VALUES (?,?,?)')
        .run(id, this.hash(token), this.now() + 86_400_000);
      return { token, visitor: this.visitor(token)! };
    });
  }
  hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  visitor(token: string | undefined): Visitor | undefined {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
    return this.db
      .prepare(
        'SELECT id,customer_id,expires FROM visitors WHERE token_hash=? AND expires>?',
      )
      .get(this.hash(token), this.now()) as Visitor | undefined;
  }
  claimCustomer(visitor: Visitor) {
    return this.transaction(() => {
      const row = this.db
        .prepare(
          'SELECT customer_id,customer_lease FROM visitors WHERE id=? AND expires>?',
        )
        .get(visitor.id, this.now());
      if (!row)
        throw new DemoError(
          401,
          'Your demo session expired. Reload this page to start again.',
        );
      if (typeof row.customer_id === 'string') return row.customer_id;
      if (Number(row.customer_lease) > this.now())
        throw new DemoError(
          409,
          'Your demo customer is being prepared. Please retry shortly.',
        );
      this.quota('customer-attempts:day', 200);
      this.db
        .prepare('UPDATE visitors SET customer_lease=? WHERE id=?')
        .run(this.now() + 30_000, visitor.id);
      return null;
    });
  }
  saveCustomer(visitor: Visitor, customerId: string) {
    this.db
      .prepare('UPDATE visitors SET customer_id=?,customer_lease=0 WHERE id=?')
      .run(customerId, visitor.id);
  }
  releaseCustomer(visitor: Visitor) {
    this.db
      .prepare('UPDATE visitors SET customer_lease=0 WHERE id=?')
      .run(visitor.id);
  }
  beginOrder(visitor: Visitor, id: string, plan: string): string | null {
    return this.transaction(() => {
      const existing = this.db
        .prepare(
          'SELECT plan,status,url,lease FROM orders WHERE visitor=? AND id=?',
        )
        .get(visitor.id, id) as Order | undefined;
      if (existing && existing.plan !== plan)
        throw new DemoError(409, 'Start a new checkout when switching plans.');
      if (existing?.status === 'ready') return existing.url;
      if (existing && existing.lease > this.now())
        throw new DemoError(
          409,
          'This checkout is being prepared. Please retry shortly.',
        );
      if (!existing) {
        this.quota(`orders:${visitor.id}`, 6);
        this.quota('orders:day', 200);
      }
      this.quota('checkout-attempts:minute', 30, 60_000);
      this.quota('checkout-attempts:day', 400);
      this.db
        .prepare(
          `INSERT INTO orders VALUES (?,?,?,'pending',NULL,?) ON CONFLICT(visitor,id) DO UPDATE SET status='pending',lease=excluded.lease`,
        )
        .run(visitor.id, id, plan, this.now() + 30_000);
      return null;
    });
  }
  saveOrder(visitor: Visitor, id: string, url: string) {
    this.db
      .prepare(
        "UPDATE orders SET status='ready',url=?,lease=0 WHERE visitor=? AND id=?",
      )
      .run(url, visitor.id, id);
  }
  releaseOrder(visitor: Visitor, id: string) {
    this.db
      .prepare(
        "UPDATE orders SET status='failed',lease=0 WHERE visitor=? AND id=?",
      )
      .run(visitor.id, id);
  }
  allowPortal(visitor: Visitor) {
    this.transaction(() => {
      this.quota(`portal:${visitor.id}`, 10);
      this.quota('portal:day', 200);
    });
  }
}
