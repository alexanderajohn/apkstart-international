'use strict';

const translations = {
  en: {
    title: 'Confirm Android APK installation', install: 'Confirm APK installation', update: 'Confirm update of an Android app',
    cancel: 'Cancel', installTo: 'Install to ', app: 'App', pkg: 'Package', profile: 'Profile', source: 'Source',
    bundle: 'Split APK bundle: package identity not available in the static preview',
    newPackage: 'Install to the selected Profile only.', existing: 'Existing app: this may UPDATE it while retaining Android user data.',
    signing: 'WARNING: SmartCheck does not cryptographically verify APK signing or prove malware safety.',
    consent: 'Cancel is the default. No Android installation occurs before approval.',
  },
  vi: {
    title: 'Xác nhận cài đặt APK Android', install: 'Cài đặt APK này?', update: 'Cập nhật ứng dụng Android này?',
    cancel: 'Hủy', installTo: 'Cài vào ', app: 'Ứng dụng', pkg: 'Mã gói', profile: 'Hồ sơ', source: 'Tệp nguồn',
    bundle: 'Gói APK phân tách. Bản xem trước chưa xác định được mã gói.',
    newPackage: 'Chỉ cài ứng dụng vào hồ sơ đã chọn.', existing: 'Ứng dụng đã có trong hồ sơ này. Việc tiếp tục có thể cập nhật ứng dụng và giữ lại dữ liệu Android.',
    signing: 'SmartCheck chưa xác minh chữ ký số của APK và chưa xác định được tệp có chứa mã độc hay không.',
    consent: 'Hủy là lựa chọn mặc định. Android chỉ bắt đầu cài đặt sau khi bạn xác nhận.',
  },
  'zh-CN': {
    title: '确认安装 Android APK', install: '要安装此 APK 吗？', update: '要更新此 Android 应用吗？',
    cancel: '取消', installTo: '安装到 ', app: '应用', pkg: '包名', profile: '配置文件', source: '源文件',
    bundle: '拆分 APK 包。静态预览无法确定包名。',
    newPackage: '仅安装到所选的 Android 配置文件。', existing: '此应用已安装。继续操作可能会更新应用，并保留其 Android 用户数据。',
    signing: 'SmartCheck 未对 APK 签名做密码学验证，也无法证明该文件不含恶意软件。',
    consent: '默认选项为取消。只有确认后，Android 才会开始安装。',
  },
};

function installConfirmation(preview, {existing = false, locale = 'en', profileName} = {}) {
  if (!preview || typeof preview.fileName !== 'string') throw Error('Invalid approval preview');
  const code = String(locale).split('-')[0].toLowerCase();
  const t = code === 'vi' ? translations.vi : code === 'zh' ? translations['zh-CN'] : translations.en;
  const lines = preview.package
    ? [t.app + ': ' + (preview.label || preview.package), t.pkg + ': ' + preview.package]
    : [t.bundle];
  lines.push(t.profile + ': ' + preview.profileId, t.source + ': ' + preview.fileName,
    'SHA-256: ' + preview.sha256, existing ? t.existing : t.newPackage, t.signing, t.consent);
  return {title: t.title, message: existing ? t.update : t.install, detail: lines.join('\n'),
    buttons: [t.cancel, t.installTo + (profileName || preview.profileId)]};
}

module.exports = {installConfirmation};
