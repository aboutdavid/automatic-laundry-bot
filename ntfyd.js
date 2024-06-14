(async () => {
    require("dotenv").config();

    const { createClient } = require("redis");
    const puppeteer = require("puppeteer").default;
    const HtmlTableToJson = require('html-table-to-json');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox']
    });
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
    const client = await createClient({
        url: process.env.REDIS_DATABASE,
    })
        .on("error", (err) => console.log("Redis Client Error", err))
        .connect();

    function compareDryerStatus(a1, a2) {
        var statuses = []
        a1.forEach(item1 => {
            if (item1.Machine.startsWith('Dryer')) {
                const item2 = a2.find(item => item.Node === item1.Node && item.Machine === item1.Machine);
                if (item2 && item1.Status !== item2.Status) {
                    statuses.push({
                        id: item2.Node,
                        text: `${item1.Machine} changed status: ${item1.Status}${item1["5"] == "" ? " " : ` (${item1["5"].split("\n")[0]}) `}→ ${item2.Status}${item2["5"] == "" ? " " : ` (${item2["5"].split("\n")[0]})`}`
                    })
                }
            }
        });
        return statuses
    }

    async function start() {
        if (!await client.exists("laundryStats")) {
            var oldLaundry = await getLaundry("12263")
            await client.set("laundryStats", JSON.stringify(oldLaundry))
        }
        var oldLaundry = await client.get("laundryStats")
        var newLaundry = await getLaundry("12263")
        const statuses = compareDryerStatus(newLaundry, JSON.parse(oldLaundry))
        statuses.forEach(async function (status) {
            await fetch('https://ntfy.hackclub.app/uvmlaundry', {
                method: 'POST',
                body: status.text,
                headers: {
                    'Title': 'Laundry machine update'
                }
            })

            await fetch('https://ntfy.hackclub.app/uvmlaundry'+ status.id, {
                method: 'POST',
                body: status.text,
                headers: {
                    'Title': 'Laundry machine update'
                }
            })
        })
    }
    await start()
    setInterval(start, 1000 * 15)
})();
/*
process.on("unhandledRejection", (error) => {
    console.error(error);
});*/