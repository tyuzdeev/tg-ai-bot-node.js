import { Telegraf } from 'telegraf';
import OpenAI from 'openai';
import 'dotenv/config';

// Проверяем, что токены точно есть
if (!process.env.TG_TOKEN || !process.env.OPENAI_API_KEY) {
    throw new Error("❌ Не найдены токены в файле .env!");
}

const bot = new Telegraf(process.env.TG_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ==========================================
// 🔥 ЖЕСТКАЯ ЧАСТЬ: ИНСТРУМЕНТЫ (TOOLS)
// Это реальные JS-функции, которые ИИ будет вызывать сам!
// ==========================================

async function fetchCryptoPrice(coin: string): Promise<string> {
    console.log(`[API CALL] Нейросеть запросила цену для: ${coin}`);
    // В реальном проекте тут будет fetch('https://api.coingecko.com/...')
    // Для примера делаем заглушку-базу:
    const db: Record<string, number> = { 
        bitcoin: 64500, 
        ethereum: 3500, 
        ton: 7.2 
    };
    
    const price = db[coin.toLowerCase()];
    if (price) {
        return JSON.stringify({ status: "success", coin, price, currency: "USD" });
    }
    return JSON.stringify({ status: "error", message: "Монета не найдена в базе" });
}

// ==========================================
// ЛОГИКА БОТА
// ==========================================

bot.on('text', async (ctx) => {
    const userMsg = ctx.message.text;
    await ctx.sendChatAction('typing');

    try {
        // 1. Отправляем сообщение ИИ и даем ему инструкцию, какими функциями он владеет
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: userMsg }],
            tools: [
                {
                    type: "function",
                    function: {
                        name: "fetchCryptoPrice",
                        description: "Узнать актуальную цену криптовалюты (bitcoin, ethereum, ton). Вызывай эту функцию, если пользователь спрашивает про курсы крипты.",
                        parameters: {
                            type: "object",
                            properties: {
                                coin: { type: "string", description: "Название монеты на английском" }
                            },
                            required: ["coin"]
                        }
                    }
                }
            ],
            tool_choice: "auto" // ИИ сам решает, вызывать ли функцию или просто ответить
        });

        const responseMessage = response.choices[0].message;

        // 2. Проверяем, решил ли ИИ использовать наш инструмент
        if (responseMessage.tool_calls) {
            const toolCall = responseMessage.tool_calls[0];
            
            if (toolCall.function.name === 'fetchCryptoPrice') {
                // Достаем аргументы, которые нейросеть сама извлекла из текста юзера!
                const args = JSON.parse(toolCall.function.arguments);
                
                // ВЫПОЛНЯЕМ НАШ JS КОД
                const apiResult = await fetchCryptoPrice(args.coin);
                
                // 3. Отправляем сырые данные из API обратно нейросети, чтобы она красиво их озвучила
                const finalResponse = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "user", content: userMsg },
                        responseMessage,
                        { role: "tool", tool_call_id: toolCall.id, content: apiResult }
                    ]
                });
                
                await ctx.reply(finalResponse.choices[0].message.content!);
            }
        } else {
            // Если функция не нужна (юзер просто сказал "Привет") - отвечаем как обычно
            await ctx.reply(responseMessage.content!);
        }

    } catch (error) {
        console.error("⚠️ Ошибка сервера:", error);
        await ctx.reply("Мои микросхемы перегрелись, попробуй позже.");
    }
});

// Плавная остановка (Best practice для Node.js)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

bot.launch();
console.log("🚀 TS AI-Agent запущен и готов к работе!");
