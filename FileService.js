// ============================================
// FileService.gs - Google Drive 檔案操作
// ============================================

/**
 * 取得上傳用的 Drive 資料夾
 */
function getDriveFolder() {
  var folderId = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  if (!folderId) {
    throw new Error('請先在 Script Properties 中設定 DRIVE_FOLDER_ID');
  }
  return DriveApp.getFolderById(folderId);
}

/**
 * 從 Base64 上傳檔案到 Google Drive
 */
function uploadFileFromBase64(base64Data, fileName, mimeType) {
  var folder = getDriveFolder();

  // 將 base64 轉為 blob
  var decoded = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(decoded, mimeType, fileName);

  // 上傳到 Drive
  var file = folder.createFile(blob);

  // 嘗試設定分享權限（學校 Google Workspace 可能會限制）
  try {
    file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    // 如果連組織內分享都不允許，就跳過（檔案仍可透過 Apps Script 存取）
    Logger.log('設定分享權限失敗（不影響功能）: ' + e.message);
  }

  return {
    fileId: file.getId(),
    fileName: file.getName(),
    mimeType: file.getMimeType(),
    size: file.getSize(),
    url: file.getUrl()
  };
}

/**
 * 刪除 Drive 檔案
 */
function deleteFile(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    file.setTrashed(true);
    return true;
  } catch (e) {
    Logger.log('刪除檔案失敗: ' + fileId + ' - ' + e.message);
    return false;
  }
}

/**
 * 取得檔案的直接存取 URL
 */
function getFileUrl(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    var mimeType = file.getMimeType();

    if (mimeType === 'application/pdf') {
      // PDF 直接預覽連結
      return 'https://drive.google.com/file/d/' + fileId + '/preview';
    } else if (mimeType.indexOf('video') !== -1) {
      // 影片直接下載連結（用於 HTML5 video player）
      return 'https://drive.google.com/uc?export=download&id=' + fileId;
    }

    return 'https://drive.google.com/file/d/' + fileId + '/view';
  } catch (e) {
    return null;
  }
}

/**
 * 取得檔案的 Base64 資料（用於前端 PDF.js 載入）
 */
function getFileBase64(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    var base64 = Utilities.base64Encode(blob.getBytes());
    return {
      base64: base64,
      mimeType: file.getMimeType(),
      fileName: file.getName(),
      size: file.getSize()
    };
  } catch (e) {
    return null;
  }
}

/**
 * 取得影片串流 URL
 */
function getVideoStreamUrl(fileId) {
  return 'https://drive.google.com/file/d/' + fileId + '/preview';
}

/**
 * 取得檔案縮圖的 Base64 Data URL（含快取）
 * Google Drive 會自動為影片和 PDF 生成縮圖
 */
function getFileThumbnailBase64(fileId) {
  if (!fileId) return null;

  // 先查快取（縮圖快取 1 小時）
  var cache = CacheService.getScriptCache();
  var cacheKey = 'thumb_' + fileId;
  var cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    var file = DriveApp.getFileById(fileId);
    var thumb = file.getThumbnail();
    if (thumb) {
      var dataUrl = 'data:' + thumb.getContentType() + ';base64,' + Utilities.base64Encode(thumb.getBytes());
      // 快取 1 小時（CacheService 上限 6 小時），但單一值上限 100KB
      if (dataUrl.length < 90000) {
        cache.put(cacheKey, dataUrl, 3600);
      }
      return dataUrl;
    }
  } catch (e) {
    Logger.log('取得縮圖失敗: ' + fileId + ' - ' + e.message);
  }
  return null;
}
