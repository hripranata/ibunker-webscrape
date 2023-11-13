const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config()
const puppeteer = require('puppeteer');

console.log(process.env.NODE_ENV);
console.log(process.env.CLIENT_ORIGIN_PROD);
app.use(cors({
    credentials:true,
    origin: [process.env.NODE_ENV !== 'production' ?process.env.CLIENT_ORIGIN_DEV : process.env.CLIENT_ORIGIN_PROD]
    }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const port = process.env.APP_PORT || 3000;

const date_now = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    let mm = today.getMonth() + 1; // Months start at 0!
    let dd = today.getDate();

    if (dd < 10) dd = '0' + dd;
    if (mm < 10) mm = '0' + mm;

    const formattedToday = yyyy + '/' + mm + '/' + dd;
    return formattedToday
}

app.post('/api/ibunker', (req, res) => {
    const {vessel, date} = req.body
    puppeteer.launch({
        args: [
          "--disable-setuid-sandbox",
          "--no-sandbox",
          "--single-process",
          "--no-zygote",
        ],
        executablePath:
          process.env.NODE_ENV === "production"
            ? process.env.PUPPETEER_EXECUTABLE_PATH
            : puppeteer.executablePath(),
    }).then(async function(browser) {
        const start_date = date
        const end_date = date_now()
        const page = await browser.newPage();
        await page.goto(`https://ibunker.itj.web.id/get-antrian.php?tglawal=${start_date}&&tglakhir=${end_date}`, { waitUntil: 'networkidle0', })

        const vessels = await page.evaluate((vessel) => {
            function findVessel(el){
                return vessel.toUpperCase() === el.spob
            }
            function vessel_detail(dt) {
                return {
                    tongkang: dt[1],
                    antrian: dt[0],
                    status: dt[2],
                    produk: dt[3].split(" - ",3)[0],
                    lo_volume: dt[3].split(" - ",3)[1],
                    waktu_pendaftaran: dt[5]
                }
            }
            // const vsl = Array.from(document.querySelectorAll('table tr td a')).map(el => el.innerHTML).filter(findVessel);
            const vsl = Array.from(document.querySelectorAll('table tr td a'))
            .map(el => ({
                spob: el.innerHTML ,
                link: el.href, 
                detail: vessel_detail(el.closest('tr').innerText.split("\t",6))
            }))
            .filter(findVessel)
            
            return vsl;
        }, vessel)

        
        for (let i = 0; i < vessels.length; i++) {
            
            const page2 = await browser.newPage();
            await page2.goto(vessels[i].link , { waitUntil: 'networkidle0', });
            const data2 = await page2.evaluate(() => {
                // const detail = Array.from(document.querySelectorAll('table tr')).slice(0,4).map(el => el.innerText.split("\t",5).slice(2).toString())
                const lo_number = Array.from(document.querySelectorAll('table tr')).slice(9).map(el => el.innerText.split("\t",5)).map(el => ({lo_number:el[0] , qty:el[2]}))
                // return {detail: detail, lo_number: lo_number};
                return lo_number;
            })
            // vessels[i].detail = data2.detail;
            vessels[i].lo_number = data2;

            await page2.close()
            
        }

        await browser.close();

        const vessels_queue = vessels;
        res.json({
            vessels_queue: vessels_queue
        });
    }).catch(e => {
        console.error(e);
        res.send(`Something went wrong while running Puppeteer: ${e}`);
    })
})

app.get('/api', (req, res) => {
    console.log("Test Connection...")
    res.json({
        success: true
    });
})
app.get('*', function(req, res){
    res.status(404).json({
        success: false,
        error: "Invalid request link!"
    })
})

app.listen(port, () => {
    console.log(`Server is running in port ${port}`);
});