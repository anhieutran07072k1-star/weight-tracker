import { Table } from 'dexie';
import {
  db,
  getOrCreateDeviceId,
  getOrInitSyncMeta,
} from '../db/database';
import {
  Attachment,
  SyncConflict,
  SyncEntityType,
  SyncMetaRecord,
  SyncQueueItem,
  SyncTombstone,
} from '../types/finance';
import { DriveApiError, DriveAppFileMeta, DriveTransport } from './driveAppData';
import { decryptSyncPayload, EncryptedEnvelope, encryptSyncPayload } from './syncCrypto';
import {
  computeRecordContentHash,
  mergeSyncSnapshots,
  RemoteDriveSyncDocument,
  StructuredSyncSnapshot,
  SYNCABLE_COLLECTION_KEYS,
} from './syncMergeEngine';

export const DRIVE_STATE_FILENAME = 'khtc_sync_state_v1.enc';
export const driveAttachmentFileName = (attachmentId: string) => `khtc_att_${attachmentId}.enc`;

let memorySyncPassphrase: string | undefined;

export function setMemorySyncPassphrase(passphrase?: string): void {
  memorySyncPassphrase = passphrase?.trim() || undefined;
}

export function getMemorySyncPassphrase(): string | undefined {
  return memorySyncPassphrase;
}

function getDexieTableMap(): Record<Exclude<SyncEntityType, 'attachments'>, Table<any, string>> {
  return {
    financialAccounts: db.financialAccounts,
    transactions: db.transactions,
    categories: db.categories,
    budgets: db.budgets,
    budgetCategories: db.budgetCategories,
    transfers: db.transfers,
    savings: db.savings,
    loansGiven: db.loansGiven,
    loansTaken: db.loansTaken,
    loanRepayments: db.loanRepayments,
    specialItems: db.specialItems,
    financialEvents: db.financialEvents,
    customLedgers: db.customLedgers,
    ledgerTransactions: db.ledgerTransactions,
    diaryEntries: db.diaryEntries,
    userSettings: db.userSettings,
    quickInputAliases: db.quickInputAliases,
    balanceAdjustments: db.balanceAdjustments,
  };
}

export interface SyncRunResult {
  ok: boolean;
  pulledFromDrive: boolean;
  pushedToDrive: boolean;
  attachmentsUploaded: number;
  attachmentsDownloaded: number;
  attachmentFailures: number;
  conflictsDetected: SyncConflict[];
  errorCode?: string;
  errorMessage?: string;
  actionHint?: string;
  syncedAt?: string;
}

async function readLocalSnapshot(): Promise<StructuredSyncSnapshot> {
  const tableMap = getDexieTableMap();
  const entries = await Promise.all(
    SYNCABLE_COLLECTION_KEYS.map(async (k) => {
      const table = tableMap[k as Exclude<SyncEntityType, 'attachments'>];
      const rows = await table.toArray();
      return [k, rows] as const;
    })
  );
  const out = {} as StructuredSyncSnapshot;
  for (const [k, rows] of entries) {
    out[k] = rows;
  }
  return out;
}

function normalizeRemoteRecords(raw?: Partial<StructuredSyncSnapshot>): StructuredSyncSnapshot {
  const out = {} as StructuredSyncSnapshot;
  for (const k of SYNCABLE_COLLECTION_KEYS) {
    out[k] = Array.isArray(raw?.[k]) ? (raw![k] as Array<Record<string, any>>) : [];
  }
  return out;
}

export async function runFullTwoWaySync(params: {
  googleUid: string;
  googleEmail: string;
  transport: DriveTransport;
  passphrase?: string;
  conflictPolicy?: 'manual' | 'latest_wins' | 'local_wins' | 'remote_wins';
}): Promise<SyncRunResult> {
  const { googleUid, googleEmail, transport, passphrase, conflictPolicy = 'manual' } = params;
  const activePassphrase = passphrase ?? memorySyncPassphrase;
  const meta = await getOrInitSyncMeta();
  const deviceId = meta.deviceId || getOrCreateDeviceId();

  let pulledFromDrive = false;
  let pushedToDrive = false;
  let attachmentsUploaded = 0;
  let attachmentsDownloaded = 0;
  let attachmentFailures = 0;

  try {
    // 1. List existing appDataFolder files once to inspect state + attachment files
    const driveFiles = await transport.listAppDataFiles();
    const fileByName = new Map<string, DriveAppFileMeta>();
    for (const f of driveFiles) {
      fileByName.set(f.name, f);
    }

    const remoteStateFile = fileByName.get(DRIVE_STATE_FILENAME);
    let remoteDoc: RemoteDriveSyncDocument | null = null;

    if (remoteStateFile) {
      const rawEnvelope = await transport.downloadFileText(remoteStateFile.id);
      const envelope = JSON.parse(rawEnvelope) as EncryptedEnvelope;
      remoteDoc = await decryptSyncPayload<RemoteDriveSyncDocument>({
        envelope,
        googleUid,
        passphrase: activePassphrase,
      });
      pulledFromDrive = true;
    }

    // 2. Read local snapshot, tombstones, and pending queue
    const [localRecords, localTombstones, queueItems, localAttachments] = await Promise.all([
      readLocalSnapshot(),
      db.syncTombstones.toArray(),
      db.syncQueue.toArray(),
      db.attachments.toArray(),
    ]);

    const pendingKeys = new Set(queueItems.map((q) => q.id));

    // 3. Perform deterministic 3-way merge
    const mergeResult = mergeSyncSnapshots({
      localRecords,
      remoteRecords: normalizeRemoteRecords(remoteDoc?.records),
      localTombstones,
      remoteTombstones: remoteDoc?.tombstones ?? [],
      baseManifest: meta.baseManifest || {},
      pendingKeys,
      localDeviceId: deviceId,
      conflictPolicy,
    });

    // 4. Apply merged structured data + tombstones + conflicts atomically in IndexedDB
    const tableMap = getDexieTableMap();
    const allTables = [
      ...Object.values(tableMap),
      db.syncTombstones,
      db.syncConflicts,
      db.syncMeta,
    ];

    await db.transaction('rw', allTables, async () => {
      for (const et of SYNCABLE_COLLECTION_KEYS) {
        const table = tableMap[et as Exclude<SyncEntityType, 'attachments'>];
        const rowsToPut = mergeResult.mergedRecords[et];
        if (rowsToPut.length > 0) {
          await table.bulkPut(rowsToPut);
        }
        const deletesForTable = mergeResult.deletedRecordKeys
          .filter((d) => d.entityType === et)
          .map((d) => d.recordId);
        if (deletesForTable.length > 0) {
          await table.bulkDelete(deletesForTable);
        }
      }

      await db.syncTombstones.clear();
      if (mergeResult.mergedTombstones.length > 0) {
        await db.syncTombstones.bulkPut(mergeResult.mergedTombstones);
      }

      await db.syncConflicts.clear();
      if (mergeResult.conflicts.length > 0) {
        await db.syncConflicts.bulkPut(mergeResult.conflicts);
      }
    });

    // 5. Sync Attachments individually by ID (preserving originals locally on any failure)
    const tombstonedAttIds = new Set(
      mergeResult.mergedTombstones
        .filter((t) => t.entityType === 'attachments')
        .map((t) => t.recordId)
    );

    // Delete locally & remotely any tombstoned attachments
    for (const delId of tombstonedAttIds) {
      await db.attachments.delete(delId);
      const remoteAttFile = fileByName.get(driveAttachmentFileName(delId));
      if (remoteAttFile) {
        try {
          await transport.deleteFile(remoteAttFile.id);
        } catch {
          // Non-fatal; tombstone stays in state
        }
      }
    }

    const syncedAttSet = new Set(meta.syncedAttachmentIds || []);
    const localAttMap = new Map<string, Attachment>();
    for (const att of localAttachments) {
      if (!tombstonedAttIds.has(att.id)) {
        localAttMap.set(att.id, att);
      }
    }

    const failedAttachmentQueueItems: SyncQueueItem[] = [];
    const nowIso = new Date().toISOString();

    // 5a. Upload local attachments not yet synced on Drive
    for (const att of localAttMap.values()) {
      const fName = driveAttachmentFileName(att.id);
      const existsOnDrive = fileByName.has(fName);
      if (syncedAttSet.has(att.id) && existsOnDrive && !pendingKeys.has(`attachments:${att.id}`)) {
        continue;
      }

      try {
        const encAtt = await encryptSyncPayload<Attachment>({
          payload: {
            ...att,
            version: att.version ?? 1,
            deviceId: att.deviceId || deviceId,
            syncStatus: 'synced',
          },
          googleUid,
          passphrase: activePassphrase,
        });
        await transport.upsertJsonFile({
          name: fName,
          content: JSON.stringify(encAtt),
          existingFileId: fileByName.get(fName)?.id,
        });
        await db.attachments.update(att.id, { syncStatus: 'synced' });
        syncedAttSet.add(att.id);
        attachmentsUploaded++;
      } catch (err: any) {
        attachmentFailures++;
        failedAttachmentQueueItems.push({
          id: `attachments:${att.id}`,
          entityType: 'attachments',
          recordId: att.id,
          operation: 'upsert',
          queuedAt: nowIso,
          retryCount: (queueItems.find((q) => q.id === `attachments:${att.id}`)?.retryCount ?? 0) + 1,
          lastError: err?.userMessage || err?.message || 'Lỗi tải ảnh lên Drive',
        });
      }
    }

    // 5b. Download remote attachments missing on this device
    const remoteAttRefs = remoteDoc?.attachmentRefs ?? [];
    for (const ref of remoteAttRefs) {
      if (tombstonedAttIds.has(ref.id)) continue;
      if (localAttMap.has(ref.id)) {
        syncedAttSet.add(ref.id);
        continue;
      }
      const remoteFile = fileByName.get(driveAttachmentFileName(ref.id));
      if (!remoteFile) continue;

      try {
        const rawAtt = await transport.downloadFileText(remoteFile.id);
        const encAtt = JSON.parse(rawAtt) as EncryptedEnvelope;
        const att = await decryptSyncPayload<Attachment>({
          envelope: encAtt,
          googleUid,
          passphrase: activePassphrase,
        });
        await db.attachments.put({ ...att, syncStatus: 'synced' });
        localAttMap.set(att.id, att);
        syncedAttSet.add(att.id);
        attachmentsDownloaded++;
      } catch {
        attachmentFailures++;
        // Keep queue entry to retry downloading missing image next time
        failedAttachmentQueueItems.push({
          id: `attachments:${ref.id}`,
          entityType: 'attachments',
          recordId: ref.id,
          operation: 'upsert',
          queuedAt: nowIso,
          retryCount: 1,
          lastError: 'Chưa tải được ảnh về thiết bị, sẽ thử lại sau.',
        });
      }
    }

    // 6. Build combined attachmentRefs (local + any remote still pending download)
    const combinedAttRefsMap = new Map<string, RemoteDriveSyncDocument['attachmentRefs'][number]>();
    for (const ref of remoteAttRefs) {
      if (!tombstonedAttIds.has(ref.id)) combinedAttRefsMap.set(ref.id, ref);
    }
    for (const att of localAttMap.values()) {
      combinedAttRefsMap.set(att.id, {
        id: att.id,
        fileName: att.fileName,
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes,
        createdAt: att.createdAt,
        updatedAt: att.updatedAt,
        version: att.version ?? 1,
        deviceId: att.deviceId || deviceId,
      });
    }

    // 7. Upload merged encrypted structured state snapshot to Drive appDataFolder
    // Keep remote version on Drive for any still-unresolved conflict so Drive isn't overwritten prematurely
    const driveSafeRecords: Partial<StructuredSyncSnapshot> = { ...mergeResult.mergedRecords };
    if (mergeResult.conflicts.length > 0) {
      const conflictByKey = new Map(mergeResult.conflicts.map((c) => [c.id, c]));
      for (const et of SYNCABLE_COLLECTION_KEYS) {
        const list = driveSafeRecords[et] || [];
        driveSafeRecords[et] = list
          .map((rec) => {
            const c = conflictByKey.get(`${et}:${rec.id}`);
            if (!c) return rec;
            return c.remoteRecord ? { ...c.remoteRecord } : null;
          })
          .filter((r): r is Record<string, any> => r !== null);
      }
    }

    const nextRemoteDoc: RemoteDriveSyncDocument = {
      schemaVersion: 1,
      app: 'KeHoachThuChi',
      googleUid,
      exportedAt: nowIso,
      lastUpdatedByDeviceId: deviceId,
      records: driveSafeRecords,
      tombstones: mergeResult.mergedTombstones,
      attachmentRefs: Array.from(combinedAttRefsMap.values()),
    };

    const encryptedState = await encryptSyncPayload({
      payload: nextRemoteDoc,
      googleUid,
      passphrase: activePassphrase,
    });

    const savedStateMeta = await transport.upsertJsonFile({
      name: DRIVE_STATE_FILENAME,
      content: JSON.stringify(encryptedState),
      existingFileId: remoteStateFile?.id || meta.driveStateFileId,
    });
    pushedToDrive = true;

    // 8. Clear synced items from syncQueue (keeping only failed attachments or conflicted records)
    await db.transaction('rw', [db.syncQueue, db.syncMeta], async () => {
      await db.syncQueue.clear();
      const remainingQueue: SyncQueueItem[] = [...failedAttachmentQueueItems];
      for (const c of mergeResult.conflicts) {
        remainingQueue.push({
          id: c.id,
          entityType: c.entityType,
          recordId: c.recordId,
          operation: 'upsert',
          queuedAt: nowIso,
          retryCount: 0,
          lastError: 'Đang chờ xử lý xung đột',
        });
      }
      if (remainingQueue.length > 0) {
        await db.syncQueue.bulkPut(remainingQueue);
      }

      const nextMeta: SyncMetaRecord = {
        ...meta,
        deviceId,
        ownerGoogleUid: googleUid,
        ownerGoogleEmail: googleEmail,
        lastSyncAt: nowIso,
        lastSyncError: attachmentFailures > 0 ? `${attachmentFailures} tệp ảnh chưa đồng bộ được.` : undefined,
        lastSyncErrorAction:
          attachmentFailures > 0 ? 'Bản gốc ảnh vẫn an toàn trên máy. Nhấn "Đồng bộ ngay" khi mạng ổn định.' : undefined,
        driveStateFileId: savedStateMeta.id,
        hasCustomPassphrase: Boolean(activePassphrase),
        baseManifest: mergeResult.nextBaseManifest,
        syncedAttachmentIds: Array.from(syncedAttSet),
        updatedAt: nowIso,
      };
      await db.syncMeta.put(nextMeta);
    });

    return {
      ok: true,
      pulledFromDrive,
      pushedToDrive,
      attachmentsUploaded,
      attachmentsDownloaded,
      attachmentFailures,
      conflictsDetected: mergeResult.conflicts,
      syncedAt: nowIso,
    };
  } catch (err: any) {
    const isDriveErr = err instanceof DriveApiError;
    const code = isDriveErr ? err.code : err?.code || 'unknown';
    const message = isDriveErr
      ? err.userMessage
      : err?.message || 'Đồng bộ dữ liệu thất bại.';
    const hint = isDriveErr
      ? err.actionHint
      : code === 'PASSPHRASE_REQUIRED' || code === 'DECRYPT_FAILED'
      ? 'Nhập lại đúng Khẩu lệnh mã hóa đồng bộ trong phần Cài đặt → Đồng bộ dữ liệu.'
      : 'Dữ liệu trên thiết bị vẫn an toàn. Thử kiểm tra mạng và nhấn "Đồng bộ ngay".';

    await db.syncMeta.put({
      ...meta,
      lastSyncError: message,
      lastSyncErrorAction: hint,
      updatedAt: new Date().toISOString(),
    });

    return {
      ok: false,
      pulledFromDrive,
      pushedToDrive,
      attachmentsUploaded,
      attachmentsDownloaded,
      attachmentFailures,
      conflictsDetected: [],
      errorCode: code,
      errorMessage: message,
      actionHint: hint,
    };
  }
}

export async function resolveStoredSyncConflict(params: {
  conflictId: string;
  choice: 'local' | 'remote' | 'latest';
}): Promise<void> {
  const conflict = await db.syncConflicts.get(params.conflictId);
  if (!conflict) return;

  const meta = await getOrInitSyncMeta();
  const tableMap = getDexieTableMap();
  const table = tableMap[conflict.entityType as Exclude<SyncEntityType, 'attachments'>];
  if (!table) return;

  const chooseRemote =
    params.choice === 'remote' ||
    (params.choice === 'latest' && conflict.remoteUpdatedAt > conflict.localUpdatedAt);

  const chosenRecord = chooseRemote ? conflict.remoteRecord : conflict.localRecord;
  const now = new Date().toISOString();

  await db.transaction(
    'rw',
    [table, db.syncConflicts, db.syncTombstones, db.syncQueue, db.syncMeta],
    async () => {
      if (chosenRecord) {
        const nextVersion =
          Math.max(conflict.localRecord?.version ?? 1, conflict.remoteRecord?.version ?? 1) + 1;
        const resolved = {
          ...chosenRecord,
          version: nextVersion,
          deviceId: meta.deviceId,
          updatedAt: now,
          syncStatus: 'pending' as const,
          ...(conflict.remoteTombstone
            ? { resolvedFromTombstoneVersion: conflict.remoteTombstone.version }
            : {}),
        };
        await table.put(resolved);
        await db.syncTombstones.delete(conflict.id);
        await db.syncQueue.put({
          id: conflict.id,
          entityType: conflict.entityType,
          recordId: conflict.recordId,
          operation: 'upsert',
          queuedAt: now,
          retryCount: 0,
        });
        if (conflict.remoteRecord) {
          meta.baseManifest[conflict.id] = {
            version: conflict.remoteRecord.version ?? 1,
            updatedAt: conflict.remoteRecord.updatedAt,
            hash: computeRecordContentHash(conflict.remoteRecord),
          };
        } else {
          delete meta.baseManifest[conflict.id];
        }
      } else {
        // Chosen side was a deletion
        await table.delete(conflict.recordId);
        await db.syncTombstones.put({
          id: conflict.id,
          entityType: conflict.entityType,
          recordId: conflict.recordId,
          deletedAt: now,
          deletedByDeviceId: meta.deviceId,
          version: Math.max(conflict.remoteTombstone?.version ?? 1, conflict.localRecord?.version ?? 1) + 1,
        });
        await db.syncQueue.put({
          id: conflict.id,
          entityType: conflict.entityType,
          recordId: conflict.recordId,
          operation: 'delete',
          queuedAt: now,
          retryCount: 0,
        });
        delete meta.baseManifest[conflict.id];
      }

      await db.syncConflicts.delete(conflict.id);
      await db.syncMeta.put({ ...meta, updatedAt: now });
    }
  );
}

export async function clearLocalFinancialDataForAccountSwitch(): Promise<void> {
  const tableMap = getDexieTableMap();
  const tables = [
    ...Object.values(tableMap),
    db.attachments,
    db.syncTombstones,
    db.syncQueue,
    db.syncConflicts,
    db.syncMeta,
    db.backupHistory,
  ];
  await db.transaction('rw', tables, async () => {
    for (const t of tables) {
      await t.clear();
    }
  });
}
