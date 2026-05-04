const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const mineflayer = require('mineflayer');

let mainWindow;

const configPath = path.join(app.getPath('userData'), 'config.json');

function getConfig() {
  try {
    if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (e) {}
  return { serverUrl: 'http://localhost:3000' };
}

function saveConfig(cfg) {
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#1a1a2e',
    autoHideMenuBar: true,
    title: 'CarteluBots'
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  stopAllBots();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-config', () => getConfig());
ipcMain.handle('save-config', (_, cfg) => { saveConfig(cfg); return true; });

// ========================================
// MINEFLAYER - boții rulează AICI, pe calculatorul user-ului
// ========================================

const AFK_CYCLE = 5 * 60 * 60 * 1000 + 10 * 60 * 1000; // 5h 10min
const COINS_INTERVAL = 100 * 60 * 1000; // 100 minute

let session = null; // { bots: [], afkInterval, coinsInterval }

function logToUI(msg) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bot-log', msg);
  }
  console.log(msg);
}

function reportStatus(botId, isOnline, status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bot-status', { botId, isOnline, status });
  }
}

function createBot(acc, index, totalBots) {
  setTimeout(() => {
    if (!session) return;
    logToUI(`🚀 Pornesc bot: ${acc.mc_username}`);

    let bot;
    try {
      bot = mineflayer.createBot({
        host: 'eu.gamster.org',
        port: 25565,
        username: acc.mc_username,
        version: '1.20.4'
      });
    } catch (e) {
      logToUI(`❌ Eroare bot ${acc.mc_username}: ${e.message}`);
      return;
    }

    session.bots[index] = { instance: bot, acc, online: false };
    reportStatus(acc.id, false, 'connecting');

    bot.on('login', () => {
      logToUI(`✅ ${acc.mc_username} s-a logat!`);
      reportStatus(acc.id, false, 'logged_in');
    });

    bot.on('spawn', () => {
      logToUI(`🎮 ${acc.mc_username} a intrat în joc!`);
      if (session && session.bots[index]) session.bots[index].online = true;
      reportStatus(acc.id, true, 'online');

      setTimeout(() => {
        try {
          bot.chat(`/login ${acc.mc_password}`);
          logToUI(`🔑 ${acc.mc_username} login`);

          // Friend jump - încearcă de mai multe ori
          let friendAttempts = 0;
          const tryFriend = () => {
            if (friendAttempts >= 3 || !bot.entity) return;
            try {
              bot.chat('/friend jump sabasaba3');
              friendAttempts++;
              setTimeout(tryFriend, 15000);
            } catch (e) {}
          };
          setTimeout(tryFriend, 5000);

          // Du-te la afk după 12 sec
          setTimeout(() => {
            try { bot.chat('/warp afk'); } catch (e) {}
          }, 12000);
        } catch (e) {}
      }, 7000);
    });

    bot.on('error', (err) => {
      logToUI(`❌ ${acc.mc_username}: ${err.message}`);
      if (session && session.bots[index]) session.bots[index].online = false;
      reportStatus(acc.id, false, 'error');
    });

    bot.on('end', () => {
      logToUI(`⚠️ ${acc.mc_username} deconectat`);
      if (session && session.bots[index]) session.bots[index].online = false;
      reportStatus(acc.id, false, 'offline');

      if (session) {
        setTimeout(() => {
          if (session) createBot(acc, index, totalBots);
        }, 10000);
      }
    });
  }, index * 10000);
}

ipcMain.handle('start-bots', async (_, botAccounts) => {
  if (session) return { error: 'Boții sunt deja porniți' };
  if (!botAccounts || botAccounts.length === 0) return { error: 'Niciun bot atribuit' };

  session = { bots: [], afkInterval: null, coinsInterval: null };

  botAccounts.forEach((acc, index) => createBot(acc, index, botAccounts.length));

  // AFK cycle
  session.afkInterval = setInterval(() => {
    if (!session) return;
    session.bots.forEach(b => {
      if (b && b.instance && b.instance.entity) {
        try { b.instance.chat('/spawn'); } catch (e) {}
      }
    });
    setTimeout(() => {
      if (!session) return;
      session.bots.forEach(b => {
        if (b && b.instance && b.instance.entity) {
          try { b.instance.chat('/warp afk'); } catch (e) {}
        }
      });
    }, 10000);
  }, AFK_CYCLE);

  // Returnează pentru ca renderer-ul să trimită la backend statusul
  return { success: true, totalBots: botAccounts.length };
});

ipcMain.handle('stop-bots', () => stopAllBots());

ipcMain.handle('get-online-count', () => {
  if (!session) return 0;
  return session.bots.filter(b => b && b.online).length;
});

function stopAllBots() {
  if (!session) return { success: true };
  session.bots.forEach(b => {
    if (b && b.instance) {
      try { b.instance.removeAllListeners(); b.instance.end(); } catch (e) {}
    }
  });
  if (session.afkInterval) clearInterval(session.afkInterval);
  session = null;
  return { success: true };
}
