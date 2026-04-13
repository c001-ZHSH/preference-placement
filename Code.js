// ============================================
// Code.gs - 主要路由與頁面分發
// ============================================

/**
 * 診斷工具 - 測試所有權限與設定是否正確
 * 在編輯器中執行此函數，查看執行記錄
 */
function testAuthorization() {
  // 1. 測試 email
  var email = Session.getActiveUser().getEmail();
  Logger.log('✅ 目前帳號: ' + email);

  // 2. 測試 Script Properties
  var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var folderId = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  Logger.log('SPREADSHEET_ID: ' + (ssId || '❌ 未設定'));
  Logger.log('DRIVE_FOLDER_ID: ' + (folderId || '❌ 未設定'));

  // 3. 測試 Sheets 存取
  try {
    var ss = SpreadsheetApp.openById(ssId);
    Logger.log('✅ Sheets 存取成功: ' + ss.getName());
  } catch (e) {
    Logger.log('❌ Sheets 存取失敗: ' + e.message);
  }

  // 4. 測試 Drive 資料夾存取
  try {
    var folder = DriveApp.getFolderById(folderId);
    Logger.log('✅ Drive 資料夾存取成功: ' + folder.getName());

    // 5. 測試在資料夾中建立檔案
    var testBlob = Utilities.newBlob('test', 'text/plain', 'clasp-test.txt');
    var testFile = folder.createFile(testBlob);
    Logger.log('✅ 檔案建立成功: ' + testFile.getId());
    testFile.setTrashed(true); // 刪除測試檔案
    Logger.log('✅ 檔案刪除成功');
  } catch (e) {
    Logger.log('❌ Drive 操作失敗: ' + e.message);
  }

  Logger.log('--- 診斷完成 ---');
}

// === 設定區 ===
// 請在 Google Apps Script 編輯器中設定以下 Script Properties：
// DRIVE_FOLDER_ID: 學校 Google Drive 資料夾 ID
// SPREADSHEET_ID: Google Sheets 資料庫 ID

/**
 * Web App 進入點 - 處理 GET 請求
 */
function doGet(e) {
  e = e || {};
  e.parameter = e.parameter || {};
  var page = e.parameter.page || 'index';
  var userEmail = Session.getActiveUser().getEmail();

  // 未登入或非本校帳號
  if (!userEmail || !isAuthorized(userEmail)) {
    return HtmlService.createHtmlOutputFromFile('unauthorized')
      .setTitle('自主學習成果展示平台')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  var template;
  var userIsAdmin = isAdmin(userEmail);
  var userIsStudent = isStudent(userEmail);

  switch (page) {
    case 'upload':
      // 僅學生可上傳
      if (!userIsStudent) {
        template = HtmlService.createTemplateFromFile('index');
        break;
      }
      template = HtmlService.createTemplateFromFile('upload');
      break;
    case 'viewer':
      template = HtmlService.createTemplateFromFile('viewer');
      template.workId = e.parameter.id || '';
      break;
    case 'my-works':
      // 僅學生可查看自己的作品
      if (!userIsStudent) {
        template = HtmlService.createTemplateFromFile('index');
        break;
      }
      template = HtmlService.createTemplateFromFile('my-works');
      break;
    case 'admin':
      // 僅管理員可進入後台
      if (!userIsAdmin) {
        template = HtmlService.createTemplateFromFile('index');
        break;
      }
      template = HtmlService.createTemplateFromFile('admin');
      break;
    default:
      template = HtmlService.createTemplateFromFile('index');
  }

  return template.evaluate()
    .setTitle('自主學習成果展示平台')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * 在 HTML 中引入其他 HTML 檔案（用於共用元件）
 * 使用 createTemplateFromFile 以支援模板標籤 <?= ?>
 */
function include(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}

/**
 * 處理前端 API 呼叫的統一入口
 */
function handleApiRequest(action, params) {
  var userEmail = Session.getActiveUser().getEmail();

  if (!userEmail || !isAuthorized(userEmail)) {
    return { success: false, error: '未授權的存取' };
  }

  try {
    switch (action) {
      // 作品相關
      case 'getAllWorks':
        return { success: true, data: getAllWorksWithLikes(params.page, params.pageSize, params.search, params.fileType, params.sortBy, userEmail, params.category) };
      case 'getWorkById':
        var work = getWorkById(params.id);
        if (work) {
          work.likeCount = getLikeCount(params.id);
          work.liked = hasLiked(params.id, userEmail);
        }
        return { success: true, data: work };

      // 按讚功能
      case 'toggleLike':
        return { success: true, data: toggleLike(params.workId, userEmail) };
      case 'getMyWorks':
        return { success: true, data: getWorksByStudent(getStudentId(userEmail)) };
      case 'createWork':
        return { success: true, data: createWork(params) };
      case 'updateWork':
        return updateWorkWithAuth(params, userEmail);
      case 'deleteWork':
        return deleteWorkWithAuth(params.id, userEmail);

      // 檔案相關
      case 'uploadFile':
        return { success: true, data: uploadFileFromBase64(params.base64, params.fileName, params.mimeType) };
      case 'getThumbnail':
        return { success: true, data: getFileThumbnailBase64(params.fileId) };

      // 類別
      case 'getCategories':
        return { success: true, data: getCategories() };

      // 使用者資訊
      case 'getCurrentUser':
        return { success: true, data: getUserInfo(userEmail) };

      // 管理員功能
      case 'searchWorks':
        if (!isAdmin(userEmail)) return { success: false, error: '需要管理員權限' };
        return { success: true, data: searchWorks(params.query) };
      case 'getStatistics':
        if (!isAdmin(userEmail)) return { success: false, error: '需要管理員權限' };
        return { success: true, data: getStatistics() };
      case 'getWorksByYear':
        if (!isAdmin(userEmail)) return { success: false, error: '需要管理員權限' };
        return { success: true, data: getWorksByGraduationYear(params.year) };
      case 'batchDelete':
        if (!isAdmin(userEmail)) return { success: false, error: '需要管理員權限' };
        return { success: true, data: batchDeleteWorks(params.workIds) };

      // 類別管理（管理員）
      case 'addCategory':
        if (!isAdmin(userEmail)) return { success: false, error: '需要管理員權限' };
        return { success: true, data: addCategory(params.name) };
      case 'updateCategory':
        if (!isAdmin(userEmail)) return { success: false, error: '需要管理員權限' };
        return { success: true, data: updateCategory(params.categoryId, params.newName) };
      case 'deleteCategory':
        if (!isAdmin(userEmail)) return { success: false, error: '需要管理員權限' };
        return { success: true, data: deleteCategory(params.categoryId, params.replacementName) };

      default:
        return { success: false, error: '未知的操作: ' + action };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * 更新作品（含權限檢查）
 */
function updateWorkWithAuth(params, userEmail) {
  var work = getWorkById(params.id);
  if (!work) return { success: false, error: '作品不存在' };

  var studentId = getStudentId(userEmail);
  if (work.studentId !== studentId && !isAdmin(userEmail)) {
    return { success: false, error: '您沒有權限修改此作品' };
  }

  updateWork(params.id, params);
  return { success: true };
}

/**
 * 刪除作品（含權限檢查）
 */
function deleteWorkWithAuth(workId, userEmail) {
  var work = getWorkById(workId);
  if (!work) return { success: false, error: '作品不存在' };

  var studentId = getStudentId(userEmail);
  if (work.studentId !== studentId && !isAdmin(userEmail)) {
    return { success: false, error: '您沒有權限刪除此作品' };
  }

  // 刪除 Drive 檔案
  if (work.driveFileId) {
    try { deleteFile(work.driveFileId); } catch (e) { /* 檔案可能已不存在 */ }
  }
  if (work.thumbnailId) {
    try { deleteFile(work.thumbnailId); } catch (e) { /* 縮圖可能已不存在 */ }
  }

  // 刪除 Sheet 記錄
  deleteWork(workId);
  return { success: true };
}

/**
 * 初始化 Google Sheets（首次使用時執行）
 */
function initializeSpreadsheet() {
  var ss = getSpreadsheet();

  // 建立作品資料表
  var worksSheet = ss.getSheetByName('works');
  if (!worksSheet) {
    worksSheet = ss.insertSheet('works');
    worksSheet.appendRow([
      'id', 'studentId', 'studentName', 'studentEmail',
      'title', 'description', 'fileType', 'driveFileId',
      'thumbnailId', 'category', 'className', 'createdAt', 'updatedAt'
    ]);
    worksSheet.setFrozenRows(1);
  }

  // 建立類別表
  var categoriesSheet = ss.getSheetByName('categories');
  if (!categoriesSheet) {
    categoriesSheet = ss.insertSheet('categories');
    categoriesSheet.appendRow(['id', 'name', 'order']);
    categoriesSheet.setFrozenRows(1);
    // 預設類別
    var defaults = [
      '書面報告與小論文',
      '專題研究與科展作品',
      '創意實作與藝術作品',
      '學習心得與專書閱讀',
      '語言與跨文化學習',
      '服務學習與實作記錄'
    ];
    for (var c = 0; c < defaults.length; c++) {
      categoriesSheet.appendRow([Utilities.getUuid(), defaults[c], c + 1]);
    }
  }

  // 建立學生名單表
  var studentsSheet = ss.getSheetByName('students');
  if (!studentsSheet) {
    studentsSheet = ss.insertSheet('students');
    studentsSheet.appendRow(['email', 'name', 'enrollYear', 'class']);
    studentsSheet.setFrozenRows(1);
    // 範例學生（請修改為實際學生資料，或批次匯入）
    studentsSheet.appendRow(['110001@mail2.chshs.ntpc.edu.tw', '範例學生']);
  }

  // 建立管理員名單表
  var adminsSheet = ss.getSheetByName('admins');
  if (!adminsSheet) {
    adminsSheet = ss.insertSheet('admins');
    adminsSheet.appendRow(['email', 'name']);
    adminsSheet.setFrozenRows(1);
    // 預設加入一個管理員（請修改為實際的管理員 email）
    adminsSheet.appendRow(['admin@mail2.chshs.ntpc.edu.tw', '系統管理員']);
  }

  // 刪除預設的 Sheet1
  var defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('工作表1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  return '初始化完成！';
}
