import Database from '../../../../sqlite/sync-database'
import { describe, expect, it } from 'vitest'
import { OrchestrationDb } from '../orchestration-db'
import { SCHEMA_VERSION } from '../contract-constants'

/** A pre-v31 database, with the narrow archive CHECK and no structured pointer table. */
function seedLegacyDatabase(path: string): void {
  const db = new Database(path)
  db.exec(`
    CREATE TABLE worker_terminal_archives (
      dispatch_id   TEXT PRIMARY KEY,
      resource_id   TEXT NOT NULL,
      kind          TEXT NOT NULL CHECK(kind IN ('transcript_pin', 'terminal_tail')),
      content       TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO worker_terminal_archives (dispatch_id, resource_id, kind, content, created_at)
      VALUES ('d_old', 'res_old', 'terminal_tail', '{"lines":["kept"]}', '2026-01-01 00:00:00');
  `)
  db.pragma('user_version = 30')
  db.close()
}

describe('structured pointer schema migration', () => {
  it('admits the structured archive kind and keeps existing rows', () => {
    const path = `${process.env.TMPDIR ?? '/tmp'}/orca-structured-migration-${process.pid}-${Date.now()}.db`
    seedLegacyDatabase(path)
    const db = new OrchestrationDb(path)
    try {
      expect(db.db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
      const kept = db.db
        .prepare('SELECT content FROM worker_terminal_archives WHERE dispatch_id = ?')
        .get('d_old') as { content: string }
      expect(kept.content).toContain('kept')
      db.storeWorkerTerminalArchive({
        dispatchId: 'd_new',
        resourceId: 'res_new',
        kind: 'structured_journal',
        content: '{"version":1}'
      })
      expect(db.getWorkerTerminalArchive('d_new')?.kind).toBe('structured_journal')
    } finally {
      db.close()
    }
  })

  it('creates the structured pointer operation store', () => {
    const db = new OrchestrationDb(':memory:')
    try {
      expect(db.getStructuredPointerOperation('dispatch:d1')).toBeUndefined()
      db.putStructuredPointerOperation({
        mailbox_handle: 'dispatch:d1',
        session_id: 's1',
        operation_id: '1757030400000-0123456789abcdef0123456789abcdef',
        body_fingerprint: 'fp',
        minted_at_ms: 1_757_030_400_000
      })
      expect(db.getStructuredPointerOperation('dispatch:d1')?.operation_id).toBe(
        '1757030400000-0123456789abcdef0123456789abcdef'
      )
      db.deleteStructuredPointerOperation('dispatch:d1')
      expect(db.getStructuredPointerOperation('dispatch:d1')).toBeUndefined()
    } finally {
      db.close()
    }
  })
})
