import puppeteer from "puppeteer";
import cheerio from "cheerio";
import delay from "delay";

// Массив URL с фильтром по Киевской области
const urls = [
  "https://www.olx.ua/uk/uslugi/stroitelstvo-otdelka-remont/remont-pod-klyuch/kiev/?search%5Bdist%5D=30&currency=UAH",
  "https://www.olx.ua/uk/uslugi/stroitelstvo-otdelka-remont/otdelka-remont/kiev/?search%5Bdist%5D=30&search%5Border%5D=created_at:desc&currency=UAH",
];

// Проверка, является ли объявление новым (за последние 15 минут) 
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
      adDate.setMonth(monthNames[month.toLowerCase()] ?? 0);
      adDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    }

    const diffMinutes = (now - adDate) / (1000 * 60);
    console.log(
      `Дата оголошення: ${dateStr}, різниця: ${diffMinutes.toFixed(2)} хвилин`
    );

    return diffMinutes <= thresholdMinutes;
  } catch (e) {
    console.error(`Помилка при парсингу дати "${dateStr}":`, e.message);
    return true; // Пропускаємо фільтр у випадку помилки
  }
}

// Получение деталей одного объявления, используя переданную страницу (page)
async function fetchAdDetails(page, link) {
  try {
    console.log(`Завантаження оголошення: ${link}`);

   for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    await page.goto(link, { waitUntil: "domcontentloaded", timeout: 90000 });
    break;
  } catch (e) {
    console.warn(`Спроба ${attempt} не вдалася для ${link}, повтор...`);
    if (attempt === 3) throw e;
  }
}

    await page.waitForSelector("body", { timeout: 10000 }).catch(() => { });

    const data = await page.content();
    const $ = cheerio.load(data);

    // console.log(`HTML оголошення (${link}, перші 1000 символів):`, data.substring(0, 1000) + "...");

    const offerTitle =
      $("div[data-testid='offer_title']").find("h4").first().text().trim() ||
      "Без заголовка";

    const name =
      $("div[data-testid='user-profile-user-name'] h4")
        .first()
        .text()
        .trim()
        .replace(/^Повідомлення/, "")
        .split(/(?=[A-ZА-ЯІЇ])/)[0] || "Невідомо";

    const date =
      $("span[data-cy='ad-posted-at']").text().trim() ||
      $("span.css-19yf5ek").text().trim() ||
      $("div.css-1lcz6o7 > span").text().trim() ||
      "Невідомо";

    console.log(`Деталі оголошення (${link}):`, { name, date });

    return { name, date, offerTitle };
  } catch (e) {
    console.error(
      `Помилка при завантаженні сторінки оголошення (${link}):`,
      e.message
    );
    return { name: "Невідомо", date: "Невідомо", offerTitle: "Без заголовка" };
  }
}

// Основная функция сбора объявлений
export async function fetchAds(seen) {
  let ads = [];

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--disable-dev-shm-usage",
      "--window-size=1920,1080",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  try {
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

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    for (const url of urls) {
      try {
        console.log(`Завантаження сторінки: ${url}`);

        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 120000,
        });

        await page.waitForSelector("body", { timeout: 10000 }).catch(() => { });

        const data = await page.content();
        const $ = cheerio.load(data);

        // console.log(`HTML сторінки (${url}, перші 1000 символів):`, data.substring(0, 1000) + "...");

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

          const title =
            $(el).find("h6").first().text().trim() || "Без заголовка";

          // Получаем все <p> в карточке для определения локации
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

          if (!link || seen.includes(link)) continue;

          const details = await fetchAdDetails(page, link);

          if (isRecentAd(details.date)) {
            ads.push({
              title,
              offerTitle: details.offerTitle || title,
              link,
              location,
              name: details.name,
              date: details.date,
              source: url,
            });
          } else {
            console.log(
              `Пропущено оголошення "${link}" (дата: ${details.date}, старше 15 хвилин)`
            );
          }

          await delay(2000); // задержка между запросами деталей
        }
      } catch (error) {
        console.error(
          `Помилка при завантаженні сторінки ${url}:`,
          error.message
        );
      }
    }
  } catch (error) {
    console.error("Помилка в основній функції fetchAds:", error.message);
  } finally {
    await browser.close();
  }

  console.log("Знайдені оголошення (за останні 15 хвилин):", ads);
  return ads;
}
