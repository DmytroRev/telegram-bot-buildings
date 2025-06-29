import puppeteer from "puppeteer";
import cheerio from "cheerio";
import delay from "delay";

// Масив URL з фільтром по Київській області
const urls = [
  "https://www.olx.ua/uk/uslugi/stroitelstvo-otdelka-remont/remont-pod-klyuch/kiev/?search%5Bdist%5D=30&currency=UAH",
  "https://www.olx.ua/uk/uslugi/stroitelstvo-otdelka-remont/otdelka-remont/kiev/?search%5Bdist%5D=30&search%5Border%5D=created_at:desc&currency=UAH",
];

// Перевірка, чи оголошення нове (за останні 15 хвилин)
function isRecentAd(dateStr, thresholdMinutes = 15) {
  try {
    const now = new Date();
    let adDate;

    if (dateStr.includes("Сьогодні")) {
      const timeMatch = dateStr.match(/Сьогодні в (\d{2}):(\d{2})/);
      if (!timeMatch) return true;
      const [, hours, minutes] = timeMatch;
      adDate = new Date();
      adDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    } else {
      const dateMatch = dateStr.match(/(\d{1,2}) (\w+) в (\d{2}):(\d{2})/);
      if (!dateMatch) return true;
      const [, day, month, hours, minutes] = dateMatch;
      const monthNames = {
        січня: 0,
        лютого: 1,
        березня: 2,
        квітня: 3,
        травня: 4,
        червня: 5,
        липня: 6,
        серпня: 7,
        вересня: 8,
        жовтня: 9,
        листопада: 10,
        грудня: 11,
      };
      adDate = new Date();
      adDate.setDate(parseInt(day));
      adDate.setMonth(monthNames[month.toLowerCase()]);
      adDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    }

    const diffMinutes = (now - adDate) / (1000 * 60);
    console.log(`Дата оголошення: ${dateStr}, різниця: ${diffMinutes} хвилин`);

    return diffMinutes <= thresholdMinutes;
  } catch (e) {
    console.error(`Помилка при парсингу дати "${dateStr}":`, e.message);
    return true; // Пропускаємо фільтр
  }
}

// Завантаження деталей окремого оголошення
async function fetchAdDetails(link) {
  let browser;
  try {
    console.log(`Завантаження оголошення: ${link}`);
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-web-security",
        "--disable-dev-shm-usage",
        "--window-size=1920,1080",
      ],
    });
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      Referer: "https://www.olx.ua/",
      DNT: "1",
    });
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto(link, { waitUntil: "networkidle2", timeout: 60000 });

    await page.waitForSelector("body", { timeout: 10000 }).catch(() => {});

    const data = await page.content();
    const $ = cheerio.load(data);

    console.log(
      `HTML оголошення (${link}, перші 1000 символів):`,
      data.substring(0, 1000) + "..."
    );

    const offerTitle =
      $("h4[data-testid='offer_title'].css-10ofhqw").first().text().trim() ||
      "Без заголовка";

    const name = $("div[data-testid='user-profile-user-name'] h4")
      .first()
      .text()
      .trim()
      .replace(/^Повідомлення/, "")
      .split(/(?=[A-ZА-ЯІЇ])/)[0];

    const date =
      $("span[data-cy='ad-posted-at']").text().trim() ||
      $("span.css-19yf5ek").text().trim() ||
      $("div.css-1lcz6o7 > span").text().trim() ||
      "Невідомо";

    console.log(`Деталі оголошення (${link}):`, { name, date });

    await browser.close();
    return { name, date, offerTitle };
  } catch (e) {
    console.error(
      `Помилка при завантаженні сторінки оголошення (${link}):`,
      e.message
    );
    if (browser) await browser.close();
    return { name: "Невідомо", date: "Невідомо" };
  }
}

// Основна функція для збору оголошень
export async function fetchAds(seen) {
  let ads = [];
  let browser;

  for (const url of urls) {
    try {
      console.log(`Завантаження сторінки: ${url}`);
      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-web-security",
          "--disable-dev-shm-usage",
          "--window-size=1920,1080",
        ],
      });
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );
      await page.setExtraHTTPHeaders({
        "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        Referer: "https://www.olx.ua/",
        DNT: "1",
      });
      await page.setViewport({ width: 1920, height: 1080 });

      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

      await page.waitForSelector("body", { timeout: 10000 }).catch(() => {});

      const data = await page.content();
      const $ = cheerio.load(data);

      console.log(
        `HTML сторінки (${url}, перші 1000 символів):`,
        data.substring(0, 1000) + "..."
      );

      if (data.includes("Хьюстон, у нас проблема")) {
        console.error(`Сторінка ${url} повернула помилку OLX`);
        continue;
      }

      const cards = $("div[data-cy='l-card']").length
        ? $("div[data-cy='l-card']").slice(0, 3)
        : $("div.css-1sw7q4x").slice(0, 3);

      console.log(`Знайдено карток на ${url}: ${cards.length}`);

      for (let i = 0; i < cards.length; i++) {
        const el = cards[i];
        const linkPart = $(el).find("a").attr("href") || "";

        const title = $(el).find("h6").first().text().trim() || "Без заголовка";

        // Получаем все <p> в карточке
        const pElements = $(el).find("p");
        let location = "Не вказано";
        for (let j = 0; j < pElements.length; j++) {
          const text = $(pElements[j]).text().trim();
          // Отсекаем тексты с цифрами (вероятно цена), берем первый без цифр
          if (!/\d/.test(text) && text.length > 0) {
            location = text;
            break;
          }
        }
        // fallback - если не нашли, берем первый <p>
        if (location === "Не вказано" && pElements.length > 0) {
          location = $(pElements[0]).text().trim() || "Не вказано";
        }

        const link = linkPart?.startsWith("http")
          ? linkPart
          : "https://www.olx.ua" + linkPart;

        console.log("▶ Оголошення:", { title, link, location });

        if (link) {
          if (seen.includes(link)) continue;
          const { name, date, offerTitle } = await fetchAdDetails(link);
          if (isRecentAd(date)) {
            ads.push({
              title,
              offerTitle,
              link,
              location,
              name,
              date,
              source: url,
            });
          } else {
            console.log(
              `Пропущено оголошення "${link}" (дата: ${date}, старше 15 хвилин)`
            );
          }
          await delay(2000);
        } else {
          console.log(`Пропущено оголошення (немає посилання):`, { link });
        }
      }

      await browser.close();
    } catch (error) {
      console.error(`Помилка при завантаженні сторінки ${url}:`, error.message);
      if (browser) await browser.close();
    }
  }

  console.log("Знайдені оголошення (за останні 15 хвилин):", ads);
  return ads;
}
