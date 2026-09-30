# story-notify-toast.ps1 — Windows toast cho story-notify.
# WinRT lazy-load (không Add-Type/csc — windows-edr-posture); WinPS 5.1 only,
# pwsh 7 không có WinRT adapter. AppId dùng AppUserModelID của PowerShell —
# AppId chưa đăng ký với Windows sẽ throw "Element not found".
param(
  [Parameter(Mandatory = $true)][string]$Title,
  [Parameter(Mandatory = $true)][string]$Body,
  [string]$AppId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
)
$ErrorActionPreference = 'Stop'
try {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  $t = [System.Security.SecurityElement]::Escape($Title)
  $b = [System.Security.SecurityElement]::Escape($Body)
  $xml.LoadXml("<toast><visual><binding template=""ToastText02""><text id=""1"">$t</text><text id=""2"">$b</text></binding></visual></toast>")
  $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show($toast)
  exit 0
} catch {
  exit 1
}
