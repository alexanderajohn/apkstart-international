# Dùng thử ApkStart International trên Windows

**Developer Preview 1.0.0-rc.1 · Windows x64 · chưa ký**

Gói này dành cho người thử chức năng mở ứng dụng Android từ Windows. Hai tệp ZIP bên trong là bản Portable và Setup của commit `2df10a0ab7141b7e214c5c15b40f826963ef7ab1`. Mỗi lần đóng gói cho người thử, CI tải lại cả hai tệp, đối chiếu SHA-256, kiểm tra danh sách tệp Portable và chạy thử cả hai bản trên Windows Server 2025.

## Bắt đầu

1. Đăng nhập GitHub để tải artifact **ApkStart-International-Windows-Tester-Preview** rồi giải nén vào một thư mục mới. Có thể dùng PowerShell trong thư mục đó để đối chiếu kết quả với `SHA256SUMS.txt`.

   ```powershell
   Get-FileHash .\portable.zip, .\setup.zip -Algorithm SHA256
   ```

2. Chọn **một** cách dùng. Với Portable, giải nén toàn bộ `portable.zip` vào thư mục riêng và mở `ApkStart International.exe`. Với Setup, giải nén `setup.zip` rồi mở tệp `*-Setup.exe` trong thư mục `dist/release`. Đối chiếu SHA-256 của EXE với `SETUP-EXE-SHA256.txt` ở thư mục ngoài cùng trước khi chạy. Nếu máy yêu cầu chữ ký của nhà phát hành, dừng tại đó.
3. Dùng một **Profile thử nghiệm mới**. Giữ bản sao lưu ngoại tuyến của các Profile có dữ liệu quan trọng. Trình thiết lập lấy Android Emulator và ảnh hệ thống riêng từ Google.
4. Với APK có nguồn gốc rõ ràng, kiểm tra tên gói, Profile và SHA-256 trong hộp thoại trước khi xác nhận. Mở shortcut của ứng dụng, thử thu nhỏ rồi khôi phục và mở lại ứng dụng sau khi khởi động lại ApkStart.

## Phạm vi kiểm chứng

API Demos và Fossify Calculator đã cài qua Explorer, mở từ shortcut đúng Profile và qua kiểm tra cửa sổ trên Windows Server. Chuyển 5,41 GB dữ liệu mã hóa giữa hai Profile trên cùng máy cũng đã được kiểm chứng. Windows 10/11 trên máy thật, chuyển giữa hai máy và sử dụng lâu dài vẫn đang chờ thử nghiệm.

App Manager dạng split đôi khi gặp hộp thoại Android không phản hồi. Quick Boot ở 720p từng không đánh thức được Android. Khi gặp lỗi, ghi lại ứng dụng, dạng APK/APKS/XAPK, phiên bản Windows, CPU/GPU, chế độ khởi động và bước cuối cùng thành công. Kiểm tra bằng Profile thử nghiệm và giữ lại dữ liệu để chẩn đoán. Nếu chia sẻ kết quả, chỉ gửi thông tin kỹ thuật đã xem lại.

[Kết quả Android theo từng máy](https://github.com/alexanderajohn/apkstart-international/actions/runs/46043742272) · [Windows CI của hai gói](https://github.com/alexanderajohn/apkstart-international/actions/runs/46043750085)
