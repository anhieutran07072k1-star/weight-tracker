import { SyncConflict, SyncEntityType, SyncTombstone } from '../types/finance';

export type StructuredSyncEntityType = Exclude<SyncEntityType, 'attachments'>;

export const SYNCABLE_COLLECTION_KEYS: StructuredSyncEntityType[] = [
  'financialAccounts',
  'transactions',
  'categories',
  'budgets',
  'budgetCategories',
  'transfers',
  'savings',
  'loansGiven',
  'loansTaken',
  'loanRepayments',
  'specialItems',
  'financialEvents',
  'customLedgers',
  'ledgerTransactions',
  'diaryEntries',
  'userSettings',
  'quickInputAliases',
  'balanceAdjustments',
];

export type StructuredSyncSnapshot = Record<StructuredSyncEntityType, Array<Record<string, any>>>;

export interface RemoteDriveSyncDocument {
  schemaVersion: 1;
  app: 'KeHoachThuChi';
  googleUid: string;
  exportedAt: string;
  lastUpdatedByDeviceId: string;
  records: Partial<StructuredSyncSnapshot>;
  tombstones: SyncTombstone[];
  /** Metadata of attachments expected on Drive (without base64 dataUrl) */
  attachmentRefs: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    updatedAt: string;
    version: number;
    deviceId: string;
  }>;
}

export interface BaseManifestEntry {
  version: number;
  updatedAt: string;
  hash: string;
}

export type BaseManifestMap = Record<string, BaseManifestEntry>;

// Deterministic canonical JSON hash ignoring volatile syncStatus/version/deviceId metadata for equality comparison
export function computeRecordContentHash(record: Record<string, any>): string {
  const clean: Record<string, any> = {};
  const keys = Object.keys(record).sort();
  for (const k of keys) {
    if (k === 'syncStatus' || k === 'version' || k === 'deviceId') continue;
    clean[k] = record[k];
  }
  const str = JSON.stringify(clean);
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0') + '_' + str.length;
}

function makeKey(entityType: SyncEntityType, recordId: string): string {
  return `${entityType}:${recordId}`;
}

function isUntouchedStarterRecord(entityType: SyncEntityType, rec: Record<string, any>): boolean {
  if (entityType === 'userSettings' && rec.id === 'default') {
    return (rec.version ?? 1) <= 1;
  }
  if (
    entityType === 'financialAccounts' &&
    typeof rec.id === 'string' &&
    rec.id.startsWith('acc_') &&
    (rec.initialBalance ?? 0) === 0 &&
    (rec.version ?? 1) <= 1
  ) {
    return true;
  }
  if (
    (entityType === 'categories' || entityType === 'quickInputAliases') &&
    (rec.version ?? 1) <= 1 &&
    rec.createdAt === rec.updatedAt
  ) {
    return true;
  }
  return false;
}

export interface MergeSnapshotsInput {
  localRecords: StructuredSyncSnapshot;
  remoteRecords: StructuredSyncSnapshot;
  localTombstones: SyncTombstone[];
  remoteTombstones: SyncTombstone[];
  baseManifest: BaseManifestMap;
  pendingKeys: Set<string>;
  localDeviceId: string;
  conflictPolicy?: 'manual' | 'latest_wins' | 'local_wins' | 'remote_wins';
}

export interface MergeSnapshotsResult {
  mergedRecords: StructuredSyncSnapshot;
  mergedTombstones: SyncTombstone[];
  conflicts: SyncConflict[];
  nextBaseManifest: BaseManifestMap;
  deletedRecordKeys: Array<{ entityType: SyncEntityType; recordId: string }>;
}

export function mergeSyncSnapshots(input: MergeSnapshotsInput): MergeSnapshotsResult {
  const {
    localRecords,
    remoteRecords,
    localTombstones,
    remoteTombstones,
    baseManifest,
    pendingKeys,
    localDeviceId,
    conflictPolicy = 'manual',
  } = input;

  // 1. Merge tombstones (keep newest deletion per entity+id)
  const tombstoneMap = new Map<string, SyncTombstone>();
  for (const t of [...localTombstones, ...remoteTombstones]) {
    if (!t || !t.entityType || !t.recordId) continue;
    const key = makeKey(t.entityType, t.recordId);
    const prev = tombstoneMap.get(key);
    if (
      !prev ||
      t.deletedAt > prev.deletedAt ||
      (t.deletedAt === prev.deletedAt && t.version > prev.version)
    ) {
      tombstoneMap.set(key, t);
    }
  }

  const mergedRecords = {} as StructuredSyncSnapshot;
  for (const et of SYNCABLE_COLLECTION_KEYS) {
    mergedRecords[et] = [];
  }

  const conflicts: SyncConflict[] = [];
  const nextBaseManifest: BaseManifestMap = {};
  const deletedRecordKeys: Array<{ entityType: SyncEntityType; recordId: string }> = [];
  const nowIso = new Date().toISOString();

  for (const entityType of SYNCABLE_COLLECTION_KEYS) {
    const localList = localRecords[entityType] || [];
    const remoteList = remoteRecords[entityType] || [];

    const localMap = new Map<string, Record<string, any>>();
    const remoteMap = new Map<string, Record<string, any>>();
    const allIds = new Set<string>();

    for (const r of localList) {
      if (r && r.id) {
        localMap.set(r.id, r);
        allIds.add(r.id);
      }
    }
    for (const r of remoteList) {
      if (r && r.id) {
        remoteMap.set(r.id, r);
        allIds.add(r.id);
      }
    }

    for (const recordId of allIds) {
      const key = makeKey(entityType, recordId);
      const localRec = localMap.get(recordId);
      const remoteRec = remoteMap.get(recordId);
      const tomb = tombstoneMap.get(key);
      const base = baseManifest[key];

      // Case A: Tombstone exists for this ID
      if (tomb) {
        const localNewerThanDelete =
          localRec &&
          (localRec.updatedAt > tomb.deletedAt ||
            ((localRec.version ?? 1) > tomb.version && pendingKeys.has(key)));
        const remoteNewerThanDelete =
          remoteRec &&
          (remoteRec.updatedAt > tomb.deletedAt || (remoteRec.version ?? 1) > tomb.version);

        // If local was edited AFTER remote deleted it -> check if user already resolved this delete conflict
        if (localRec && !remoteRec && localNewerThanDelete && tomb.deletedByDeviceId !== localDeviceId) {
          if ((localRec.resolvedFromTombstoneVersion ?? 0) >= tomb.version) {
            tombstoneMap.delete(key);
            const chosen: Record<string, any> = { ...localRec, syncStatus: 'synced' as const };
            mergedRecords[entityType].push(chosen);
            nextBaseManifest[key] = {
              version: chosen.version ?? 1,
              updatedAt: chosen.updatedAt,
              hash: computeRecordContentHash(chosen),
            };
          } else if (conflictPolicy === 'local_wins' || conflictPolicy === 'latest_wins') {
            tombstoneMap.delete(key);
            const chosen: Record<string, any> = { ...localRec, syncStatus: 'synced' as const };
            mergedRecords[entityType].push(chosen);
            nextBaseManifest[key] = {
              version: chosen.version ?? 1,
              updatedAt: chosen.updatedAt,
              hash: computeRecordContentHash(chosen),
            };
          } else if (conflictPolicy === 'remote_wins') {
            deletedRecordKeys.push({ entityType, recordId });
          } else {
            // Hold local record & surface edit_delete conflict
            const held: Record<string, any> = { ...localRec, syncStatus: 'conflict' as const };
            mergedRecords[entityType].push(held);
            if (base) nextBaseManifest[key] = base;
            conflicts.push({
              id: key,
              entityType,
              recordId,
              conflictKind: 'edit_delete',
              localRecord: localRec,
              remoteRecord: null,
              remoteTombstone: tomb,
              localUpdatedAt: localRec.updatedAt,
              remoteUpdatedAt: tomb.deletedAt,
              localDeviceId: localRec.deviceId || localDeviceId,
              remoteDeviceId: tomb.deletedByDeviceId,
              detectedAt: nowIso,
            });
          }
          continue;
        }

        if (remoteRec && !localRec && remoteNewerThanDelete && tomb.deletedByDeviceId === localDeviceId) {
          if (conflictPolicy === 'remote_wins' || conflictPolicy === 'latest_wins') {
            tombstoneMap.delete(key);
            const chosen: Record<string, any> = { ...remoteRec, syncStatus: 'synced' as const };
            mergedRecords[entityType].push(chosen);
            nextBaseManifest[key] = {
              version: chosen.version ?? 1,
              updatedAt: chosen.updatedAt,
              hash: computeRecordContentHash(chosen),
            };
          } else if (conflictPolicy === 'local_wins') {
            deletedRecordKeys.push({ entityType, recordId });
          } else {
            const held: Record<string, any> = { ...remoteRec, syncStatus: 'conflict' as const };
            mergedRecords[entityType].push(held);
            conflicts.push({
              id: key,
              entityType,
              recordId,
              conflictKind: 'delete_edit',
              localRecord: null,
              remoteRecord: remoteRec,
              remoteTombstone: tomb,
              localUpdatedAt: tomb.deletedAt,
              remoteUpdatedAt: remoteRec.updatedAt,
              localDeviceId,
              remoteDeviceId: remoteRec.deviceId || 'remote',
              detectedAt: nowIso,
            });
          }
          continue;
        }

        // Standard tombstone deletion wins (record stays deleted across devices)
        deletedRecordKeys.push({ entityType, recordId });
        continue;
      }

      // Case B: Local only (new on this device)
      if (localRec && !remoteRec) {
        const synced: Record<string, any> = {
          ...localRec,
          version: localRec.version ?? 1,
          deviceId: localRec.deviceId || localDeviceId,
          syncStatus: 'synced' as const,
        };
        mergedRecords[entityType].push(synced);
        nextBaseManifest[key] = {
          version: synced.version,
          updatedAt: synced.updatedAt,
          hash: computeRecordContentHash(synced),
        };
        continue;
      }

      // Case C: Remote only (new on another device)
      if (!localRec && remoteRec) {
        const synced: Record<string, any> = {
          ...remoteRec,
          version: remoteRec.version ?? 1,
          syncStatus: 'synced' as const,
        };
        mergedRecords[entityType].push(synced);
        nextBaseManifest[key] = {
          version: synced.version,
          updatedAt: synced.updatedAt,
          hash: computeRecordContentHash(synced),
        };
        continue;
      }

      // Case D: Exists on BOTH local and remote
      if (localRec && remoteRec) {
        const localHash = computeRecordContentHash(localRec);
        const remoteHash = computeRecordContentHash(remoteRec);

        if (localHash === remoteHash) {
          const winner =
            (remoteRec.version ?? 1) > (localRec.version ?? 1) ||
            remoteRec.updatedAt > localRec.updatedAt
              ? remoteRec
              : localRec;
          const synced: Record<string, any> = { ...winner, syncStatus: 'synced' as const };
          mergedRecords[entityType].push(synced);
          nextBaseManifest[key] = {
            version: synced.version ?? 1,
            updatedAt: synced.updatedAt,
            hash: localHash,
          };
          continue;
        }

        const localChanged = !base || pendingKeys.has(key) || localHash !== base.hash;
        const remoteChanged = !base || remoteHash !== base.hash;

        if (localChanged && !remoteChanged) {
          const synced: Record<string, any> = { ...localRec, syncStatus: 'synced' as const };
          mergedRecords[entityType].push(synced);
          nextBaseManifest[key] = {
            version: synced.version ?? 1,
            updatedAt: synced.updatedAt,
            hash: localHash,
          };
          continue;
        }

        if (remoteChanged && !localChanged) {
          const synced: Record<string, any> = { ...remoteRec, syncStatus: 'synced' as const };
          mergedRecords[entityType].push(synced);
          nextBaseManifest[key] = {
            version: synced.version ?? 1,
            updatedAt: synced.updatedAt,
            hash: remoteHash,
          };
          continue;
        }

        // Handle untouched seeded defaults on first sync gracefully
        if (!base) {
          if (entityType === 'userSettings' && localRec.id === 'default') {
            const winner = isUntouchedStarterRecord('userSettings', localRec)
              ? remoteRec
              : localRec.updatedAt >= remoteRec.updatedAt
              ? localRec
              : remoteRec;
            const synced: Record<string, any> = { ...winner, syncStatus: 'synced' as const };
            mergedRecords[entityType].push(synced);
            nextBaseManifest[key] = {
              version: synced.version ?? 1,
              updatedAt: synced.updatedAt,
              hash: computeRecordContentHash(synced),
            };
            continue;
          }
          if (isUntouchedStarterRecord(entityType, localRec) && !isUntouchedStarterRecord(entityType, remoteRec)) {
            const synced: Record<string, any> = { ...remoteRec, syncStatus: 'synced' as const };
            mergedRecords[entityType].push(synced);
            nextBaseManifest[key] = {
              version: synced.version ?? 1,
              updatedAt: synced.updatedAt,
              hash: remoteHash,
            };
            continue;
          }
          if (isUntouchedStarterRecord(entityType, remoteRec) && !isUntouchedStarterRecord(entityType, localRec)) {
            const synced: Record<string, any> = { ...localRec, syncStatus: 'synced' as const };
            mergedRecords[entityType].push(synced);
            nextBaseManifest[key] = {
              version: synced.version ?? 1,
              updatedAt: synced.updatedAt,
              hash: localHash,
            };
            continue;
          }
        }

        // True 2-way conflict (both sides edited the same record differently!)
        if (conflictPolicy === 'local_wins') {
          const winner: Record<string, any> = {
            ...localRec,
            version: Math.max(localRec.version ?? 1, remoteRec.version ?? 1) + 1,
            syncStatus: 'synced' as const,
          };
          mergedRecords[entityType].push(winner);
          nextBaseManifest[key] = {
            version: winner.version,
            updatedAt: winner.updatedAt,
            hash: localHash,
          };
        } else if (conflictPolicy === 'remote_wins') {
          const winner: Record<string, any> = {
            ...remoteRec,
            version: Math.max(localRec.version ?? 1, remoteRec.version ?? 1) + 1,
            syncStatus: 'synced' as const,
          };
          mergedRecords[entityType].push(winner);
          nextBaseManifest[key] = {
            version: winner.version,
            updatedAt: winner.updatedAt,
            hash: remoteHash,
          };
        } else if (conflictPolicy === 'latest_wins') {
          const pickRemote = remoteRec.updatedAt > localRec.updatedAt;
          const baseWinner = pickRemote ? remoteRec : localRec;
          const winner: Record<string, any> = {
            ...baseWinner,
            version: Math.max(localRec.version ?? 1, remoteRec.version ?? 1) + 1,
            syncStatus: 'synced' as const,
          };
          mergedRecords[entityType].push(winner);
          nextBaseManifest[key] = {
            version: winner.version,
            updatedAt: winner.updatedAt,
            hash: computeRecordContentHash(winner),
          };
        } else {
          // Manual conflict resolution required: keep local temporarily & preserve remote base hash
          const held: Record<string, any> = { ...localRec, syncStatus: 'conflict' as const };
          mergedRecords[entityType].push(held);
          nextBaseManifest[key] = {
            version: remoteRec.version ?? 1,
            updatedAt: remoteRec.updatedAt,
            hash: remoteHash,
          };
          conflicts.push({
            id: key,
            entityType,
            recordId,
            conflictKind: 'edit_edit',
            localRecord: localRec,
            remoteRecord: remoteRec,
            localUpdatedAt: localRec.updatedAt,
            remoteUpdatedAt: remoteRec.updatedAt,
            localDeviceId: localRec.deviceId || localDeviceId,
            remoteDeviceId: remoteRec.deviceId || 'remote',
            detectedAt: nowIso,
          });
        }
      }
    }
  }

  // Merge attachment tombstones into final tombstone list too
  const mergedTombstones = Array.from(tombstoneMap.values());

  return {
    mergedRecords,
    mergedTombstones,
    conflicts,
    nextBaseManifest,
    deletedRecordKeys,
  };
}
