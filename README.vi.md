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