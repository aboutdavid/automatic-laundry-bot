require("dotenv").config();
const { App } = require("@slack/bolt");
const puppeteer = require("puppeteer").default;
const HtmlTableToJson = require('html-table-to-json');
const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
});



(async () => {
    const browser = await puppeteer.launch();

    async function getLaundry(room) {
        const page = await browser.newPage();
        await page.goto(`https://wa.sqinsights.com/${process.env.LAUNDRY_CAMPUS}?room=${room}`);
        await page.waitForNetworkIdle()
        const tableHTML = await page.evaluate(() =>
            document.querySelector('table').outerHTML
        );
        const jsonTables = HtmlTableToJson.parse(tableHTML)
        await page.close()
        return jsonTables.results[0]
    }
    app.command("/laundry", async ({ command, body, ack, respond }) => {
        await ack()
        var blocks = []
        const rooms = process.env.LAUNDRY_ROOM.split(",");
        const emojis = {
            available: "✅",
            offline: "🫥",
            "cycle finished": "🧺➡️"
        }
        for (const room of rooms) {
            blocks.push({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": room.split(":")[0]
                }
            });
            const laundry = await getLaundry(room.split(":")[1]);
            var subBlocks = [];
            for (const machine of laundry) {
                subBlocks.push({
                    "type": "mrkdwn",
                    "text": `${emojis[machine.Status] || "❓"} Machine #${machine.Node} (${machine.Size}) is currently *${machine.Status}*`
                });
            }
            blocks.push({
                "type": "context",
                "elements": subBlocks
            });
        }
        blocks.push({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": `Legend:
✅ Available: The machine is clear and read to be used.
🫥 Offline: The machine is offline and cannot be connected to the internet.
🧺➡️ Cycle Finished: The machine is ready, but clothes need to be taken out.
💡 Protip: Clothes trapped? Unplug the machine, wait 5 minutes, and open.`
            }
        })
        respond({
            blocks
        })

    })
    app.start()
})();