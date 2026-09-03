!macro NSIS_HOOK_POSTINSTALL
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" checkNative doneWebView
  checkNative:
    ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
    StrCmp $0 "" missingWebView doneWebView
  missingWebView:
    MessageBox MB_OK|MB_ICONINFORMATION "未检测到 WebView2 运行时。MarkLite 需要系统 WebView2 才能打开窗口。安装程序将打开 Microsoft 官方说明页面。"
    ExecShell "open" "https://developer.microsoft.com/microsoft-edge/webview2/"
  doneWebView:
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend
