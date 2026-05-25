// Telegram Bot Worker — Interactive agent commands via @CrosslaneAgent_bot
// Uses long-polling (getUpdates) — works on localhost without webhook setup

// Corporate SSL workaround
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const https = require('https');
const { getDb } = require('../db/connection');

const BOT_TOKEN = '8919297759:AAFezzeMyZN9NiFeL-FNrqi4WStGjGyf1mk';
const API_BASE = 'api.telegram.org';
const POLL_INTERVAL = 3000; // Check for new messages every 3 seconds

let lastUpdateId = 0;
let running = false;

function tgRequest(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const isLongPoll = method === 'getUpdates';
    const req = https.request({
      hostname: API_BASE,
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: isLongPoll ? 35000 : 15000, // Long-poll needs longer timeout
      rejectUnauthorized: false,
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch (e) { reject(new Error(`Parse error: ${chunks.slice(0, 100)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

async function sendMessage(chatId, text, opts = {}) {
  try {
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...opts,
    });
  } catch (err) {
    console.error('[telegramBot] Send error:', err.message);
  }
}

async function getUpdates() {
  try {
    const result = await tgRequest('getUpdates', {
      offset: lastUpdateId + 1,
      timeout: 25,
      allowed_updates: ['message'],
    });
    return result.result || [];
  } catch (err) {
    // Timeout is normal — Telegram long-poll returns empty after timeout
    if (err.message === 'timeout') return [];
    console.error('[telegramBot] Poll error:', err.message);
    return [];
  }
}

async function handleCommand(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ');

  try {
    const db = await getDb();

    switch (command) {
      case '/start':
      case '/yardim':
      case '/help':
        await sendMessage(chatId,
          `<b>🤖 Crosslane Agent</b>\n\n` +
          `Komutlar:\n` +
          `/durum — Dashboard istatistikleri\n` +
          `/rapor TR — Tam ekonomik rapor (US, DE, CN, JP...)\n` +
          `/lokasyon California — Eyalet/sehir bazli ihale ara\n` +
          `/ihale construction — Sektore gore ihale ara\n` +
          `/benzin — Petrol fiyati ve 2027 tahmini (Groq AI)\n` +
          `/savunma — Ulkelere gore askeri harcamalar\n` +
          `/tara — SAM.gov taraması başlat\n` +
          `/ozetle — Draft'lara AI özeti üret\n` +
          `/yardim — Bu mesaj\n\n` +
          `Agent otomatik olarak her 24 saatte bir çalışır.`
        );
        break;

      case '/durum':
      case '/stats':
        const stats = db.prepare('SELECT COUNT(*) as total FROM opportunities').get();
        const pub = db.prepare("SELECT COUNT(*) as total FROM opportunities WHERE status = 'published'").get();
        const draft = db.prepare("SELECT COUNT(*) as total FROM opportunities WHERE status = 'draft'").get();
        const leads = db.prepare('SELECT COUNT(*) as total FROM leads').get();
        const pending = db.prepare("SELECT COUNT(*) as total FROM leads WHERE verification_status = 'pending'").get();
        const logs = db.prepare("SELECT COUNT(*) as total FROM agent_logs WHERE status = 'error'").get();

        await sendMessage(chatId,
          `<b>📊 Crosslane Global — Durum</b>\n\n` +
          `<b>Fırsatlar:</b> ${stats.total} toplam (${pub.published} yayında, ${draft.draft} taslak)\n` +
          `<b>Lead'ler:</b> ${leads.total} toplam (${pending.pending} beklemede)\n` +
          `<b>Hatalar:</b> ${logs.total}\n\n` +
          `Sunucu: http://localhost:3001`
        );
        break;

      case '/tara':
      case '/scan':
        const { runSamPoll } = require('./samPoller');
        await sendMessage(chatId, '🔄 SAM.gov taraması başlatıldı...');
        const result = await runSamPoll(db);
        if (result.error) {
          await sendMessage(chatId, `❌ Tarama hatası: ${result.error}`);
        } else {
          await sendMessage(chatId,
            `✅ Tarama tamamlandı!\n` +
            `${result.ingested} yeni ihale eklendi.\n` +
            `${Math.round(result.durationMs / 1000)} saniye sürdü.`
          );
        }
        break;

      case '/ozetle':
      case '/summarize':
        const { runAiSummarization } = require('./samPoller');
        await sendMessage(chatId, '🤖 AI özetleme başlatıldı...');
        const count = await runAiSummarization(db);
        await sendMessage(chatId, `✅ ${count} adet draft özetlendi.`);
        break;

      case '/boru':
      case '/pipeline':
        const { runFullPipeline } = require('./samPoller');
        await sendMessage(chatId, '⚡ Full pipeline başlatıldı (tara + özetle)...');
        const pipeResult = await runFullPipeline();
        await sendMessage(chatId,
          `✅ Pipeline tamamlandı!\n` +
          `Taranan: ${pipeResult.poll.ingested} ihale\n` +
          `Özetlenen: ${pipeResult.summarized} draft`
        );
        break;

      case '/rapor':
      case '/ekonomi':
      case '/gostergeler': {
        await sendMessage(chatId, '📊 Ekonomik veriler getiriliyor...');
        const country = arg.toUpperCase() || 'TR';
        const { runMacroPoll } = require('./macroAgent');
        const result = await runMacroPoll(country);
        const ind = result.indicators || {};
        const fmt = (v) => v ? (v >= 1e12 ? (v/1e12).toFixed(2)+'T' : v >= 1e9 ? (v/1e9).toFixed(1)+'B' : v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v.toLocaleString()) : '—';
        const v = (code) => ind[code];

        const msg = `<b>📊 ${country} Ekonomik Rapor</b>\n\n` +
          `<b>💰 Ekonomi</b>\n` +
          `• GDP: \$${fmt(v('NY.GDP.MKTP.CD')?.latest_value)} (${v('NY.GDP.MKTP.KD.ZG')?.latest_value?.toFixed(1)||'—'}% buyume)\n` +
          `• Kisi Basi GDP: \$${fmt(v('NY.GDP.PCAP.CD')?.latest_value)}\n` +
          `• Enflasyon: ${v('FP.CPI.TOTL.ZG')?.latest_value?.toFixed(1)||'—'}%\n` +
          `• Issizlik: ${v('SL.UEM.TOTL.ZS')?.latest_value?.toFixed(1)||'—'}%\n` +
          `• Faiz: ${v('FR.INR.RINR')?.latest_value?.toFixed(1)||'—'}%\n` +
          `• Kamu Borcu: ${v('GC.DOD.TOTL.GD.ZS')?.latest_value?.toFixed(1)||'—'}% GDP\n\n` +
          `<b>🌍 Ticaret & FDI</b>\n` +
          `• Ihracat: \$${fmt(v('NE.EXP.GNFS.CD')?.latest_value)}\n` +
          `• Ithalat: \$${fmt(v('NE.IMP.GNFS.CD')?.latest_value)}\n` +
          `• FDI Girisi: \$${fmt(v('BX.KLT.DINV.CD.WD')?.latest_value)}\n\n` +
          `<b>🛡️ Savunma</b>\n` +
          `• Askeri Harcama: ${v('MS.MIL.XPND.GD.ZS')?.latest_value?.toFixed(1)||'—'}% GDP\n` +
          `• Askeri Butce: \$${fmt(v('MS.MIL.XPND.CD')?.latest_value)}\n\n` +
          `<b>👥 Demografi</b>\n` +
          `• Nufus: ${fmt(v('SP.POP.TOTL')?.latest_value)}\n` +
          `• Kentlesme: ${v('SP.URB.TOTL.IN.ZS')?.latest_value?.toFixed(1)||'—'}%\n` +
          `• Yasam Suresi: ${v('SP.DYN.LE00.IN')?.latest_value?.toFixed(1)||'—'} yil\n` +
          `• Okur Yazarlik: ${v('SE.ADT.LITR.ZS')?.latest_value?.toFixed(1)||'—'}%\n\n` +
          `<b>🔮 Tahmin 2027</b>\n` +
          `• Buyume: ${result.forecast.gdp_growth_2027 ? '%'+result.forecast.gdp_growth_2027 : '—'}\n` +
          `• Enflasyon: ${result.forecast.inflation_2027 ? '%'+result.forecast.inflation_2027 : '—'}\n\n` +
          `<i>World Bank · ECB · UN · SIPRI</i>`;

        await sendMessage(chatId, msg);
        break;
      }

      case '/emtia': {
        await sendMessage(chatId, '🛢️ Emtia fiyatlari getiriliyor...');
        const { runCommodityPoll } = require('./macroAgent');
        const data = await runCommodityPoll();
        const cats = {};
        for (const [code, info] of Object.entries(data)) {
          if (!cats[info.cat]) cats[info.cat] = [];
          cats[info.cat].push({ label: info.label, latest: info.data[0] });
        }
        let msg = '<b>🛢️ Emtia & Hammadde Fiyatlari</b>\n\n';
        for (const [cat, items] of Object.entries(cats)) {
          msg += `<b>${cat}</b>\n`;
          items.forEach(i => msg += `• ${i.label}: ${i.latest?.value?.toFixed(2) || '—'} (${i.latest?.month || ''})\n`);
          msg += '\n';
        }
        msg += '<i>Kaynak: World Bank Commodity Pink Sheet</i>';
        await sendMessage(chatId, msg);
        break;
      }

      case '/lokasyon':
      case '/location': {
        const loc = arg || '';
        if (!loc) { await sendMessage(chatId, 'Kullanim: /lokasyon California veya /lokasyon Texas'); break; }
        const db = await getDb();
        const results = db.prepare(`SELECT title, procurement_category, performance_location, budget_min, budget_max, deadline FROM opportunities WHERE status='draft' AND (performance_location LIKE ? OR location_display LIKE ?) LIMIT 12`).all('%'+loc+'%', '%'+loc+'%');
        if (results.length === 0) { await sendMessage(chatId, 'Bu lokasyonda ihale bulunamadi: ' + loc); break; }
        const cats = {}; results.forEach(r => { const c = r.procurement_category || 'Diger'; cats[c] = (cats[c]||0)+1; });
        let msg = '<b>📍 ' + loc + ' — ' + results.length + ' ihale</b>\n\n';
        msg += '<b>Sektorler:</b>\n';
        Object.entries(cats).sort((a,b)=>b[1]-a[1]).forEach(e => msg += '• ' + e[0] + ': ' + e[1] + '\n');
        msg += '\n<b>Ihaleler:</b>\n';
        results.slice(0, 8).forEach(r => {
          const b = r.budget_min ? ' $'+(r.budget_min/1e6).toFixed(1)+'M-$'+(r.budget_max/1e6).toFixed(1)+'M' : '';
          msg += '• ' + (r.title||'').substring(0, 70) + b + '\n  📍 ' + (r.performance_location||'?') + ' | 📅 ' + (r.deadline||'?') + '\n\n';
        });
        await sendMessage(chatId, msg);
        break;
      }

      case '/ihale':
      case '/tender': {
        const sector = arg || '';
        const db = await getDb();
        if (!sector) {
          const cats = db.prepare(`SELECT procurement_category, COUNT(*) as c FROM opportunities WHERE status='draft' AND procurement_category IS NOT NULL GROUP BY procurement_category ORDER BY c DESC LIMIT 10`).all();
          let msg = '<b>📋 Sektor Secin:</b>\n\n';
          cats.forEach(c => msg += '/ihale ' + (c.procurement_category || '').substring(0, 30) + '\n');
          await sendMessage(chatId, msg);
          break;
        }
        const results = db.prepare(`SELECT title, performance_location, location_display, budget_min, budget_max, deadline FROM opportunities WHERE procurement_category LIKE ? AND status='draft' LIMIT 10`).all('%'+sector+'%');
        if (results.length === 0) { await sendMessage(chatId, 'Bu sektorde ihale bulunamadi.'); break; }
        const locs = {}; results.forEach(r => { const l = r.performance_location || r.location_display || 'Belirtilmemis'; locs[l] = (locs[l]||0)+1; });
        let msg = '<b>📋 ' + sector + ' — ' + results.length + ' ihale</b>\n\n';
        msg += '<b>Lokasyonlar:</b>\n';
        Object.entries(locs).sort((a,b)=>b[1]-a[1]).slice(0, 8).forEach(e => msg += '• ' + (e[0]||'').substring(0, 40) + ': ' + e[1] + ' ihale\n');
        msg += '\n<b>Son 3:</b>\n';
        results.slice(0, 3).forEach(r => {
          const b = r.budget_min ? ' $'+(r.budget_min/1e6).toFixed(1)+'M-$'+(r.budget_max/1e6).toFixed(1)+'M' : '';
          msg += '• ' + (r.title||'').substring(0, 80) + b + '\n  📍 ' + (r.performance_location||r.location_display||'?') + ' | Son: ' + (r.deadline||'?') + '\n\n';
        });
        await sendMessage(chatId, msg);
        break;
      }

      case '/benzin':
      case '/petrol':
      case '/oil': {
        await sendMessage(chatId, '🛢️ Groq AI petrol tahmini hazırlanıyor...');
        const { fuelForecast } = require('./macroAgent');
        const fc = await fuelForecast('TR');
        if (!fc) { await sendMessage(chatId, '❌ Tahmin alınamadı.'); break; }
        let msg = '<b>🛢️ Brent Petrol Tahmini</b>\n\n';
        msg += `<b>Şu An (Mayıs 2026):</b> ~$${fc.brent_now}/bbl\n`;
        msg += `<b>2027 Sonu Tahmin:</b> $${fc.brent_2027}/bbl (${fc.change_pct > 0 ? '+' : ''}${fc.change_pct}%)\n\n`;
        if (fc.reasoning_tr) msg += `<b>Analiz:</b>\n${fc.reasoning_tr}\n\n`;
        if (fc.turkey_impact_tr) msg += `<b>Türkiye'ye Etkisi:</b>\n${fc.turkey_impact_tr}\n\n`;
        if (fc.advice_tr) msg += `💡 ${fc.advice_tr}\n\n`;
        msg += '<i>Kaynak: Groq AI (Llama 3.3 70B) — Eğitim verisine dayalı tahmin</i>';
        await sendMessage(chatId, msg);
        break;
      }

      case '/haber':
      case '/news': {
        await sendMessage(chatId, '📰 Haberler getiriliyor...');
        const { runRSSNews } = require('./macroAgent');
        const feeds = await runRSSNews();
        let msg = '<b>📰 İş Dünyası Haberleri</b>\n\n';
        for (const f of feeds) {
          if (f.items.length === 0) continue;
          msg += `<b>${f.source}:</b>\n`;
          f.items.slice(0, 3).forEach(item => {
            msg += `• ${item.title?.substring(0, 100)}\n`;
            if (item.pubDate) msg += `  ${item.pubDate}\n\n`;
          });
        }
        await sendMessage(chatId, msg || 'Haber bulunamadı.');
        break;
      }

      case '/savunma': {
        await sendMessage(chatId, '🛡️ Savunma verileri getiriliyor...');
        let msg = '<b>🛡️ Askeri Harcamalar (% GDP)</b>\n\n';
        const { runMacroPoll } = require('./macroAgent');
        for (const c of ['US','TR','DE','CN','JP','GB','KR','SA','IN']) {
          const r = await runMacroPoll(c);
          const mil = r.indicators?.['MS.MIL.XPND.GD.ZS'];
          const milUsd = r.indicators?.['MS.MIL.XPND.CD'];
          const fmt = v => v ? (v>=1e9?(v/1e9).toFixed(1)+'B':(v/1e6).toFixed(0)+'M') : '—';
          msg += `${c}: ${mil?.latest_value?.toFixed(1)||'—'}% GDP (\$${fmt(milUsd?.latest_value)})\n`;
          await new Promise(r=>setTimeout(r,600));
        }
        msg += '\n<i>Kaynak: World Bank, SIPRI</i>';
        await sendMessage(chatId, msg);
        break;
      }

      default:
        // AI fallback — send any unrecognized message to Groq
        const groqKey = process.env.GROQ_API_KEY;
        if (groqKey && text.length > 3) {
          try {
            const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqKey },
              body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                  { role: 'system', content: 'Sen Crosslane Global adli uluslararasi bir tedarik ve ihale danismanlik firmasinin AI asistanisin. ABD ve Kanada kamu ihaleleri, sirket kurma, yatirim danismanligi konularinda yardimci oluyorsun. Kisa, profesyonel, net cevaplar ver. Turkce sorulara Turkce, Ingilizce sorulara Ingilizce cevap ver. 3-4 cumleden fazla yazma.' },
                  { role: 'user', content: text }
                ],
                max_tokens: 250, temperature: 0.5,
              }),
              signal: AbortSignal.timeout(15000),
            });
            const aiData = await aiRes.json();
            const reply = aiData.choices?.[0]?.message?.content;
            if (reply) {
              await sendMessage(chatId, reply);
            } else {
              await sendMessage(chatId, 'Anlayamadim. /yardim yazarak komutlari gorebilirsiniz.');
            }
          } catch (e) {
            await sendMessage(chatId, 'AI yanit veremedi. /yardim yazarak komutlari gorebilirsiniz.');
          }
        } else {
          await sendMessage(chatId, '/yardim yazarak komutlari gorebilirsiniz.');
        }
    }
  } catch (err) {
    console.error('[telegramBot] Command error:', err);
    try {
      await sendMessage(chatId, `❌ Hata: ${err.message}`);
    } catch (e) { /* ignore */ }
  }
}

async function pollLoop() {
  running = true;
  console.log('[telegramBot] Bot started. /durum /rapor /haber /savunma /yardim');

  while (running) {
    try {
      const updates = await getUpdates();
      for (const update of updates) {
        lastUpdateId = update.update_id;
        if (update.message && update.message.text) {
          const chatId = update.message.chat.id;
          console.log(`[telegramBot] ${update.message.from?.first_name || 'User'}: ${update.message.text}`);
          // Respond in a non-blocking way
          handleCommand(update.message).catch(err =>
            console.error('[telegramBot] Handler error:', err)
          );
        }
      }
    } catch (err) {
      // Silently handle polling errors and continue
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

function startBot() {
  if (running) return;
  pollLoop().catch(err => console.error('[telegramBot] Fatal:', err));
}

function stopBot() {
  running = false;
}

module.exports = { startBot, stopBot };
