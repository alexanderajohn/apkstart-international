/* ApkStart International — MIT, derived from RoutineMiku/apkstart. */
(function(global) {
'use strict';
const codes = ['en','vi','zh-CN'];
function normalize(value) {
  const code = String(value || '').toLowerCase();
  if (code.startsWith('vi')) return 'vi';
  if (code.startsWith('zh')) return 'zh-CN';
  return 'en';
}
function t(value, code) {
  const raw = String(value == null ? '' : value);
  if (normalize(code) === 'zh-CN') return raw;
  const match = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const source = match[2];
  const dict = global.ASI_CATALOGS[normalize(code)] || {};
  if (Object.prototype.hasOwnProperty.call(dict, source)) return match[1] + dict[source] + match[3];
  const time = source.match(/^(\d+)\s*(分钟|小时|天)前$/);
  if (time) {
    const n = Number(time[1]);
    const enUnit = {'分钟':'minute','小时':'hour','天':'day'}[time[2]];
    const viUnit = {'分钟':'phút','小时':'giờ','天':'ngày'}[time[2]];
    return match[1] + (normalize(code) === 'vi' ? n + ' ' + viUnit + ' trước' : n + ' ' + enUnit + (n === 1 ? '' : 's') + ' ago') + match[3];
  }
  const count = source.match(/^(\d+)\s*个应用$/);
  if (count) {
    const n = Number(count[1]);
    return match[1] + (normalize(code) === 'vi'
      ? n + ' ứng dụng'
      : n + (n === 1 ? ' app' : ' apps')) + match[3];
  }
  // Translate only known system status templates. Do not translate user-supplied
  // application names or use broad Chinese substring replacement.
  const rules = [
    [/^正在打开\s+(.+)$/, {en: name => 'Opening ' + name + '…', vi: name => 'Đang mở ' + name + '…'}],
    [/^正在安装\s+(.+)$/, {en: name => 'Installing ' + name + '…', vi: name => 'Đang cài ' + name + '…'}],
    [/^(.+) 已安装$/, {en: name => name + ' installed', vi: name => 'Đã cài ' + name}],
    [/^(.+) 兼容性提示$/, {en: name => name + ': compatibility notice', vi: name => name + ': lưu ý tương thích'}],
  ];
  for (const [pattern, formats] of rules) {
    const parts = source.match(pattern);
    if (parts) {
      return match[1] + formats[normalize(code)](parts[1]) + match[3];
    }
  }
  return raw;
}
global.ASI_TRANSLATOR = {codes, normalize, t};
})(window);
