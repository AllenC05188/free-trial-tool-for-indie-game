const { app, BrowserWindow, Menu } = require('electron')
const path = require('path')

function createWindow () {
  // 建立瀏覽器視窗
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "天才模擬器 GENIUS SIMULATOR",
    backgroundColor: '#0d0618', // 配合你遊戲的虛空深色背景
    webPreferences: {
      nodeIntegration: false, // 網頁遊戲不需直接調用 Node 權限，關閉較安全
      contextIsolation: true
    }
  })

  // 隱藏上方預設的工具列選單，讓它更像一個獨立的單機遊戲
  Menu.setApplicationMenu(null)

  // 關鍵：直接載入同資料夾下的 index.html
  win.loadFile(path.join(__dirname, 'index.html'))

  // 如果未來想邊玩邊除錯，可以把下面這行的註解「//」拿掉，就會自動開啟開發者工具
  // win.webContents.openDevTools()
}

// 當 Electron 準備就緒時，開啟視窗
app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 當所有視窗關閉時，關閉 App（Mac 系統除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})