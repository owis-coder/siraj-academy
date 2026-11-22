import fs from "fs";
import { Readable } from "stream";
import { readDriveConfig, type DriveConfig } from "./googleDriveConfig";

/**
 * GoogleDriveStorageService — كل عمليات Drive من الخادم فقط.
 *
 * - OAuth 2.0 Refresh Token (لا Service Account على مساحة شخصية).
 * - Resumable upload على أجزاء قابلة للاستكمال.
 * - إعادة محاولة أسّية عند 429/5xx/انقطاع الشبكة.
 * - لا تُسجَّل الرموز أو الأسرار في أي خطأ أو Log.
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export class DriveNotConfiguredError extends Error {
  code = "DRIVE_NOT_CONFIGURED";
  constructor(message: string) {
    super(message);
  }
}

export class DriveApiError extends Error {
  code = "DRIVE_API_ERROR";
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type DriveFileMeta = {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  md5Checksum?: string;
  webViewLink?: string;
  createdTime?: string;
  parents?: string[];
};

export type DriveQuota = {
  limit?: string;
  usage?: string;
  usageInDrive?: string;
  usageInDriveTrash?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function backoffMs(attempt: number): number {
  const base = Math.min(500 * 2 ** attempt, 15_000);
  return base + Math.floor(Math.random() * 250);
}

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export class GoogleDriveStorageService {
  private config: DriveConfig;
  private accessTokenValue: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(config?: DriveConfig) {
    this.config = config ?? readDriveConfig();
  }

  /** هل الخدمة قابلة للاستخدام في هذه العملية؟ */
  static isConfigured(): boolean {
    try {
      readDriveConfig();
      return true;
    } catch {
      return false;
    }
  }

  static assertConfigured(): void {
    try {
      readDriveConfig();
    } catch (err) {
      throw new DriveNotConfiguredError(err instanceof Error ? err.message : "Google Drive غير مهيأ");
    }
  }

  /** تجديد Access Token — لا يُسجَّل الرمز ولا الاستجابة الكاملة */
  private async accessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.accessTokenValue && Date.now() < this.accessTokenExpiresAt - 60_000) {
      return this.accessTokenValue;
    }
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.config.refreshToken,
      grant_type: "refresh_token",
    });

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
        if (!res.ok) {
          const text = await res.text();
          // رسالة Google قد تحمل وصفًا فقط (invalid_grant…) بلا أسرار
          let detail = "تعذر تجديد صلاحية Google Drive";
          try {
            const parsed = JSON.parse(text) as { error?: string; error_description?: string };
            if (parsed.error === "invalid_grant") detail = "انتهت صلاحية Refresh Token — أعد ربط الحساب";
            else if (parsed.error) detail = `Google OAuth: ${parsed.error}`;
          } catch {
            /* تجاهل نص غير JSON */
          }
          throw new DriveApiError(res.status, detail);
        }
        const json = (await res.json()) as { access_token?: string; expires_in?: number };
        if (!json.access_token) throw new DriveApiError(500, "لم يُعد Google رمز وصول صالحًا");
        this.accessTokenValue = json.access_token;
        this.accessTokenExpiresAt = Date.now() + (json.expires_in ?? 3600) * 1000;
        return json.access_token;
      } catch (err) {
        lastError = err;
        if (err instanceof DriveApiError && err.status === 400) throw err;
        await sleep(backoffMs(attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new DriveApiError(500, "تعذر الاتصال بـ Google OAuth");
  }

  private addSharedDriveParams(params: URLSearchParams): void {
    if (this.config.sharedDriveId) {
      params.set("corpora", "drive");
      params.set("driveId", this.config.sharedDriveId);
      params.set("includeItemsFromAllDrives", "true");
      params.set("supportsAllDrives", "true");
    }
  }

  /** طلب مصادق مع إعادة محاولة أسّية وتجديد توكن عند 401 */
  private async authorizedFetch(url: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
    const token = await this.accessToken(attempt > 0 && attempt % 3 === 0);
    const headers = new Headers(init.headers ?? {});
    headers.set("Authorization", `Bearer ${token}`);

    let res: Response;
    try {
      res = await fetch(url, { ...init, headers });
    } catch {
      if (attempt >= 3) throw new DriveApiError(0, "تعذر الاتصال بـ Google Drive");
      await sleep(backoffMs(attempt));
      return this.authorizedFetch(url, init, attempt + 1);
    }

    if (res.status === 401 && attempt < 2) {
      this.accessTokenValue = null;
      return this.authorizedFetch(url, init, attempt + 1);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await res.text().catch(() => "");
      await sleep(backoffMs(attempt + 1));
      return this.authorizedFetch(url, init, attempt + 1);
    }
    if (!res.ok && res.status !== 308) {
      const text = await res.text().catch(() => "");
      let message = `Google Drive API: ${res.status}`;
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } };
        if (parsed.error?.message) message = `Google Drive: ${parsed.error.message}`;
      } catch {
        /* تجاهل */
      }
      throw new DriveApiError(res.status, message);
    }
    return res;
  }

  // ---------- المجلدات ----------

  async findFolder(name: string, parentId?: string | null): Promise<DriveFileMeta | null> {
    const params = new URLSearchParams({
      q: `name='${escapeQueryValue(name)}' and mimeType='${FOLDER_MIME}' and trashed=false${
        parentId ? ` and '${escapeQueryValue(parentId)}' in parents` : ""
      }`,
      fields: "files(id,name,mimeType,createdTime,parents)",
      pageSize: "10",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    this.addSharedDriveParams(params);
    const res = await this.authorizedFetch(`${DRIVE_API}/files?${params.toString()}`);
    const json = (await res.json()) as { files?: DriveFileMeta[] };
    return json.files?.[0] ?? null;
  }

  async createFolder(name: string, parentId: string, appProperties?: Record<string, string>): Promise<DriveFileMeta> {
    const res = await this.authorizedFetch(
      `${DRIVE_API}/files?fields=id,name,mimeType,createdTime,parents&supportsAllDrives=true`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({
          name,
          mimeType: FOLDER_MIME,
          parents: [parentId],
          ...(appProperties ? { appProperties } : {}),
        }),
      },
    );
    return (await res.json()) as DriveFileMeta;
  }

  /** يبحث عن مجلد ثم ينشئه — التعامل مع التسابق: عند الفشل نعيد البحث */
  async ensureFolder(name: string, parentId: string, appProperties?: Record<string, string>): Promise<DriveFileMeta> {
    const existing = await this.findFolder(name, parentId);
    if (existing) return existing;
    try {
      return await this.createFolder(name, parentId, appProperties);
    } catch (err) {
      const again = await this.findFolder(name, parentId).catch(() => null);
      if (again) return again;
      throw err;
    }
  }

  async listChildren(folderId: string): Promise<DriveFileMeta[]> {
    const files: DriveFileMeta[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${escapeQueryValue(folderId)}' in parents and trashed=false`,
        fields: "nextPageToken,files(id,name,mimeType,size,md5Checksum,createdTime,parents)",
        pageSize: "1000",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);
      this.addSharedDriveParams(params);
      const res = await this.authorizedFetch(`${DRIVE_API}/files?${params.toString()}`);
      const json = (await res.json()) as { files?: DriveFileMeta[]; nextPageToken?: string };
      files.push(...(json.files ?? []));
      pageToken = json.nextPageToken;
    } while (pageToken);
    return files;
  }

  // ---------- الملفات ----------

  async getFile(fileId: string): Promise<DriveFileMeta> {
    const res = await this.authorizedFetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,md5Checksum,createdTime,parents&supportsAllDrives=true`,
    );
    return (await res.json()) as DriveFileMeta;
  }

  /** جلسة رفع استكمالية — يُعاد رابط الجلسة ليُخزَّن لاستكمال الرفع لاحقًا */
  async createResumableSession(input: {
    name: string;
    parentId: string;
    mimeType: string;
    size: number;
    appProperties?: Record<string, string>;
  }): Promise<string> {
    const res = await this.authorizedFetch(
      `${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,name,size,mimeType,md5Checksum,webViewLink&supportsAllDrives=true`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": input.mimeType,
          "X-Upload-Content-Length": String(input.size),
        },
        body: JSON.stringify({
          name: input.name,
          mimeType: input.mimeType,
          parents: [input.parentId],
          ...(input.appProperties ? { appProperties: input.appProperties } : {}),
        }),
      },
    );
    const location = res.headers.get("location");
    if (!location) throw new DriveApiError(500, "لم يُعد Drive رابط جلسة الرفع");
    return location;
  }

  /** استعلام عن مقدار ما وصل إليه الرفع في جلسة قائمة */
  async querySessionOffset(sessionUrl: string, totalSize: number): Promise<{ complete: boolean; offset: number; file?: DriveFileMeta }> {
    const res = await this.authorizedFetch(sessionUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes */${totalSize}` },
    });
    if (res.status === 200 || res.status === 201) {
      const file = (await res.json().catch(() => null)) as DriveFileMeta | null;
      return { complete: true, offset: totalSize, file: file ?? undefined };
    }
    const range = res.headers.get("range");
    const match = range?.match(/bytes=0-(\d+)/);
    return { complete: false, offset: match ? Number(match[1]) + 1 : 0 };
  }

  /**
   * رفع ملف على أجزاء إلى جلسة استكمالية.
   * يعيد بيانات الملف بعد اكتمال آخر جزء.
   */
  async uploadChunks(
    sessionUrl: string,
    filePath: string,
    totalSize: number,
    startOffset = 0,
  ): Promise<DriveFileMeta> {
    const chunkSize = this.config.uploadChunkSizeBytes;
    const handle = await fs.promises.open(filePath, "r");
    try {
      let offset = startOffset;
      while (offset < totalSize) {
        const length = Math.min(chunkSize, totalSize - offset);
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        if (bytesRead !== length) throw new DriveApiError(500, "تعذر قراءة جزء الملف من القرص");
        const end = offset + length - 1;

        let res: Response | null = null;
        let lastErr: unknown = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            res = await this.authorizedFetch(sessionUrl, {
              method: "PUT",
              headers: {
                "Content-Length": String(length),
                "Content-Range": `bytes ${offset}-${end}/${totalSize}`,
              },
              body: buffer,
            });
            break;
          } catch (err) {
            lastErr = err;
            // نعيد المحاولة من نفس الموضع: Drive يقبل إعادة الإرسال لنفس النطاق
            await sleep(backoffMs(attempt));
          }
        }
        if (!res) throw lastErr instanceof Error ? lastErr : new DriveApiError(0, "فشل رفع الجزء إلى Drive");

        if (res.status === 308) {
          offset = end + 1;
          continue;
        }
        if (res.status === 200 || res.status === 201) {
          return (await res.json()) as DriveFileMeta;
        }
        throw new DriveApiError(res.status, `Drive رفض الجزء: ${res.status}`);
      }
      throw new DriveApiError(500, "اكتملت الأجزاء دون تأكيد من Drive");
    } finally {
      await handle.close();
    }
  }

  /** رفع كامل من مسار محلي — ينشئ جلسة ثم يرفع، ويستأنف إن وُجدت جلسة */
  async uploadFromPath(input: {
    filePath: string;
    name: string;
    parentId: string;
    mimeType: string;
    size: number;
    appProperties?: Record<string, string>;
    existingSessionUrl?: string | null;
    onSession?: (sessionUrl: string) => Promise<void> | void;
  }): Promise<DriveFileMeta> {
    if (input.existingSessionUrl) {
      try {
        const state = await this.querySessionOffset(input.existingSessionUrl, input.size);
        if (state.complete && state.file) return state.file;
        return await this.uploadChunks(input.existingSessionUrl, input.filePath, input.size, state.offset);
      } catch {
        // جلسة منتهية أو غير صالحة — نبدأ جلسة جديدة
      }
    }

    const sessionUrl = await this.createResumableSession({
      name: input.name,
      parentId: input.parentId,
      mimeType: input.mimeType,
      size: input.size,
      appProperties: input.appProperties,
    });
    await input.onSession?.(sessionUrl);
    return this.uploadChunks(sessionUrl, input.filePath, input.size, 0);
  }

  /** تنزيل داخلي — يُستهلك من Backend فقط بعد تفويض الأدمن */
  async download(fileId: string): Promise<{ body: Readable; mimeType: string | null; size: string | null; name: string | null }> {
    const res = await this.authorizedFetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    );
    if (!res.body) throw new DriveApiError(502, "لم يُعد Drive محتوى الملف");
    return {
      body: Readable.fromWeb(res.body as never),
      mimeType: res.headers.get("content-type"),
      size: res.headers.get("content-length"),
      name: null,
    };
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.authorizedFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
      method: "DELETE",
    });
  }

  async moveFile(fileId: string, fromFolderId: string, toFolderId: string): Promise<void> {
    await this.authorizedFetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?addParents=${encodeURIComponent(toFolderId)}&removeParents=${encodeURIComponent(fromFolderId)}&supportsAllDrives=true`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" },
    );
  }

  async quota(): Promise<{ user: { emailAddress?: string; displayName?: string }; storageQuota?: DriveQuota }> {
    const res = await this.authorizedFetch(`${DRIVE_API}/about?fields=user,storageQuota`);
    return (await res.json()) as { user: { emailAddress?: string; displayName?: string }; storageQuota?: DriveQuota };
  }

  /** فحص صحة فعلي: توكن + وصول للمجلد الجذري (بلا طباعة أسرار) */
  async healthCheck(): Promise<{
    ok: boolean;
    accountEmail: string | null;
    accountName: string | null;
    rootFolderId: string | null;
    rootFolderName: string | null;
    quota: DriveQuota | null;
    error?: string;
  }> {
    try {
      const about = await this.quota();
      let rootFolderName: string | null = null;
      if (this.config.rootFolderId) {
        const folder = await this.getFile(this.config.rootFolderId);
        rootFolderName = folder.name;
      }
      return {
        ok: !!this.config.rootFolderId,
        accountEmail: about.user?.emailAddress ?? null,
        accountName: about.user?.displayName ?? null,
        rootFolderId: this.config.rootFolderId,
        rootFolderName,
        quota: about.storageQuota ?? null,
        ...(this.config.rootFolderId ? {} : { error: "GOOGLE_DRIVE_ROOT_FOLDER_ID غير مضبوط" }),
      };
    } catch (err) {
      return {
        ok: false,
        accountEmail: null,
        accountName: null,
        rootFolderId: this.config.rootFolderId,
        rootFolderName: null,
        quota: null,
        error: err instanceof Error ? err.message : "فحص Drive فشل",
      };
    }
  }
}

let singleton: GoogleDriveStorageService | null = null;

/** نسخة واحدة لكل عملية — تُخزّن التوكن مؤقتًا */
export function getDriveService(): GoogleDriveStorageService {
  if (!singleton) singleton = new GoogleDriveStorageService();
  return singleton;
}
