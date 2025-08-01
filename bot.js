import { Telegraf, Markup } from "telegraf";
import { fetchAds } from "./parser.js";
import { readFileSync, writeFileSync } from "fs";
import puppeteer from "puppeteer";

console.log(
  "BOT_TOKEN у середовищі:",
  process.env.BOT_TOKEN ? "ОК" : "Відсутній"
);

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  executablePath: process.env.CHROME_PATH || puppeteer.executablePath(),
});

const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: 180000 });

let seen = [];
let searchEnabled = true;

try {
  seen = JSON.parse(readFileSync("seen.json", "utf-8"));
} catch (e) {
  seen = [];
}

function saveSeen() {
  console.log("Збереження seen.json:", seen);
  writeFileSync("seen.json", JSON.stringify(seen.slice(0, 100), null, 2));
}

async function checkAds(ctx) {
  if (!searchEnabled) {
    if (ctx) {
      await ctx.reply(
        "🔕 Пошук оголошень вимкнено. Натисніть «🔍 Відновити пошук», щоб продовжити."
      );
    }
    return;
  }

  console.log("🔍 Перевірка нових оголошень на OLX...");

  try {
    const ads = await fetchAds(seen);
    const newAds = ads.filter((ad) => !seen.includes(ad.link));

    if (newAds.length === 0) {
      if (ctx) {
        await ctx.reply("ℹ️ Нових оголошень за останні 15 хвилин немає.");
      }
      return;
    }

    for (const ad of newAds) {
      const message = `
      🏗 *${ad.offerTitle || ad.title}*
      👤 Автор: *${ad.name || "невідомо"}*
      📍 Місто: ${ad.location || "не вказано"}
      📅 Дата розміщення: ${ad.date || "невідомо"}
      `;

      await ctx.reply(message, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔗 Перейти до оголошення", url: ad.link }],
          ],
        },
      });

      seen.unshift(ad.link);
    }

    saveSeen();

    await ctx.reply(`✅ Надіслано ${newAds.length} нових оголошень.`);
  } catch (error) {
    console.error("❌ Помилка під час перевірки оголошень:", error.message);
    if (ctx) {
      ctx.reply("❌ Виникла помилка при перевірці оголошень.");
    }
  }
}

const mainMenu = Markup.keyboard([
  ["🔍 Перевірити нові оголошення"],
  ["🛑 Зупинити пошук", "🔄 Відновити пошук"],
]).resize();

// Старт
bot.start((ctx) => {
  ctx.reply(
    `👋 Вітаю! Я бот для відстеження нових оголошень з OLX (послуги ремонту, Київ).
Натисни кнопку нижче, щоб перевірити нові оголошення.`,
    mainMenu
  );
});

bot.hears("🔍 Перевірити нові оголошення", async (ctx) => {
  await ctx.reply("⏳ Шукаю нові оголошення...");
  await checkAds(ctx);
});

bot.command("check", async (ctx) => {
  await ctx.reply("⏳ Шукаю нові оголошення...");
  await checkAds(ctx);
});

bot.telegram.setMyCommands([
  { command: "check", description: "🔍 Перевірити нові оголошення" },
]);

bot.hears("🛑 Зупинити пошук", async (ctx) => {
  searchEnabled = false;
  await ctx.reply("🛑 Пошук нових оголошень зупинено.");
});

bot.hears("🔄 Відновити пошук", async (ctx) => {
  searchEnabled = true;
  await ctx.reply(
    "🔄 Пошук відновлено. Тепер можна знову натискати «🔍 Перевірити нові оголошення»."
  );
});

bot.telegram.setMyDescription(
  "Цей бот показує нові оголошення з OLX про ремонтні послуги у Києві."
);
bot.telegram.setChatMenuButton({ type: "commands" });

bot
  .launch()
  .then(() => console.log("🤖 Бот запущено"))
  .catch((err) => console.error("❌ Помилка запуску бота:", err.message));
