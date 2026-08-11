/**
 * The single adapter swap point (Section 2.2).
 *
 * Today's default is Dexie over IndexedDB. To move data elsewhere — sql.js,
 * a REST API, Supabase, … — replace this line with another VizquoRepository
 * implementation. Nothing else in engine/ or ui/ changes.
 */

import { IndexedDbRepository } from './adapters/indexeddb/indexeddb-repository';
import { VizquoDatabase } from './adapters/indexeddb/schema';
import type { VizquoRepository } from './repository';

export const repository: VizquoRepository = new IndexedDbRepository(new VizquoDatabase());

export type { VizquoRepository };
export { IndexedDbRepository, VizquoDatabase };
