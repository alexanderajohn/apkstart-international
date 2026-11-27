# ApkStart International — Tiếng Việt

**Đây là dự án fork độc lập, không phải bản phát hành chính thức của RoutineMiku.**

ApkStart International hướng tới trải nghiệm chạy ứng dụng Android trên Windows bằng cửa sổ riêng, cùng giao diện tiếng Anh, tiếng Việt và tiếng Trung giản thể.

## Dùng thử trên Windows

**Phiên bản 1.0.0-rc.1 đang ở trạng thái Release Blocked.** GitHub Actions đã chạy APK thật trên Android 14 với Windows Server và Linux. Kiểm thử trên máy Windows 10/11, kiểm tra đầy đủ ba ngôn ngữ và ký bản phân phối vẫn còn mở.

1. Chọn một commit đã đạt Windows CI trong [bảng kết quả và tải xuống](docs/DEVELOPMENT_PROGRESS.md). Tải **Portable** hoặc **Setup** ở đúng dòng của commit đó. Cả hai bản đều chưa ký.
2. Với Portable, giải nén toàn bộ vào một thư mục rồi mở `ApkStart International.exe`. Với Setup, giải nén và đối chiếu SHA-256 của tệp cài đặt với `SHA256SUMS`. Sao lưu Profile và AVD trước khi thử nâng cấp.
3. Mở ứng dụng và làm theo hướng dẫn thiết lập Android. Bộ công cụ Android và ảnh hệ thống được tải riêng. Xem [hướng dẫn cài đặt và khôi phục phiên bản](docs/CANDIDATE_VALIDATION.md).

## SmartCheck trước khi cài

Chọn hoặc kéo APK vào giao diện để xem yêu cầu Android, kiến trúc CPU, quyền và SHA-256. Với bộ APKS/XAPK được hỗ trợ, SmartCheck đọc cả APK cơ sở lẫn các APK thành phần. Dấu hiệu chữ ký trong bản xem trước chưa xác nhận danh tính nhà phát triển. Khi mở APK từ Explorer hoặc dòng lệnh, hộp thoại Windows yêu cầu xác nhận trước khi cài vào Profile đã chọn.

## Auto-Repair 2.0 — chẩn đoán và sửa lỗi an toàn

Vào **Cài đặt → Môi trường Android → Auto-Repair 2.0 → Kiểm tra lỗi**. Công cụ nhận diện lỗi GPU, ảo hóa, ADB, Quick Boot, ổ đĩa và thành phần còn thiếu; hiển thị gợi ý tiếng Việt/Anh/Trung. Quét chẩn đoán chỉ đọc; muốn sửa thì người dùng phải xác nhận. Chỉ thay đổi chế độ GPU software, Quick Boot cho lần chạy sau hoặc kết nối lại ADB trên cổng riêng 5044 khi máy ảo đang chạy. Không tự xóa dữ liệu ứng dụng, snapshot, cài driver hay đổi cấu hình Windows.

## Smart Performance Engine — đo hiệu năng và tối ưu theo APK

Vào **Settings → Performance & Resource Usage → Smart Performance Engine → Bắt đầu đo**. Màn hình đo CPU/RAM Windows, CPU/RAM tiến trình emulator khi có, chế độ render GPU và ước lượng FPS bằng Android `dumpsys gfxinfo` khi APK đang chạy. Không có số liệu sẽ báo N/A, không bịa FPS/GPU. Máy ảo Android dùng chung tài nguyên; số đo emulator **không phải CPU/RAM riêng của từng APK**. Chọn cấu hình cho mỗi APK (`inherit/save/balanced/smooth`) để áp dụng mức ưu tiên tiến trình ở **lần mở APK kế tiếp**, không đổi RAM/số nhân VM, không tự chỉnh cấu hình. Dữ liệu đo chỉ dùng trong phiên hiện tại và không được gửi ra máy chủ.

## Android Profiles — môi trường Android độc lập

Trên màn hình chính có thanh **Android Profiles** để tạo môi trường như Công việc / Giải trí / Thử nghiệm. Mỗi profile phụ có danh sách APK, cache, AVD, ứng dụng và dữ liệu Android riêng. Profile **Mặc định** giữ nguyên vị trí dữ liệu cũ, không di chuyển hay xóa gì. Thành phần Android Emulator và ảnh hệ thống được dùng chung để tiết kiệm dung lượng.

Dừng Android và đóng các cửa sổ ứng dụng trước khi chuyển Profile. ApkStart kiểm tra máy ảo còn chạy và khởi động lại sau khi chuyển. Shortcut mới ghi cả tên gói lẫn mã Profile. Mỗi Profile có cấu hình thư mục chia sẻ riêng. [Hướng dẫn Android Profiles](docs/ANDROID_PROFILES.md)

## Sao lưu và khôi phục Android

Dừng Android rồi mở **Backup & Restore Center** để sao lưu Profile đang chọn. Khi chuyển sang máy khác, tạo một Profile phụ có cấu hình AVD tương thích và dùng chức năng nhập bản sao lưu mã hóa. Việc chuyển giữa hai máy Windows thật vẫn đang chờ kiểm chứng. [Hướng dẫn chuyển Profile](docs/PORTABLE_MIGRATION.md)

## Encrypted Backup & Recovery — sao lưu mã hóa bằng mật khẩu

Bản sao lưu mới được mã hóa mặc định bằng **AES-256-GCM**, khóa dẫn xuất bằng **scrypt** với salt ngẫu nhiên. Mỗi file có nonce riêng; danh sách tệp, tên ứng dụng và mã băm nằm trong manifest đã mã hóa. Dữ liệu **không tải lên server**, mật khẩu **không lưu vào cài đặt**. Backup vẫn là **thư mục** chứa các tệp mã hóa, không phải ZIP.

Khi tạo backup, anh nhập mật khẩu và xác nhận. Khi kiểm tra hoặc khôi phục, nhập lại mật khẩu. Nếu sai mật khẩu hoặc dữ liệu bị sửa, chương trình từ chối khôi phục trước khi ghi đè. Khôi phục còn yêu cầu gõ `RESTORE` và đồng ý ở hộp thoại hệ điều hành; bản dữ liệu cũ được giữ dưới dạng `.before-restore`. Backup cũ chưa mã hóa vẫn có thể kiểm tra và khôi phục nhưng được cảnh báo riêng. **Quên mật khẩu là không thể giải mã lại backup.** Thử với Android Emulator thật trước khi dùng cho dữ liệu quan trọng.
