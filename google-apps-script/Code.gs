// Jemutai Creations: saves commitments to this Google Sheet.
// The website only ever gets back first name, city, state, service, item and price range.
// Deployed as a Web app: Execute as "Me", access "Anyone".
var TAB = 'Commitments';
var HEAD = ['createdAt', 'firstName', 'lastName', 'email', 'city', 'state', 'service', 'item', 'details', 'range', 'knows', 'consent'];
var RANGES = { 'under-40': ['Under $40', 0], '40-80': ['$40-80', 40], '80-150': ['$80-150', 80], '150+': ['$150+', 150] };
var MIN = { 'Under $40': 0, '$40-80': 40, '$80-150': 80, '$150+': 150 };
var ITEMS = ['Dress', 'Skirt', 'Top', 'Trousers', 'Shirt', 'Crochet set', 'Bag', 'Other'];
var SERVICES = ['Custom piece', 'Alterations', 'Tailoring'];
var KNOWS = ['Family', 'Friend', 'Coworker or acquaintance', 'Friend of a friend', "Haven't met them"];
var STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR'.split(' ');

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(TAB);
  if (!s) { s = ss.insertSheet(TAB); s.appendRow(HEAD); s.setFrozenRows(1); }
  return s;
}

function rows_() {
  var v = sheet_().getDataRange().getValues();
  v.shift();
  return v.filter(function (r) { return r[1]; });
}

function publicList_() {
  var v = rows_();
  var list = v.map(function (r) {
    var d = r[0] instanceof Date ? r[0] : new Date(r[0]);
    return { firstName: r[1], city: r[4], state: r[5], service: r[6], item: r[7], range: r[9], date: Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd') };
  }).reverse();
  var atLeast = v.reduce(function (a, r) { return a + (MIN[r[9]] || 0); }, 0);
  return { count: v.length, atLeast: atLeast, list: list };
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function clean_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).replace(/^[=+\-@]/, "'$&");
}

function doGet() {
  return out_(publicList_());
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var b;
    try { b = JSON.parse(e.postData.contents); } catch (x) { return out_({ error: 'Bad request.' }); }
    if (b.website) return out_(publicList_()); // bot trap
    var r = {
      firstName: clean_(b.firstName, 40), lastName: clean_(b.lastName, 60), email: clean_(b.email, 120).toLowerCase(),
      city: clean_(b.city, 60), state: clean_(b.state, 2).toUpperCase(), service: clean_(b.service, 20), item: clean_(b.item, 40),
      details: clean_(b.details, 300), range: clean_(b.range, 10), knows: clean_(b.knows, 40)
    };
    if (!r.firstName || !r.lastName) return out_({ error: 'Please add your first and last name.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) return out_({ error: 'Please add a valid email.' });
    if (!r.city || STATES.indexOf(r.state) < 0) return out_({ error: 'Please add your city and state.' });
    if (SERVICES.indexOf(r.service) < 0) return out_({ error: 'Please choose what you need: a custom piece, alterations or tailoring.' });
    if (ITEMS.indexOf(r.item) < 0) return out_({ error: 'Please choose what it is.' });
    if (!RANGES[r.range]) return out_({ error: 'Please choose a price range.' });
    if (KNOWS.indexOf(r.knows) < 0) return out_({ error: 'Please say how you know Jemutai or Benjah.' });
    if (b.consent !== true) return out_({ error: 'Please tick the box to confirm.' });
    var label = RANGES[r.range][0];
    var dupe = rows_().some(function (x) { return String(x[3]).toLowerCase() === r.email && x[6] === r.service && x[7] === r.item; });
    if (dupe) return out_({ error: 'You already made this commitment with that email. Thank you!' });
    sheet_().appendRow([new Date(), r.firstName, r.lastName, r.email, r.city, r.state, r.service, r.item, r.details, label, r.knows, 'yes']);
    var res = publicList_(); res.ok = true;
    return out_(res);
  } finally {
    lock.releaseLock();
  }
}
