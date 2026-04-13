// ============================================
// Auth.gs - 認證與授權邏輯
// ============================================

var SCHOOL_DOMAIN = 'mail2.chshs.ntpc.edu.tw';

/**
 * 取得目前登入者的 email
 */
function getCurrentUser() {
  return Session.getActiveUser().getEmail();
}

/**
 * 驗證是否為本校帳號（學生或管理員都算）
 */
function isAuthorized(email) {
  if (!email) return false;
  // 在 students 表或 admins 表中的帳號都可以存取
  return isStudent(email) || isAdmin(email);
}

/**
 * 檢查是否為已註冊的學生
 */
function isStudent(email) {
  if (!email) return false;
  var ss = getSpreadsheet();
  var studentsSheet = ss.getSheetByName('students');
  if (!studentsSheet) return false;

  var data = studentsSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString().toLowerCase() === email.toLowerCase()) {
      return true;
    }
  }
  return false;
}

/**
 * 檢查是否為管理員
 */
function isAdmin(email) {
  if (!email) return false;
  var ss = getSpreadsheet();
  var adminsSheet = ss.getSheetByName('admins');
  if (!adminsSheet) return false;

  var data = adminsSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString().toLowerCase() === email.toLowerCase()) {
      return true;
    }
  }
  return false;
}

/**
 * 取得學生姓名（從 students 表查詢）
 */
function getStudentName(email) {
  if (!email) return '';
  var ss = getSpreadsheet();
  var studentsSheet = ss.getSheetByName('students');
  if (!studentsSheet) return '';

  var data = studentsSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString().toLowerCase() === email.toLowerCase()) {
      return data[i][1].toString(); // 姓名欄
    }
  }
  return '';
}

/**
 * 從 email 擷取學號
 * 例如：110001@mail2.chshs.ntpc.edu.tw → 110001
 */
function getStudentId(email) {
  if (!email) return '';
  return email.split('@')[0];
}

/**
 * 從學號判斷入學年份
 * 假設學號前3碼為入學民國年份（例如：110 = 民國110年入學）
 * 請根據學校實際學號規則調整此函數
 */
function getEnrollmentYear(studentId) {
  if (!studentId || studentId.length < 3) return 0;
  var yearStr = studentId.substring(0, 3);
  var year = parseInt(yearStr, 10);
  if (isNaN(year) || year < 90 || year > 200) return 0;
  return year;
}

/**
 * 判斷學生是否已畢業
 * 高中三年制：入學年份 + 3 <= 當前民國年 即為已畢業
 */
function isGraduated(studentId) {
  var enrollYear = getEnrollmentYear(studentId);
  if (enrollYear === 0) return false;
  var now = new Date();
  var rocYear = now.getFullYear() - 1911;
  return (enrollYear + 3) <= rocYear;
}

/**
 * 取得使用者資訊（含角色判斷）
 */
function getUserInfo(email) {
  var studentId = getStudentId(email);
  var admin = isAdmin(email);
  var student = isStudent(email);

  return {
    email: email,
    studentId: studentId,
    name: admin ? '管理員' : getStudentName(email),
    role: admin ? 'admin' : 'student',
    isAdmin: admin,
    isStudent: student,
    enrollmentYear: student ? getEnrollmentYear(studentId) : 0
  };
}
