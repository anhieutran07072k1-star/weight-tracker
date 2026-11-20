import assert from 'node:assert/strict';
import test from 'node:test';
import 'fake-indexeddb/auto';

// Provide minimal browser globals for Dexie & device ID helpers in Node test runtime
const memoryLocalStorage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => memoryLocalStorage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memoryLocalStorage.set(k, String(v));
    },
    removeItem: (k: string) => {
      memoryLocalStorage.delete(k);
    },
    clear: () => {
      memoryLocalStorage.clear();
    },
  },
  configurable: true,
});

import {
  db,
  ensureSeedDefaults,
  exportFullBackupJSON,
  getOrInitSyncMeta,
  inspectBackupFile,
  queueDeleteChanges,
  queueUpsertChanges,
  restoreBackupData,
} from '../src/db/database';
import { Attachment, Transaction } from '../src/types/finance';
import { DriveApiError, DriveAppFileMeta, DriveTransport } from '../src/utils/driveAppData';
import { decryptSyncPayload, EncryptedEnvelope, encryptSyncPayload } from '../src/utils/syncCrypto';
import { mergeSyncSnapshots } from '../src/utils/syncMergeEngine';
import {
  clearLocalFinancialDataForAccountSwitch,
  DRIVE_STATE_FILENAME,
  driveAttachmentFileName,
  resolveStoredSyncConflict,
  runFullTwoWaySync,
} from '../src/utils/syncOrchestrator';

// ---------------- In-Memory Multi-Device & Fake Google Drive AppData Harness ----------------

class FakeDriveAppDataCloud {
  files = new Map<string, { meta: DriveAppFileMeta; content: string }>();
  idCounter = 1;

  clear() {
    this.files.clear();
    this.idCounter = 1;
  }

  createTransport(options?: {
    failStateWrite?: boolean;
    failAttachmentWriteForName?: string;
    expiredToken?: boolean;
    offline?: boolean;
  }): DriveTransport {
    const cloud = this;
    const guard = () => {
      if (options?.offline) {
        throw new DriveApiError('offline', 'Không có kết nối Internet.', 'Kiểm tra kết nối mạng.');
      }
      if (options?.expiredToken) {
        throw new DriveApiError('auth_expired', 'Phiên Google Drive đã hết hạn.', 'Kết nối lại Google.');
      }
    };

    return {
      async listAppDataFiles() {
        guard();
        return Array.from(cloud.files.values()).map((entry) => ({ ...entry.meta }));
      },
      async findFileByName(name: string) {
        guard();
        for (const entry of cloud.files.values()) {
          if (entry.meta.name === name) return { ...entry.meta };
        }
        return null;
      },
      async downloadFileText(fileId: string) {
        guard();
        const found = cloud.files.get(fileId);
        if (!found) {
          throw new DriveApiError('not_found', 'Không tìm thấy tệp trên Drive.', 'Thử đồng bộ lại.');
        }
        return found.content;
      },
      async upsertJsonFile({ name, content, existingFileId }) {
        guard();
        if (options?.failStateWrite && name === DRIVE_STATE_FILENAME) {
          throw new DriveApiError('network', 'Mất kết nối đột ngột khi đang lưu.', 'Thử lại sau.');
        }
        if (options?.failAttachmentWriteForName && name === options.failAttachmentWriteForName) {
          throw new DriveApiError('network', 'Lỗi mạng khi tải ảnh.', 'Thử đồng bộ lại.');
        }
        let targetId = existingFileId;
        if (!targetId) {
          for (const entry of cloud.files.values()) {
            if (entry.meta.name === name) {
              targetId = entry.meta.id;
              break;
            }
          }
        }
        if (!targetId) {
          targetId = `drive_file_${cloud.idCounter++}`;
        }
        const meta: DriveAppFileMeta = {
          id: targetId,
          name,
          modifiedTime: new Date().toISOString(),
          size: String(content.length),
        };
        cloud.files.set(targetId, { meta, content });
        return { ...meta };
      },
      async deleteFile(fileId: string) {
        guard();
        cloud.files.delete(fileId);
      },
    };
  }
}

interface DeviceDiskSnapshot {
  deviceId: string;
  tables: Record<string, any[]>;
}

async function captureDeviceSnapshot(deviceId: string): Promise<DeviceDiskSnapshot> {
  const tables: Record<string, any[]> = {};
  for (const table of db.tables) {
    tables[table.name] = await table.toArray();
  }
  return { deviceId, tables };
}

async function mountDeviceSnapshot(snapshot?: DeviceDiskSnapshot, freshDeviceId?: string): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
    }
    if (snapshot) {
      for (const table of db.tables) {
        const rows = snapshot.tables[table.name] ?? [];
        if (rows.length > 0) {
          await table.bulkPut(rows);
        }
      }
    }
  });
  memoryLocalStorage.clear();
  if (snapshot) {
    memoryLocalStorage.set('khtc_device_id', snapshot.deviceId);
  } else if (freshDeviceId) {
    memoryLocalStorage.set('khtc_device_id', freshDeviceId);
  }
}

function makeTx(id: string, amount: number, note: string, deviceId: string, version = 1, updatedAt?: string): Transaction {
  const ts = updatedAt ?? new Date().toISOString();
  return {
    id,
    type: 'expense',
    amount,
    categoryId: 'cat_exp_food',
    accountId: 'acc_cash',
    date: '2026-11-20',
    time: '09:30',
    session: 'morning',
    sourceOrRecipient: 'Quán phở',
    note,
    attachmentIds: [],
    status: 'completed',
    createdAt: '2026-11-20T02:30:00.000Z',
    updatedAt: ts,
    version,
    deviceId,
    syncStatus: 'pending',
  };
}

// ---------------- TESTS COVERING ALL 14 MULTI-DEVICE SYNC SCENARIOS ----------------

test('1. AES-GCM encryption, key isolation, SHA-256 integrity, and tamper detection', async () => {
  const payload = { secretAmount: 50_000_000, note: 'Quỹ tiết kiệm bí mật' };
  const envelope = await encryptSyncPayload({
    payload,
    googleUid: 'google_uid_A',
    passphrase: 'my-strong-passphrase',
  });

  // Key is never embedded in the encrypted envelope
  const rawEnvelopeText = JSON.stringify(envelope);
  assert.equal(rawEnvelopeText.includes('my-strong-passphrase'), false);
  assert.equal(rawEnvelopeText.includes('google_uid_A'), false);
  assert.equal(rawEnvelopeText.includes('50000000'), false);
  assert.equal(envelope.alg, 'AES-GCM-256');
  assert.equal(envelope.requiresPassphrase, true);

  // Decrypt with valid UID & passphrase succeeds
  const decrypted = await decryptSyncPayload<typeof payload>({
    envelope,
    googleUid: 'google_uid_A',
    passphrase: 'my-strong-passphrase',
  });
  assert.deepEqual(decrypted, payload);

  // Wrong Google UID fails
  await assert.rejects(
    () => decryptSyncPayload({ envelope, googleUid: 'google_uid_B', passphrase: 'my-strong-passphrase' }),
    /Giải mã thất bại/
  );

  // Missing passphrase fails cleanly
  await assert.rejects(
    () => decryptSyncPayload({ envelope, googleUid: 'google_uid_A' }),
    /Khẩu lệnh mã hóa/
  );

  // Tampered SHA-256 hash or ciphertext fails
  const tampered: EncryptedEnvelope = {
    ...envelope,
    integritySha256: '0'.repeat(64),
  };
  await assert.rejects(
    () => decryptSyncPayload({ envelope: tampered, googleUid: 'google_uid_A', passphrase: 'my-strong-passphrase' }),
    /SHA-256/
  );
});

test('2-5. Two devices login, add on phone, check & edit on laptop, verify on phone', async () => {
  const cloud = new FakeDriveAppDataCloud();
  const googleUid = 'g_user_100';
  const googleEmail = 'ngoc@example.com';

  // --- Device A (Phone) sets up data and adds tx_1 ---
  await mountDeviceSnapshot(undefined, 'phone_A');
  await ensureSeedDefaults();
  await db.financialAccounts.put({
    id: 'acc_cash',
    name: 'Tiền mặt',
    type: 'cash',
    sticker: '💵',
    color: '#20B889',
    initialBalance: 1_000_000,
    isActive: true,
    isHidden: false,
    sortOrder: 0,
    createdAt: '2026-11-20T01:00:00.000Z',
    updatedAt: '2026-11-20T01:00:00.000Z',
    version: 1,
    deviceId: 'phone_A',
    syncStatus: 'pending',
  });
  const tx1 = makeTx('tx_1', 65_000, 'Phở bò sáng', 'phone_A', 1, '2026-11-20T02:30:00.000Z');
  await db.transactions.put(tx1);
  await queueUpsertChanges([
    { entityType: 'financialAccounts', recordId: 'acc_cash' },
    { entityType: 'transactions', recordId: 'tx_1' },
  ]);

  const syncA1 = await runFullTwoWaySync({
    googleUid,
    googleEmail,
    transport: cloud.createTransport(),
  });
  assert.equal(syncA1.ok, true);
  assert.equal(syncA1.pushedToDrive, true);
  assert.equal(cloud.files.size, 1); // khtc_sync_state_v1.enc
  const phoneSnap1 = await captureDeviceSnapshot('phone_A');

  // --- Device B (Laptop) logs in fresh with same Google account ---
  await mountDeviceSnapshot(undefined, 'laptop_B');
  const syncB1 = await runFullTwoWaySync({
    googleUid,
    googleEmail,
    transport: cloud.createTransport(),
  });
  assert.equal(syncB1.ok, true);
  assert.equal(syncB1.pulledFromDrive, true);
  assert.equal(syncB1.conflictsDetected.length, 0);

  const laptopTx1 = await db.transactions.get('tx_1');
  assert.equal(laptopTx1?.amount, 65_000);
  assert.equal(laptopTx1?.note, 'Phở bò sáng');

  // --- Laptop edits tx_1 ---
  await db.transactions.put({
    ...laptopTx1!,
    amount: 75_000,
    note: 'Phở bò đặc biệt',
    version: 2,
    deviceId: 'laptop_B',
    updatedAt: '2026-11-20T03:00:00.000Z',
    syncStatus: 'pending',
  });
  await queueUpsertChanges([{ entityType: 'transactions', recordId: 'tx_1' }]);
  const syncB2 = await runFullTwoWaySync({
    googleUid,
    googleEmail,
    transport: cloud.createTransport(),
  });
  assert.equal(syncB2.ok, true);

  // --- Re-open Phone and sync: receives Laptop's edit cleanly with 0 conflicts ---
  await mountDeviceSnapshot(phoneSnap1);
  const syncA2 = await runFullTwoWaySync({
    googleUid,
    googleEmail,
    transport: cloud.createTransport(),
  });
  assert.equal(syncA2.ok, true);
  assert.equal(syncA2.conflictsDetected.length, 0);
  const phoneTx1Updated = await db.transactions.get('tx_1');
  assert.equal(phoneTx1Updated?.amount, 75_000);
  assert.equal(phoneTx1Updated?.note, 'Phở bò đặc biệt');
});

test('6-7. Concurrent adds preserved + concurrent edit conflict detected and resolved cleanly', async () => {
  const cloud = new FakeDriveAppDataCloud();
  const googleUid = 'g_user_200';
  const googleEmail = 'user200@example.com';

  // Establish shared base state with tx_shared on both Phone & Laptop
  await mountDeviceSnapshot(undefined, 'phone_A');
  await ensureSeedDefaults();
  const baseTx = makeTx('tx_shared', 100_000, 'Tiền điện', 'phone_A', 1, '2026-11-20T01:00:00.000Z');
  await db.transactions.put(baseTx);
  await queueUpsertChanges([{ entityType: 'transactions', recordId: 'tx_shared' }]);
  await runFullTwoWaySync({ googleUid, googleEmail, transport: cloud.createTransport() });
  const phoneBase = await captureDeviceSnapshot('phone_A');

  await mountDeviceSnapshot(undefined, 'laptop_B');
  await runFullTwoWaySync({ googleUid, googleEmail, transport: cloud.createTransport() });
  const laptopBase = await captureDeviceSnapshot('laptop_B');

  // Offline on Phone: add tx_phone AND edit tx_shared -> 120,000
  await mountDeviceSnapshot(phoneBase);
  await db.transactions.put(makeTx('tx_phone', 45_000, 'Cà phê trên ĐT', 'phone_A', 1, '2026-11-20T04:00:00.000Z'));
  await db.transactions.put({
    ...baseTx,
    amount: 120_000,
    note: 'Sửa trên ĐT',
    version: 2,
    deviceId: 'phone_A',
    updatedAt: '2026-11-20T04:05:00.000Z',
    syncStatus: 'pending',
  });
  await queueUpsertChanges([
    { entityType: 'transactions', recordId: 'tx_phone' },
    { entityType: 'transactions', recordId: 'tx_shared' },
  ]);
  const phonePending = await captureDeviceSnapshot('phone_A');

  // Offline on Laptop: add tx_laptop AND edit tx_shared -> 180,000 (later timestamp)
  await mountDeviceSnapshot(laptopBase);
  await db.transactions.put(makeTx('tx_laptop', 90_000, 'Ăn trưa trên Laptop', 'laptop_B', 1, '2026-11-20T04:10:00.000Z'));
  await db.transactions.put({
    ...baseTx,
    amount: 180_000,
    note: 'Sửa trên Laptop',
    version: 2,
    deviceId: 'laptop_B',
    updatedAt: '2026-11-20T04:15:00.000Z',
    syncStatus: 'pending',
  });
  await queueUpsertChanges([
    { entityType: 'transactions', recordId: 'tx_laptop' },
    { entityType: 'transactions', recordId: 'tx_shared' },
  ]);

  // Laptop syncs first
  const syncB = await runFullTwoWaySync({ googleUid, googleEmail, transport: cloud.createTransport() });
  assert.equal(syncB.ok, true);
  assert.equal(syncB.conflictsDetected.length, 0);

  // Phone syncs second -> preserves both concurrent adds AND detects conflict on tx_shared
  await mountDeviceSnapshot(phonePending);
  const syncA = await runFullTwoWaySync({ googleUid, googleEmail, transport: cloud.createTransport() });
  assert.equal(syncA.ok, true);
  assert.ok(await db.transactions.get('tx_phone'));
  assert.ok(await db.transactions.get('tx_laptop'));
  assert.equal(syncA.conflictsDetected.length, 1);
  assert.equal(syncA.conflictsDetected[0].recordId, 'tx_shared');
  assert.equal(syncA.conflictsDetected[0].conflictKind, 'edit_edit');

  // Resolve conflict choosing 'latest' (Laptop's 180,000) and push
  await resolveStoredSyncConflict({ conflictId: syncA.conflictsDetected[0].id, choice: 'latest' });
  const syncAResolved = await runFullTwoWaySync({ googleUid, googleEmail, transport: cloud.createTransport() });
  assert.equal(syncAResolved.ok, true);
  assert.equal(syncAResolved.conflictsDetected.length, 0);
  const finalTx = await db.transactions.get('tx_shared');
  assert.equal(finalTx?.amount, 180_000);
});

test('8-9. Offline delete tombstone prevents resurrection + interrupted sync preserves queue', async () => {
  const cloud = new FakeDriveAppDataCloud();
  const googleUid = 'g_user_300';
  const googleEmail = 'user300@example.com';

  // Both devices start with tx_delete_me
  await mountDeviceSnapshot(undefined, 'phone_A');
  await ensureSeedDefaults();
  await db.transactions.put(makeTx('tx_delete_me', 50_000, 'Sẽ bị xóa', 'phone_A', 1, '2026-11-20T01:00:00.000Z'));
  await queueUpsertChanges([{ entityType: 'transactions', recordId: 'tx_delete_me' }]);
  await runFullTwoWaySync({ googleUid, googleEmail, transport: cloud.createTransport() });
  const phoneSnap = await captureDeviceSnapshot('phone_A');

  await mountDeviceSnapshot(undefined, 'laptop_B');
  await runFullTwoWaySync({ googleUid, googleEmail, transport: cloud.createTransport() });
  const laptopSnap = await captureDeviceSnapshot('laptop_B');

  // Phone goes offline, deletes tx_delete_me, creates tx_after_crash
  await mountDeviceSnapshot(phoneSnap);
  await db.transactions.delete('tx_delete_me');
  await queueDeleteChanges([{ entityType: 'transactions', recordId: 'tx_delete_me', version: 1 }]);
  await db.transactions.put(makeTx('tx_after_crash', 30_000, 'Thêm khi chập chờn', 'phone_A', 1, '2026-11-20T05:00:00.000Z'));
  await queueUpsertChanges([{ entityType: 'transactions', recordId: 'tx_after_crash' }]);

  // Simulate offline / sudden crash while pushing Drive state
  const interrupted = await runFullTwoWaySync({
    googleUid,
    googleEmail,
    transport: cloud.createTransport({ failStateWrite: true }),
  });
  assert.equal(interrupted.ok, false);
  // Queue and tombstone remain intact so nothing is lost on sudden shutdown
  assert.ok((await db.syncQueue.count()) >= 2);
  assert.ok(await db.transactions.get('tx_after_crash'));

  // Retry once network recovers -> succeeds and flushes queue
  const recovered = await runFullTwoWaySync({
    googleUid,
    googleEmail,
    transport: cloud.createTransport(),
  });
  assert.equal(recovered.ok, true);
  assert.equal(await db.syncQueue.count(), 0);

  // Laptop syncs -> tx_delete_me MUST stay deleted (never resurrected!) and tx_after_crash arrives
  await mountDeviceSnapshot(laptopSnap);
  const laptopSync = await runFullTwoWaySync({
    googleUid,
    googleEmail,
    transport: cloud.createTransport(),
  });
  assert.equal(laptopSync.ok, true);
  assert.equal(await db.transactions.get('tx_delete_me'), undefined);
  assert.equal((await db.transactions.get('tx_after_crash'))?.amount, 30_000);
});

test('10. Attachment sync by ID, upload failure retry, multi-device download, and tombstone deletion', async () => {
  const cloud = new FakeDriveAppDataCloud();
  const googleUid = 'g_user_400';
  const googleEmail = 'user400@example.com';

  await mountDeviceSnapshot(undefined, 'phone_A');
  await ensureSeedDefaults();
  const att: Attachment = {
    id: 'att_receipt_1',
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
    fileName: 'hoa_don_dien.png',
    mimeType: 'image/png',
    sizeBytes: 64,
    createdAt: '2026-11-20T06:00:00.000Z',
    updatedAt: '2026-11-20T06:00:00.000Z',
    version: 1,
    deviceId: 'phone_A',
    syncStatus: 'pending',
  };
  await db.attachments.put(att);
  await queueUpsertChanges([{ entityType: 'attachments', recordId: att.id }]);

  // Simulate attachment upload failure -> original image MUST remain on device & queued for retry
  const partial = await runFullTwoWaySync({
    googleUid,
    googleEmail,
    transport: cloud.createTransport({ failAttachmentWriteForName: driveAttachmentFileName(att.id) }),
  });
  assert.equal(partial.ok, true);
  assert.equal(partial.attachmentFailures, 1);
  assert.ok(await db.attachments.get(att.id));
  assert.ok(await db.syncQueue.get(`attachments:${att.id}`));

  // Retry succeeds -> uploads encrypted khtc_att_att_receipt_1.enc
  const retryOk = await runFullTwoWaySync({
    googleUid,
    googleEmail,
    transport: cloud.createTransport(),
  });
  assert.equal(retryOk.ok, true);
  assert.equal(retryOk.attachmentFailures, 0);
  assert.equal(retryOk.attachmentsUploaded, 1);
  assert.equal(await db.syncQueue.count(), 0);
  const phoneSnap = await captureDeviceSnapshot('phone_A');

  // Device B downloads & decrypts attachment automatically
  await mountDeviceSnapshot(undefined, 'laptop_B');
  const laptopPull = await runFullTwoWaySync({
    googleUid,
    googleEmail,
    transport: cloud.createTransport(),
  });
  assert.equal(laptopPull.ok, true);
  assert.equal(laptopPull.attachmentsDownloaded, 1);
  const laptopAtt = await db.attachments.get(att.id);
  assert.equal(laptopAtt?.dataUrl, att.dataUrl);
  const laptopSnap = await captureDeviceSnapshot('laptop_B');

  // Phone deletes attachment -> tombstone propagates and cleans Drive & Laptop
  await mountDeviceSnapshot(phoneSnap);
  await db.attachments.delete(att.id);
  await queueDeleteChanges([{ entityType: 'attachments', recordId: att.id, version: 1 }]);
  await runFullTwoWaySync({ googleUid, googleEmail, transport: cloud.createTransport() });

  await mountDeviceSnapshot(laptopSnap);
  await runFullTwoWaySync({ googleUid, googleEmail, transport: cloud.createTransport() });
  assert.equal(await db.attachments.get(att.id), undefined);
});

test('11-14. Expired token, disconnect Google, switch Google account isolation, and backup/restore integrity', async () => {
  const cloud = new FakeDriveAppDataCloud();
  const googleUidA = 'g_user_account_A';
  const googleEmailA = 'accountA@example.com';

  await mountDeviceSnapshot(undefined, 'device_1');
  await ensureSeedDefaults();
  await db.transactions.put(makeTx('tx_acc_a', 250_000, 'Chi tiêu tài khoản A', 'device_1'));
  await queueUpsertChanges([{ entityType: 'transactions', recordId: 'tx_acc_a' }]);

  // 11. Expired Google access token fails cleanly with actionable hint & zero local data loss
  const expiredRes = await runFullTwoWaySync({
    googleUid: googleUidA,
    googleEmail: googleEmailA,
    transport: cloud.createTransport({ expiredToken: true }),
  });
  assert.equal(expiredRes.ok, false);
  assert.equal(expiredRes.errorCode, 'auth_expired');
  assert.ok(expiredRes.actionHint && expiredRes.actionHint.length > 0);
  assert.ok(await db.transactions.get('tx_acc_a'));

  // Re-auth succeeds and syncs Account A
  const okRes = await runFullTwoWaySync({
    googleUid: googleUidA,
    googleEmail: googleEmailA,
    transport: cloud.createTransport(),
  });
  assert.equal(okRes.ok, true);

  // 12. Disconnect Google preserves local data while clearing cloud ownership metadata
  const meta = await getOrInitSyncMeta();
  await db.syncMeta.put({
    ...meta,
    ownerGoogleUid: undefined,
    ownerGoogleEmail: undefined,
  });
  assert.equal((await db.transactions.get('tx_acc_a'))?.amount, 250_000);

  // 14. Manual Backup export + SHA-256 verification + tamper rejection + diffWarning on differing device
  const exported = await exportFullBackupJSON();
  const parsedExport = JSON.parse(exported.json);
  assert.equal(parsedExport.version, 2);
  assert.ok(parsedExport.integritySha256);

  // Tampering backup data is detected immediately by SHA-256 inspection
  const tamperedObj = JSON.parse(exported.json);
  tamperedObj.data.transactions[0].amount = 999_999_999;
  const tamperedCheck = await inspectBackupFile(JSON.stringify(tamperedObj));
  assert.equal(tamperedCheck.valid, false);
  assert.equal(tamperedCheck.integrityStatus, 'mismatch');

  // Inspecting valid backup on a device with a different local state produces diffWarning
  await db.transactions.put(makeTx('tx_local_diff', 15_000, 'Khác biệt cục bộ', 'device_1'));
  const validInspection = await inspectBackupFile(exported.json);
  assert.equal(validInspection.valid, true);
  assert.equal(validInspection.integrityStatus, 'verified');
  assert.ok(validInspection.diffWarning);
  assert.ok(validInspection.duplicateIdsCount >= 1);

  // 13. Switching to Google Account B clears Account A local data so Account A never leaks into Account B
  await clearLocalFinancialDataForAccountSwitch();
  assert.equal(await db.transactions.count(), 0);

  // Restore Account A backup on a fresh device works cleanly
  const restoredCount = await restoreBackupData(validInspection.parsedData!, 'overwrite');
  assert.ok(restoredCount >= 1);
  assert.equal((await db.transactions.get('tx_acc_a'))?.amount, 250_000);
});

test('Pure 3-way merge rule: untouched starter records merge without creating false duplicates', () => {
  const result = mergeSyncSnapshots({
    localRecords: {
      financialAccounts: [
        {
          id: 'acc_cash',
          name: 'Tiền mặt',
          initialBalance: 0,
          createdAt: '2026-11-20T01:00:00.000Z',
          updatedAt: '2026-11-20T01:00:00.000Z',
        },
      ],
      transactions: [],
      categories: [],
      budgets: [],
      budgetCategories: [],
      transfers: [],
      savings: [],
      loansGiven: [],
      loansTaken: [],
      loanRepayments: [],
      specialItems: [],
      financialEvents: [],
      customLedgers: [],
      ledgerTransactions: [],
      diaryEntries: [],
      userSettings: [],
      quickInputAliases: [],
      balanceAdjustments: [],
    },
    remoteRecords: {
      financialAccounts: [
        {
          id: 'acc_cash',
          name: 'Tiền mặt',
          initialBalance: 5_000_000,
          createdAt: '2026-11-19T01:00:00.000Z',
          updatedAt: '2026-11-19T12:00:00.000Z',
          version: 2,
          deviceId: 'other_dev',
        },
      ],
      transactions: [],
      categories: [],
      budgets: [],
      budgetCategories: [],
      transfers: [],
      savings: [],
      loansGiven: [],
      loansTaken: [],
      loanRepayments: [],
      specialItems: [],
      financialEvents: [],
      customLedgers: [],
      ledgerTransactions: [],
      diaryEntries: [],
      userSettings: [],
      quickInputAliases: [],
      balanceAdjustments: [],
    },
    localTombstones: [],
    remoteTombstones: [],
    baseManifest: {},
    pendingKeys: new Set(),
    localDeviceId: 'fresh_dev',
  });

  assert.equal(result.conflicts.length, 0);
  assert.equal(result.mergedRecords.financialAccounts[0].initialBalance, 5_000_000);
});
