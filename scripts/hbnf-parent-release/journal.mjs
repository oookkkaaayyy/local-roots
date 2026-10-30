import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { digest } from './driver.mjs';

export class FileJournal {
  constructor(root, transactionId) { this.root = path.resolve(root); this.id = transactionId; }
  async claim(transactionId, transactionSha256) {
    if (transactionId !== this.id) throw new Error('JOURNAL_TRANSACTION_MISMATCH');
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    this.lock = await open(path.join(this.root, `${this.id}.lock`), 'wx', 0o600);
    await this.append({ event: 'CLAIM', transactionSha256 });
  }
  async append(event) {
    if (!this.lock) throw new Error('JOURNAL_NOT_CLAIMED');
    const file = await open(path.join(this.root, `${this.id}.jsonl`), 'a', 0o600);
    try {
      const line = `${JSON.stringify({ ...event, previous: this.previous || null })}\n`;
      await file.write(line); await file.sync(); this.previous = digest(line);
    } finally { await file.close(); }
  }
  async close() { if (this.lock) { await this.lock.close(); this.lock = null; } }
}

export class MemoryJournal {
  constructor() { this.runs = new Map(); this.events = []; }
  async claim(id, hash) {
    if (this.runs.has(id)) throw new Error('JOURNAL_REPLAY');
    this.runs.set(id, hash); this.events.push({ event: 'CLAIM', transactionSha256: hash });
  }
  async append(event) { this.events.push(structuredClone(event)); }
}

// Append-only, independently download-back-verified journal events for review/admission workflows.
// The release remains PENDING if any single event cannot be durably retained.
export class DriveEvidenceJournal {
  constructor({ evidenceStore, folderId, transactionId, claimOnce }) { this.store=evidenceStore; this.folderId=folderId; this.id=transactionId; this.claimOnce=claimOnce; this.previous=null; this.sequence=0; this.claimed=false; }
  async claim(transactionId, transactionSha256) {
    if (this.claimed || transactionId!==this.id) throw new Error('JOURNAL_REPLAY_OR_ID_MISMATCH');
    if (typeof this.claimOnce!=='function') throw new Error('ATOMIC_DURABLE_SINGLE_USE_LOCK_UNAVAILABLE');
    await this.claimOnce(transactionId,transactionSha256);
    const receipt=await this.#write({event:'CLAIM',transactionSha256});
    this.claimed=receipt.downloadBackVerified===true;
    if(!this.claimed) throw new Error('JOURNAL_CLAIM_NOT_DURABLE');
  }
  async append(event) {
    if(!this.claimed) throw new Error('JOURNAL_NOT_CLAIMED');
    const receipt=await this.#write(event);
    if(receipt.downloadBackVerified!==true) throw new Error('JOURNAL_EVENT_NOT_DURABLE');
  }
  async #write(event) {
    const record={sequence:this.sequence++,transactionId:this.id,previous:this.previous,event};
    const bytes=Buffer.from(JSON.stringify(record));
    const receipt=await this.store.persistAndDownloadBack(`${this.id}-journal-${String(record.sequence).padStart(4,'0')}.json`,bytes,this.folderId);
    if(!receipt?.downloadBackVerified||receipt.sha256!==digest(bytes)) throw new Error('JOURNAL_DOWNLOADBACK_MISMATCH');
    this.previous=receipt.sha256;
    return receipt;
  }
}
