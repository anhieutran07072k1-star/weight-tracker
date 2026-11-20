// Google Drive v3 appDataFolder REST client
// Strictly uses spaces=appDataFolder and never accesses general Drive files.

export interface DriveAppFileMeta {
  id: string;
  name: string;
  modifiedTime?: string;
  size?: string;
}

export type DriveErrorCode =
  | 'auth_expired'
  | 'offline'
  | 'permission_denied'
  | 'rate_limit'
  | 'not_found'
  | 'network'
  | 'unknown';

export class DriveApiError extends Error {
  code: DriveErrorCode;
  userMessage: string;
  actionHint: string;

  constructor(code: DriveErrorCode, userMessage: string, actionHint: string) {
    super(userMessage);
    this.code = code;
    this.userMessage = userMessage;
    this.actionHint = actionHint;
  }
}

export interface DriveTransport {
  findFileByName(name: string): Promise<DriveAppFileMeta | null>;
  listAppDataFiles(): Promise<DriveAppFileMeta[]>;
  downloadFileText(fileId: string): Promise<string>;
  upsertJsonFile(params: { name: string; content: string; existingFileId?: string }): Promise<DriveAppFileMeta>;
  deleteFile(fileId: string): Promise<void>;
}

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

function classifyHttpError(status: number, rawBody: string): DriveApiError {
  if (status === 401) {
    return new DriveApiError(
      'auth_expired',
      'Phiên truy cập Google Drive đã hết hạn.',
      'Nhấn "Kết nối lại Google" để cấp lại quyền truy cập dữ liệu ứng dụng.'
    );
  }
  if (status === 403) {
    if (rawBody.includes('storageQuotaExceeded')) {
      return new DriveApiError(
        'rate_limit',
        'Dung lượng Google Drive của bạn đã đầy.',
        'Giải phóng dung lượng trên Google Drive hoặc dùng Sao lưu JSON cục bộ.'
      );
    }
    return new DriveApiError(
      'permission_denied',
      'Chưa có quyền truy cập thư mục dữ liệu ứng dụng trên Google Drive.',
      'Nhấn "Kết nối lại Google" và chấp thuận quyền lưu dữ liệu ứng dụng.'
    );
  }
  if (status === 404) {
    return new DriveApiError(
      'not_found',
      'Không tìm thấy tệp đồng bộ trên Google Drive.',
      'Hệ thống sẽ tạo tệp đồng bộ mới khi thực hiện đồng bộ tiếp theo.'
    );
  }
  if (status === 429) {
    return new DriveApiError(
      'rate_limit',
      'Google Drive đang giới hạn tần suất yêu cầu tạm thời.',
      'Chờ vài giây rồi nhấn "Đồng bộ ngay" để thử lại.'
    );
  }
  return new DriveApiError(
    'unknown',
    `Lỗi kết nối Google Drive (HTTP ${status}).`,
    'Kiểm tra lại kết nối mạng và thử nhấn "Đồng bộ ngay".'
  );
}

async function safeFetch(input: string, init: RequestInit): Promise<Response> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new DriveApiError(
      'offline',
      'Thiết bị đang ngoại tuyến (mất Internet).',
      'Mọi thay đổi vẫn được lưu an toàn trên thiết bị và sẽ tự động đồng bộ khi có mạng.'
    );
  }
  try {
    return await fetch(input, init);
  } catch {
    throw new DriveApiError(
      'network',
      'Không thể kết nối tới Google Drive.',
      'Kiểm tra kết nối Internet của bạn; dữ liệu cục bộ vẫn được giữ nguyên.'
    );
  }
}

export function createGoogleDriveAppDataTransport(getAccessToken: () => Promise<string | null>): DriveTransport {
  const requireToken = async (): Promise<string> => {
    const token = await getAccessToken();
    if (!token) {
      throw new DriveApiError(
        'auth_expired',
        'Chưa có mã truy cập Google Drive hợp lệ hoặc phiên đã hết hạn.',
        'Nhấn "Kết nối lại Google" để xác thực lại tài khoản Google.'
      );
    }
    return token;
  };

  return {
    async listAppDataFiles(): Promise<DriveAppFileMeta[]> {
      const token = await requireToken();
      const params = new URLSearchParams({
        spaces: 'appDataFolder',
        fields: 'files(id, name, modifiedTime, size)',
        pageSize: '200',
      });
      const res = await safeFetch(`${DRIVE_FILES_URL}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw classifyHttpError(res.status, await res.text());
      }
      const data = (await res.json()) as { files?: DriveAppFileMeta[] };
      return data.files ?? [];
    },

    async findFileByName(name: string): Promise<DriveAppFileMeta | null> {
      const token = await requireToken();
      const escaped = name.replace(/'/g, "\\'");
      const params = new URLSearchParams({
        spaces: 'appDataFolder',
        q: `name = '${escaped}' and trashed = false`,
        fields: 'files(id, name, modifiedTime, size)',
        pageSize: '1',
      });
      const res = await safeFetch(`${DRIVE_FILES_URL}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw classifyHttpError(res.status, await res.text());
      }
      const data = (await res.json()) as { files?: DriveAppFileMeta[] };
      return data.files?.[0] ?? null;
    },

    async downloadFileText(fileId: string): Promise<string> {
      const token = await requireToken();
      const res = await safeFetch(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw classifyHttpError(res.status, await res.text());
      }
      return res.text();
    },

    async upsertJsonFile({ name, content, existingFileId }): Promise<DriveAppFileMeta> {
      const token = await requireToken();
      const boundary = `khtc_boundary_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const metadata = existingFileId
        ? { name, mimeType: 'application/json' }
        : { name, mimeType: 'application/json', parents: ['appDataFolder'] };

      const multipartBody =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${content}\r\n` +
        `--${boundary}--`;

      const targetUrl = existingFileId
        ? `${DRIVE_UPLOAD_URL}/${encodeURIComponent(existingFileId)}?uploadType=multipart&fields=id,name,modifiedTime,size`
        : `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,modifiedTime,size`;

      const res = await safeFetch(targetUrl, {
        method: existingFileId ? 'PATCH' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      });

      if (!res.ok) {
        throw classifyHttpError(res.status, await res.text());
      }
      return (await res.json()) as DriveAppFileMeta;
    },

    async deleteFile(fileId: string): Promise<void> {
      const token = await requireToken();
      const res = await safeFetch(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 404) {
        throw classifyHttpError(res.status, await res.text());
      }
    },
  };
}
