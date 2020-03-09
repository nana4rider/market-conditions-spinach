function updateSheet() {
  // メールを検索する条件
  var SEARCH_SUBJECT = 'subject:ホウレン草市況 -subject:露地';
  // 書き出すセルの開始列
  var START_COLUMN = 1;
  // 設定シートのメール検索日のセル
  var SETTINGS_SHEET_SEARCH_MAIL_DATE = 'B2';
  // グラフ画像キャッシュのセル
  var SETTINGS_SHEET_GRAPH_CACHE = 'B3:B4';

  var spreadSheet = SpreadsheetApp.getActiveSpreadsheet();
  // ex: [{"priceAl": 90, "priceAm": 100},
  //      {"priceAl": 85, "priceAm": 95}
  var datas = [];
  // メールの検索キーワードを組み立て
  var searchKeyword = SEARCH_SUBJECT;
  var settingsSheet = spreadSheet.getSheetByName('SETTINGS');
  var searchMailDateRange = settingsSheet.getRange(SETTINGS_SHEET_SEARCH_MAIL_DATE);
  var searchMailDateValue = searchMailDateRange.getValue();
  var searchMailDate = null;
  var latestMailDate = null;
  if (searchMailDateValue) {
    searchMailDate = Moment.moment(searchMailDateValue);
    // 最終検索日以降
    searchKeyword += ' after:' + searchMailDate.format('YYYY/MM/DD');
  }

  var messages = [];
  GmailApp.search(searchKeyword).forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      messages.push(message);
    });
  });

  // メールから市況データを集計
  messages.sort(function (a, b) {
    return a.getDate().getTime() - b.getDate().getTime();
  }).forEach(function (message) {
    var bodies = message.getPlainBody().split("\r\n");
    var bodyLength = bodies.length;
    var bodyIndex = -1;
    var getNextBody = function () {
      while (bodyIndex++ < bodyLength) {
        var body = trim(bodies[bodyIndex]);
        if (body.length > 0) return body;
      }
      return null;
    };

    // Mail
    var mailDate = Moment.moment(message.getDate());
    if (searchMailDate && !mailDate.isAfter(searchMailDate)) return;

    var mailMonth = mailDate.month() + 1;
    // mm月dd日出荷
    var linePd = getNextBody();
    var pdMatcher = linePd.match(/(.+)月　*(.+)日出荷/);
    if (!pdMatcher) return;
    // AL, AM, AS
    var lineAl = getNextBody();
    var lineAm = getNextBody();
    var lineAs = getNextBody();
    // label 出荷数量
    getNextBody();
    // n箱
    var lineSq = getNextBody();
    // 本文に年がないので、メールの時刻から取得する
    var year = mailDate.year();
    var month = Number(zen2han(pdMatcher[1]));
    var day = Number(zen2han(pdMatcher[2]));
    // 前年の市況が年初に送られてきた場合
    if (month === 12 && mailMonth === 1) year--;

    var data = {};
    data.mailDate = mailDate;
    data.date = Moment.moment([year, month - 1, day]);
    data.priceAl = Number(zen2han(lineAl.replace('ＡＬ', '')));
    data.priceAm = Number(zen2han(lineAm.replace('ＡＭ', '')));
    data.priceAs = Number(zen2han(lineAs.replace('ＡＳ', '')));
    data.shipmentQuantity = Number(zen2han(lineSq.replace('箱', '')));

    datas.push(data);
    latestMailDate = mailDate;
  });

  // シートに書き出し
  var latestSheet = null;
  datas.sort(function (a, b) {
    return a.date.diff(b.date);
  }).forEach(function (data) {
    var sheetName = String(data.date.year());
    var sheet = spreadSheet.getSheetByName(sheetName);

    // シートが存在しない場合、雛形からコピーして作成する
    if (sheet === null) {
      var templateSheet = spreadSheet.getSheetByName('TEMPLATE');
      sheet = templateSheet.copyTo(spreadSheet);
      spreadSheet.setActiveSheet(sheet);
      spreadSheet.moveActiveSheet(1);
      sheet.setName(sheetName).showSheet();
    }

    var row = sheet.getLastRow() + 1;
    var column = START_COLUMN;
    sheet.getRange(row, column++).setValue(data.date.format('YYYY/MM/DD'));
    sheet.getRange(row, column++).setValue(data.priceAl);
    sheet.getRange(row, column++).setValue(data.priceAm);
    sheet.getRange(row, column++).setValue(data.priceAs);
    sheet.getRange(row, column++).setValue(data.shipmentQuantity);
    sheet.getRange(row, column++).setValue(data.mailDate.format("YYYY/MM/DD HH:mm:ss"));
    latestSheet = sheet;
  });

  if (latestMailDate) {
    // グラフのキャッシュを作成
    var graphCacheRange = settingsSheet.getRange(SETTINGS_SHEET_GRAPH_CACHE);
    var base64image = Utilities.base64Encode(latestSheet.getCharts()[0].getBlob().getBytes());
    graphCacheRange.setValues([
      [base64image.substring(0, 50000)],
      [base64image.substring(50000, 100000)]
    ]);
    // 全てが正常終了したら、設定シートを更新する
    searchMailDateRange.setValue(latestMailDate.format());
  }
}

// 全角を半角に変換
function zen2han(str) {
  return str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (s) {
    return String.fromCharCode(s.charCodeAt(0) - 65248);
  });
}

// 前後の全角、半角スペースを削除
function trim(str) {
  return str.replace(/^[ 　]+/g, '').replace(/[ 　]+$/, '');
}
