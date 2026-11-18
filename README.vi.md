# ApkStart International — Tiếng Việt

**Đây là dự án fork độc lập, không phải bản phát hành chính thức của RoutineMiku.**

ApkStart International hướng tới trải nghiệm chạy ứng dụng Android trên Windows bằng cửa sổ riêng, cùng giao diện tiếng Anh, tiếng Việt và tiếng Trung giản thể.

## Đã triển khai trong bộ mã khởi tạo

- Bộ từ điển giao diện EN / VI / ZH-CN và nút đổi ngôn ngữ.
- Ghi nhớ lựa chọn ngôn ngữ; tự nhận diện ngôn ngữ hệ điều hành khi chưa chọn.
- Cấu hình tên sản phẩm, App ID, URL dự án và kênh GitHub của fork.
- Vô hiệu hóa lệnh build MSIX/AppX liên quan danh tính Microsoft Store của tác giả gốc.
- Kiểm thử i18n và kiểm tra cấu hình cơ bản chạy tự động.
- Giữ LICENSE và lưu lại README gốc để ghi công.

## Những phần chưa xong

Đây vẫn là **bản chuẩn bị source**, chưa phải bộ cài Windows hoàn thiện. Bộ từ điển hiện chỉ bao phủ các chuỗi đã có mục dịch; một số thông báo và màn hình chưa được dịch. Cần kiểm thử cập nhật, thư mục dữ liệu, liên kết `.apk`, hành vi xóa dữ liệu ứng dụng và giấy phép các thành phần Android/QEMU trước khi phát hành.

## Cách áp dụng vào fork

Cài Node.js 20+, Git. Fork repo `RoutineMiku/apkstart` qua GitHub, tải repo về máy và chạy:

```powershell
node .\apply.mjs --target C:\path\to\your\fork --repo TEN_GITHUB_CUA_ANH/apkstart-international
```

Hoặc chạy `node .\apply.mjs --clone --repo TEN_GITHUB_CUA_ANH/apkstart-international` từ thư mục bộ mã khởi tạo để tự clone upstream (yêu cầu có kết nối mạng và Git).

Tiếp theo kiểm thử:

```powershell
npm run test:international
npm run audit:international
npm run i18n:build
```

Dự án gốc: https://github.com/RoutineMiku/apkstart — tác giả RoutineMiku, giấy phép MIT. Đọc thêm [CREDITS.md](CREDITS.md) và [docs/RELEASE_BLOCKERS.md](docs/RELEASE_BLOCKERS.md).
## SmartCheck — kiểm tra APK trước khi cài

Chọn hoặc kéo tệp APK vào giao diện để kiểm tra ngay trên máy: Android tối thiểu, target SDK, CPU ABI, quyền ứng dụng, dấu hiệu chữ ký (chưa xác minh mật mã) và SHA-256. Không tải APK lên máy chủ. Chỉ bắt đầu cài khi người dùng nhấn xác nhận.

Gói .apks/.xapk hiện chỉ kiểm tra giới hạn, kèm cảnh báo. SmartCheck không phải công cụ diệt virus và không bảo đảm APK chạy được. Cài trực tiếp qua liên kết tệp Windows hoặc dòng lệnh chưa đi qua hộp thoại này.

## Auto-Repair 2.0 — chẩn đoán và sửa lỗi an toàn

Vào **Cài đặt → Môi trường Android → Auto-Repair 2.0 → Kiểm tra lỗi**. Công cụ nhận diện lỗi GPU, ảo hóa, ADB, Quick Boot, ổ đĩa và thành phần còn thiếu; hiển thị gợi ý tiếng Việt/Anh/Trung. Quét chẩn đoán chỉ đọc; muốn sửa thì người dùng phải xác nhận. Chỉ thay đổi chế độ GPU software, Quick Boot cho lần chạy sau hoặc kết nối lại ADB trên cổng riêng 5044 khi máy ảo đang chạy. Không tự xóa dữ liệu ứng dụng, snapshot, cài driver hay đổi cấu hình Windows.

## Smart Performance Engine — đo hiệu năng và tối ưu theo APK

Vào **Settings → Performance & Resource Usage → Smart Performance Engine → Bắt đầu đo**. Màn hình đo CPU/RAM Windows, CPU/RAM tiến trình emulator khi có, chế độ render GPU và ước lượng FPS bằng Android `dumpsys gfxinfo` khi APK đang chạy. Không có số liệu sẽ báo N/A, không bịa FPS/GPU. Máy ảo Android dùng chung tài nguyên; số đo emulator **không phải CPU/RAM riêng của từng APK**. Chọn cấu hình cho mỗi APK (`inherit/save/balanced/smooth`) để áp dụng mức ưu tiên tiến trình ở **lần mở APK kế tiếp**, không đổi RAM/số nhân VM, không tự chỉnh cấu hình. Dữ liệu đo chỉ dùng trong phiên hiện tại và không được gửi ra máy chủ.

## Android Profiles — môi trường Android độc lập

Trên màn hình chính có thanh **Android Profiles** để tạo môi trường như Công việc / Giải trí / Thử nghiệm. Mỗi profile phụ có danh sách APK, cache, AVD, ứng dụng và dữ liệu Android riêng. Profile **Mặc định** giữ nguyên vị trí dữ liệu cũ, không di chuyển hay xóa gì. Thành phần Android Emulator và ảnh hệ thống được dùng chung để tiết kiệm dung lượng.

Chỉ chạy **một profile tại một thời điểm**. Trước khi chuyển, anh cần dừng runtime trong Settings và đóng ứng dụng; nếu còn máy ảo mở, hệ thống từ chối chuyển để tránh gắn nhầm dữ liệu. Chuyển xong ApkStart tự khởi động lại. Shortcut của profile phụ tạm thời không tạo để tránh mở sai Android. Chưa hỗ trợ nhân bản/xóa profile hay chuyển dữ liệu giữa chúng. Xem [tài liệu Android Profiles](docs/ANDROID_PROFILES.md).
