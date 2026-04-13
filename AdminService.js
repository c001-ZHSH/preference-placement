// ============================================
// AdminService.gs - 管理員功能
// ============================================

/**
 * 取得統計資料
 */
function getStatistics() {
  var sheet = getWorksSheet();
  if (!sheet) return { totalWorks: 0, yearStats: [], typeStats: {} };

  var data = sheet.getDataRange().getValues();
  var yearMap = {};
  var typeStats = { pdf: 0, video: 0 };
  var studentSet = {};

  for (var i = 1; i < data.length; i++) {
    var studentId = data[i][1].toString();
    var fileType = data[i][6];
    var enrollYear = getEnrollmentYear(studentId);

    // 年份統計
    if (enrollYear > 0) {
      if (!yearMap[enrollYear]) {
        yearMap[enrollYear] = { year: enrollYear, workCount: 0, studentCount: 0, students: {} };
      }
      yearMap[enrollYear].workCount++;
      yearMap[enrollYear].students[studentId] = true;
    }

    // 類型統計
    if (fileType === 'pdf') typeStats.pdf++;
    else if (fileType === 'video') typeStats.video++;

    // 學生數
    studentSet[studentId] = true;
  }

  // 轉換年份統計為陣列
  var yearStats = [];
  for (var year in yearMap) {
    var stat = yearMap[year];
    stat.studentCount = Object.keys(stat.students).length;
    stat.isGraduated = isGraduated(year + '000'); // 簡易判斷
    delete stat.students;
    yearStats.push(stat);
  }

  // 依年份排序（新到舊）
  yearStats.sort(function (a, b) { return b.year - a.year; });

  return {
    totalWorks: data.length - 1,
    totalStudents: Object.keys(studentSet).length,
    yearStats: yearStats,
    typeStats: typeStats
  };
}

/**
 * 依入學年份取得作品
 */
function getWorksByGraduationYear(year) {
  var sheet = getWorksSheet();
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var works = [];

  for (var i = 1; i < data.length; i++) {
    var studentId = data[i][1].toString();
    var enrollYear = getEnrollmentYear(studentId);

    if (enrollYear === year) {
      works.push(rowToWork(headers, data[i]));
    }
  }

  return works;
}

/**
 * 批次刪除作品（含 Drive 檔案）
 */
function batchDeleteWorks(workIds) {
  var sheet = getWorksSheet();
  var data = sheet.getDataRange().getValues();
  var deletedCount = 0;
  var errors = [];

  // 從後往前刪除（避免行號偏移）
  var rowsToDelete = [];

  for (var i = 1; i < data.length; i++) {
    if (workIds.indexOf(data[i][0]) !== -1) {
      // 刪除 Drive 檔案
      var driveFileId = data[i][7];
      var thumbnailId = data[i][8];

      if (driveFileId) {
        try { deleteFile(driveFileId); } catch (e) {
          errors.push('檔案刪除失敗: ' + driveFileId);
        }
      }
      if (thumbnailId) {
        try { deleteFile(thumbnailId); } catch (e) { /* ignore */ }
      }

      rowsToDelete.push(i + 1);
      deletedCount++;
    }
  }

  // 從後往前刪除行（避免行號偏移）
  rowsToDelete.sort(function (a, b) { return b - a; });
  for (var j = 0; j < rowsToDelete.length; j++) {
    sheet.deleteRow(rowsToDelete[j]);
  }

  // 記錄操作日誌
  logAdminAction('批次刪除', '刪除了 ' + deletedCount + ' 筆作品');

  return {
    deletedCount: deletedCount,
    errors: errors
  };
}

/**
 * 記錄管理員操作日誌
 */
function logAdminAction(action, detail) {
  var ss = getSpreadsheet();
  var logSheet = ss.getSheetByName('admin_logs');
  if (!logSheet) {
    logSheet = ss.insertSheet('admin_logs');
    logSheet.appendRow(['時間', '管理員', '操作', '詳細']);
    logSheet.setFrozenRows(1);
  }

  var email = Session.getActiveUser().getEmail();
  logSheet.appendRow([new Date().toISOString(), email, action, detail]);
}
