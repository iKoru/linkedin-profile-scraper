"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkedInProfileScraper = void 0;
const tslib_1 = require("tslib");
const tree_kill_1 = tslib_1.__importDefault(require("tree-kill"));
const blocked_hosts_1 = tslib_1.__importDefault(require("./blocked-hosts"));
const chromium_1 = tslib_1.__importDefault(require("@sparticuz/chromium"));
const puppeteer_core_1 = tslib_1.__importDefault(require("puppeteer-core"));
const errors_1 = require("./errors");
const utils_1 = require("./utils");
function autoScroll(page) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        yield page.evaluate(() => {
            return new Promise((resolve, reject) => {
                let totalHeight = 0;
                const distance = 500;
                let timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve(true);
                    }
                }, 100);
            });
        });
    });
}
class LinkedInProfileScraper {
    constructor(userDefinedOptions) {
        this.options = {
            sessionCookieValue: "",
            keepAlive: false,
            timeout: 10000,
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36",
            headless: chromium_1.default.headless,
            executablePath: null,
            defaultViewport: chromium_1.default.defaultViewport,
        };
        this.browser = null;
        this.launched = false;
        this.setup = () => tslib_1.__awaiter(this, void 0, void 0, function* () {
            const logSection = "setup";
            try {
                if (!this.options.executablePath) {
                    this.options.executablePath = yield chromium_1.default.executablePath;
                }
                utils_1.statusLog(logSection, `Launching puppeteer in the ${this.options.headless ? "background" : "foreground"}...`);
                this.browser = yield puppeteer_core_1.default.launch({
                    headless: this.options.headless,
                    executablePath: this.options.executablePath,
                    defaultViewport: this.options.defaultViewport,
                    args: [
                        ...chromium_1.default.args,
                        this.options.headless ? "---single-process" : "---start-maximized",
                        "--no-sandbox",
                        "--disable-gpu",
                        "--disable-setuid-sandbox",
                        "--lang=ko-KR,ko",
                    ],
                    timeout: this.options.timeout,
                });
                this.launched = true;
                utils_1.statusLog(logSection, "Puppeteer launched!");
                yield this.checkIfLoggedIn();
                utils_1.statusLog(logSection, "Done!");
            }
            catch (err) {
                yield this.close();
                utils_1.statusLog(logSection, "An error occurred during setup.");
                throw err;
            }
        });
        this.isPuppeteerLoaded = () => tslib_1.__awaiter(this, void 0, void 0, function* () {
            return this.launched;
        });
        this.createPage = () => tslib_1.__awaiter(this, void 0, void 0, function* () {
            const logSection = "setup page";
            if (!this.browser) {
                throw new Error("Browser not set.");
            }
            const blockedResources = [
                "media",
                "font",
                "texttrack",
                "object",
                "beacon",
                "csp_report",
                "csp",
                "imageset",
            ];
            try {
                const session = yield this.browser.target().createCDPSession();
                utils_1.statusLog(logSection, `created cdp session`);
                utils_1.statusLog(logSection, `set bypass csp`);
                yield session.send("Page.enable");
                utils_1.statusLog(logSection, `set page enable`);
                yield session.send("Page.setWebLifecycleState", {
                    state: "active",
                });
                utils_1.statusLog(logSection, `create new page`);
                const page = yield this.browser.newPage();
                utils_1.statusLog(logSection, `created new page`);
                yield page.setBypassCSP(true);
                const firstPage = (yield this.browser.pages())[0];
                yield firstPage.close();
                utils_1.statusLog(logSection, `closed first page`);
                utils_1.statusLog(logSection, `Blocking the following resources: ${blockedResources.join(", ")}`);
                const blockedHosts = this.getBlockedHosts();
                const blockedResourcesByHost = ["script", "xhr", "fetch", "document"];
                utils_1.statusLog(logSection, `Should block scripts from ${Object.keys(blockedHosts).length} unwanted hosts to speed up the crawling.`);
                yield page.setRequestInterception(true);
                page.on("request", (req) => {
                    if (blockedResources.includes(req.resourceType())) {
                        return req.abort();
                    }
                    const hostname = utils_1.getHostname(req.url());
                    if ((blockedResourcesByHost.includes(req.resourceType()) &&
                        hostname &&
                        blockedHosts[hostname] === true) ||
                        req.url() === "https://www.linkedin.com/li/track" ||
                        req
                            .url()
                            .includes("https://www.linkedin.com/realtime/realtimeFrontendClientConnectivityTracking") ||
                        req.url().includes("https://www.linkedin.com/security/csp")) {
                        utils_1.statusLog("blocked script", `${req.resourceType()}: ${hostname}: ${req.url()}`);
                        return req.abort();
                    }
                    return req.continue();
                });
                utils_1.statusLog(logSection, `set request interceptor`);
                yield page.setUserAgent(this.options.userAgent);
                utils_1.statusLog(logSection, `set user agent`);
                yield page.setViewport({
                    width: 1200,
                    height: 720,
                });
                utils_1.statusLog(logSection, `Setting session cookie using cookie: ${process.env.LINKEDIN_SESSION_COOKIE_VALUE}`);
                yield page.setCookie({
                    name: "li_at",
                    value: this.options.sessionCookieValue,
                    domain: ".www.linkedin.com",
                });
                utils_1.statusLog(logSection, "Session cookie set!");
                utils_1.statusLog(logSection, "Done!");
                return page;
            }
            catch (err) {
                yield this.close();
                utils_1.statusLog(logSection, "An error occurred during page setup.");
                utils_1.statusLog(logSection, err.message);
                throw err;
            }
        });
        this.getBlockedHosts = () => {
            const blockedHostsArray = blocked_hosts_1.default.split("\n");
            let blockedHostsObject = blockedHostsArray.reduce((prev, curr) => {
                const frags = curr.split(" ");
                if (frags.length > 1 && frags[0] === "0.0.0.0") {
                    prev[frags[1].trim()] = true;
                }
                return prev;
            }, {});
            blockedHostsObject = Object.assign(Object.assign({}, blockedHostsObject), { "static.chartbeat.com": true, "scdn.cxense.com": true, "api.cxense.com": true, "www.googletagmanager.com": true, "connect.facebook.net": true, "platform.twitter.com": true, "tags.tiqcdn.com": true, "dev.visualwebsiteoptimizer.com": true, "smartlock.google.com": true, "cdn.embedly.com": true, "www.pagespeed-mod.com": true, "ssl.google-analytics.com": true, "radar.cedexis.com": true, "sb.scorecardresearch.com": true });
            return blockedHostsObject;
        };
        this.close = (page) => {
            return new Promise((resolve, reject) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                var _a;
                const loggerPrefix = "close";
                this.launched = false;
                if (page) {
                    try {
                        utils_1.statusLog(loggerPrefix, "Closing page...");
                        yield page.close();
                        utils_1.statusLog(loggerPrefix, "Closed page!");
                    }
                    catch (err) {
                        reject(err);
                    }
                }
                if (this.browser) {
                    try {
                        utils_1.statusLog(loggerPrefix, "Closing browser...");
                        yield this.browser.close();
                        utils_1.statusLog(loggerPrefix, "Closed browser!");
                        const browserProcessPid = (_a = this.browser.process()) === null || _a === void 0 ? void 0 : _a.pid;
                        if (browserProcessPid) {
                            utils_1.statusLog(loggerPrefix, `Killing browser process pid: ${browserProcessPid}...`);
                            tree_kill_1.default(browserProcessPid, "SIGKILL", (err) => {
                                if (err) {
                                    return reject(`Failed to kill browser process pid: ${browserProcessPid}`);
                                }
                                utils_1.statusLog(loggerPrefix, `Killed browser pid: ${browserProcessPid} Closed browser.`);
                                resolve();
                            });
                        }
                    }
                    catch (err) {
                        reject(err);
                    }
                }
                return resolve();
            }));
        };
        this.checkIfLoggedIn = () => tslib_1.__awaiter(this, void 0, void 0, function* () {
            const logSection = "checkIfLoggedIn";
            const page = yield this.createPage();
            utils_1.statusLog(logSection, "Checking if we are still logged in...");
            yield page.goto("https://www.linkedin.com/login", {
                waitUntil: "networkidle2",
                timeout: this.options.timeout,
            });
            const url = page.url();
            const isLoggedIn = !url.endsWith("/login");
            yield page.close();
            if (isLoggedIn) {
                utils_1.statusLog(logSection, "All good. We are still logged in.");
            }
            else {
                const errorMessage = 'Bad news, we are not logged in! Your session seems to be expired. Use your browser to login again with your LinkedIn credentials and extract the "li_at" cookie value for the "sessionCookieValue" option.';
                utils_1.statusLog(logSection, errorMessage);
                throw new errors_1.SessionExpired(errorMessage);
            }
        });
        this.run = (profileUrl) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            const logSection = "run";
            const scraperSessionId = new Date().getTime();
            if (!this.browser) {
                throw new Error("Browser is not set. Please run the setup method first.");
            }
            if (!profileUrl) {
                throw new Error("No profileUrl given.");
            }
            if (!profileUrl.includes("linkedin.com/")) {
                throw new Error("The given URL to scrape is not a linkedin.com url.");
            }
            try {
                const page = yield this.createPage();
                utils_1.statusLog(logSection, `Navigating to LinkedIn profile: ${profileUrl}`, scraperSessionId);
                yield page.goto(profileUrl, {
                    waitUntil: "domcontentloaded",
                    timeout: this.options.timeout,
                });
                yield page.waitForTimeout(3000);
                utils_1.statusLog(logSection, "LinkedIn profile page loaded!", scraperSessionId);
                utils_1.statusLog(logSection, "Getting all the LinkedIn profile data by scrolling the page to the bottom, so all the data gets loaded into the page...", scraperSessionId);
                yield autoScroll(page);
                yield page.waitForTimeout(1500);
                utils_1.statusLog(logSection, "Parsing data...", scraperSessionId);
                utils_1.statusLog(logSection, "Parsing profile data...", scraperSessionId);
                const rawUserProfileData = yield page.evaluate(() => {
                    var _a, _b, _c, _d;
                    const profileSection = document.querySelector(".pv-top-card");
                    const url = window.location.href;
                    const fullNameElement = profileSection === null || profileSection === void 0 ? void 0 : profileSection.querySelector(".text-heading-xlarge.inline");
                    const fullName = (fullNameElement === null || fullNameElement === void 0 ? void 0 : fullNameElement.textContent) || null;
                    const titleElement = profileSection === null || profileSection === void 0 ? void 0 : profileSection.querySelector(".text-body-medium.break-words");
                    const title = (titleElement === null || titleElement === void 0 ? void 0 : titleElement.textContent) || null;
                    const locationElement = profileSection === null || profileSection === void 0 ? void 0 : profileSection.querySelector(".text-body-small.inline.t-black--light.break-words");
                    const location = (locationElement === null || locationElement === void 0 ? void 0 : locationElement.textContent) || null;
                    const photoElement = (profileSection === null || profileSection === void 0 ? void 0 : profileSection.querySelector(".pv-top-card-profile-picture__image.pv-top-card-profile-picture__image--show")) || (profileSection === null || profileSection === void 0 ? void 0 : profileSection.querySelector(".profile-photo-edit__preview"));
                    const photo = (photoElement === null || photoElement === void 0 ? void 0 : photoElement.getAttribute("src")) || null;
                    let description = ((_d = (_c = (_b = (_a = document
                        .querySelector("#about")) === null || _a === void 0 ? void 0 : _a.nextElementSibling) === null || _b === void 0 ? void 0 : _b.nextElementSibling) === null || _c === void 0 ? void 0 : _c.querySelector('span[aria-hidden="true"]')) === null || _d === void 0 ? void 0 : _d.innerHTML) || null;
                    if (description) {
                        description = description
                            .replace(/<!---->/gi, "")
                            .replace(/<br(\/)?>/gi, "\n");
                    }
                    return {
                        fullName,
                        title,
                        location,
                        photo,
                        description,
                        url,
                    };
                });
                const userProfile = Object.assign(Object.assign({}, rawUserProfileData), { fullName: utils_1.getCleanText(rawUserProfileData.fullName), title: utils_1.getCleanText(rawUserProfileData.title), location: rawUserProfileData.location
                        ? utils_1.getLocationFromText(rawUserProfileData.location)
                        : null, description: utils_1.getCleanText(rawUserProfileData.description) });
                utils_1.statusLog(logSection, `Got user profile data: ${JSON.stringify(userProfile)}`, scraperSessionId);
                utils_1.statusLog(logSection, `Parsing experiences data...`, scraperSessionId);
                const rawExperiencesData = yield page.evaluate(() => {
                    var _a, _b, _c;
                    const experiences = (_c = (_b = (_a = document
                        .querySelector("#experience")) === null || _a === void 0 ? void 0 : _a.nextElementSibling) === null || _b === void 0 ? void 0 : _b.nextElementSibling) === null || _c === void 0 ? void 0 : _c.querySelectorAll(".pvs-entity");
                    let result = [];
                    if (experiences) {
                        experiences.forEach((node) => {
                            var _a, _b, _c;
                            let title, employmentType, company, description, startDate, endDate, endDateIsPresent, location;
                            let data = node.querySelectorAll('div:nth-child(1) div:first-child span[aria-hidden="true"]');
                            if (data.length >= 3) {
                                title = data.item(0).textContent;
                                let temp = data.item(1).textContent;
                                company = (_a = temp === null || temp === void 0 ? void 0 : temp.split(" · ")) === null || _a === void 0 ? void 0 : _a[0];
                                employmentType = (_b = temp === null || temp === void 0 ? void 0 : temp.split(" · ")) === null || _b === void 0 ? void 0 : _b[1];
                                temp = data.item(2).textContent;
                                const startDatePart = (temp === null || temp === void 0 ? void 0 : temp.split(" - ")[0]) || null;
                                startDate = (startDatePart === null || startDatePart === void 0 ? void 0 : startDatePart.trim()) || null;
                                const endDatePart = ((_c = temp === null || temp === void 0 ? void 0 : temp.split(" - ")[1]) === null || _c === void 0 ? void 0 : _c.split(" · ")[0]) || null;
                                endDateIsPresent =
                                    (endDatePart === null || endDatePart === void 0 ? void 0 : endDatePart.trim().toLowerCase().includes("present")) ||
                                        (endDatePart === null || endDatePart === void 0 ? void 0 : endDatePart.trim()) === "현재" ||
                                        false;
                                endDate =
                                    endDatePart && !endDateIsPresent
                                        ? endDatePart.trim()
                                        : "Present";
                                if (data.length === 4) {
                                    location = data.item(3).textContent;
                                }
                            }
                            data = node.querySelector('div:nth-child(1) div:first-child span[aria-hidden="true"]');
                            if (data) {
                                description = data.innerHTML
                                    .replace(/<!---->/gi, "")
                                    .replace(/<br(\/)?>/gi, "\n");
                            }
                            result.push({
                                title,
                                company,
                                employmentType,
                                location,
                                startDate,
                                endDate,
                                endDateIsPresent,
                                description,
                            });
                        });
                    }
                    return result;
                });
                const experiences = rawExperiencesData.map((rawExperience) => {
                    const startDate = utils_1.formatDate(rawExperience.startDate);
                    const endDate = utils_1.formatDate(rawExperience.endDate) || null;
                    const endDateIsPresent = rawExperience.endDateIsPresent;
                    const durationInDaysWithEndDate = startDate && endDate && !endDateIsPresent
                        ? utils_1.getDurationInDays(startDate, endDate)
                        : null;
                    const durationInDaysForPresentDate = endDateIsPresent && startDate
                        ? utils_1.getDurationInDays(startDate, new Date())
                        : null;
                    const durationInDays = endDateIsPresent
                        ? durationInDaysForPresentDate
                        : durationInDaysWithEndDate;
                    let cleanedEmploymentType = utils_1.getCleanText(rawExperience.employmentType);
                    if (cleanedEmploymentType &&
                        ![
                            "Full-time",
                            "Part-time",
                            "Self-employed",
                            "Freelance",
                            "Contract",
                            "Seasonal",
                            "Internship",
                            "Apprenticeship",
                            "인턴",
                            "정규직",
                            "계약직",
                            "프리랜서",
                            "자영업",
                            "파트타임",
                            "시즌제",
                        ].includes(cleanedEmploymentType)) {
                        cleanedEmploymentType = null;
                    }
                    return Object.assign(Object.assign({}, rawExperience), { title: utils_1.getCleanText(rawExperience.title), company: utils_1.getCleanText(rawExperience.company), employmentType: cleanedEmploymentType, location: (rawExperience === null || rawExperience === void 0 ? void 0 : rawExperience.location) ? utils_1.getLocationFromText(rawExperience.location)
                            : null, startDate,
                        endDate,
                        endDateIsPresent,
                        durationInDays, description: utils_1.getCleanText(rawExperience.description) });
                });
                utils_1.statusLog(logSection, `Got experiences data: ${JSON.stringify(experiences)}`, scraperSessionId);
                utils_1.statusLog(logSection, `Parsing certification data...`, scraperSessionId);
                const rawCertificationData = yield page.evaluate(() => {
                    var _a, _b, _c;
                    const certifications = (_c = (_b = (_a = document
                        .querySelector("#licenses_and_certifications")) === null || _a === void 0 ? void 0 : _a.nextElementSibling) === null || _b === void 0 ? void 0 : _b.nextElementSibling) === null || _c === void 0 ? void 0 : _c.querySelectorAll(".pvs-entity");
                    let result = [];
                    if (certifications) {
                        certifications.forEach((node) => {
                            var _a, _b;
                            let name, issuingOrganization, issueDate, expirationDate;
                            let data = node.querySelectorAll('div:nth-child(1) div:first-child span[aria-hidden="true"]');
                            if (data.length >= 3) {
                                name = data.item(0).textContent;
                                issuingOrganization = data.item(1).textContent;
                                let temp = (_a = data
                                    .item(2)
                                    .textContent) === null || _a === void 0 ? void 0 : _a.replace(/issued /gi, "").replace(/발행일: /gi, "");
                                if ((temp === null || temp === void 0 ? void 0 : temp.includes(" · No Expiration Date")) || (temp === null || temp === void 0 ? void 0 : temp.includes(""))) {
                                    const startDatePart = temp
                                        .replace(" · No Expiration Date", "")
                                        .replace(" · 만료일 없음", "");
                                    issueDate = (startDatePart === null || startDatePart === void 0 ? void 0 : startDatePart.trim()) || null;
                                    expirationDate = null;
                                }
                                else {
                                    const startDatePart = temp === null || temp === void 0 ? void 0 : temp.split(" - ")[0];
                                    issueDate = (startDatePart === null || startDatePart === void 0 ? void 0 : startDatePart.trim()) || null;
                                    const endDatePart = ((_b = temp === null || temp === void 0 ? void 0 : temp.split(" - ")[1]) === null || _b === void 0 ? void 0 : _b.split(" · ")[0]) || null;
                                    expirationDate = endDatePart === null || endDatePart === void 0 ? void 0 : endDatePart.trim();
                                }
                            }
                            result.push({
                                name,
                                issueDate,
                                issuingOrganization,
                                expirationDate,
                            });
                        });
                    }
                    return result;
                });
                const certifications = rawCertificationData.map((rawCertification) => {
                    return Object.assign(Object.assign({}, rawCertification), { name: utils_1.getCleanText(rawCertification.name), issuingOrganization: utils_1.getCleanText(rawCertification.issuingOrganization), issueDate: utils_1.formatDate(rawCertification.issueDate), expirationDate: utils_1.formatDate(rawCertification.expirationDate) });
                });
                utils_1.statusLog(logSection, `Got certification data: ${JSON.stringify(certifications)}`, scraperSessionId);
                utils_1.statusLog(logSection, `Parsing award data...`, scraperSessionId);
                const rawAwardsData = yield page.evaluate(() => {
                    var _a, _b, _c;
                    const awards = (_c = (_b = (_a = document
                        .querySelector("#honors_and_awards")) === null || _a === void 0 ? void 0 : _a.nextElementSibling) === null || _b === void 0 ? void 0 : _b.nextElementSibling) === null || _c === void 0 ? void 0 : _c.querySelectorAll(".pvs-entity");
                    let result = [];
                    if (awards) {
                        awards.forEach((node) => {
                            let name, issuingOrganization, issueDate, description;
                            let data = node.querySelectorAll('div:nth-child(1) div:first-child span[aria-hidden="true"]');
                            if (data.length >= 1) {
                                name = data.item(0).textContent;
                                if (data.length >= 2) {
                                    let temp = data.item(1).textContent;
                                    if ((temp === null || temp === void 0 ? void 0 : temp.includes("Issued by")) || (temp === null || temp === void 0 ? void 0 : temp.includes("발행: "))) {
                                        issuingOrganization = temp
                                            .replace(/Issued by /gi, "")
                                            .replace(/발행: /gi, "");
                                        if (issuingOrganization.includes(" · ")) {
                                            let parse = issuingOrganization.split(" · ");
                                            issuingOrganization = parse[0];
                                            issueDate = parse[1];
                                        }
                                    }
                                }
                                try {
                                    data = node.querySelector('div:nth-child(1) div:nth-child(1) .pvs-list__outer-container .inline-show-more-text span[aria-hidden="true"]');
                                    if (data) {
                                        description = data.innerHTML
                                            .replace(/<!---->/gi, "")
                                            .replace(/<br(\/)?>/gi, "\n");
                                    }
                                }
                                catch (_a) { }
                            }
                            result.push({
                                name,
                                issueDate,
                                issuingOrganization,
                                description,
                            });
                        });
                    }
                    return result;
                });
                const awards = rawAwardsData.map((rawAwards) => {
                    return Object.assign(Object.assign({}, rawAwards), { name: utils_1.getCleanText(rawAwards.name), issuingOrganization: utils_1.getCleanText(rawAwards.issuingOrganization), issueDate: utils_1.formatDate(rawAwards.issueDate), description: utils_1.getCleanText(rawAwards.description) });
                });
                utils_1.statusLog(logSection, `Got awards data: ${JSON.stringify(awards)}`, scraperSessionId);
                utils_1.statusLog(logSection, `Parsing education data...`, scraperSessionId);
                const rawEducationData = yield page.evaluate(() => {
                    var _a, _b, _c, _d, _e;
                    const educations = (_c = (_b = (_a = document
                        .querySelector("#education")) === null || _a === void 0 ? void 0 : _a.nextElementSibling) === null || _b === void 0 ? void 0 : _b.nextElementSibling) === null || _c === void 0 ? void 0 : _c.querySelectorAll(".pvs-entity");
                    let result = [];
                    for (let index = 0; index < ((educations === null || educations === void 0 ? void 0 : educations.length) || 0); index++) {
                        const node = educations.item(index);
                        let data = node.querySelectorAll('div:nth-child(1) div:first-child span[aria-hidden="true"]');
                        let tempElement, degreeName, fieldOfStudy, startDate, endDate, endDateIsPresent, description, schoolName;
                        if (data.length >= 1) {
                            schoolName = data.item(0).textContent;
                            if (data.length >= 2) {
                                tempElement = data.item(1).textContent;
                                if (tempElement.includes("20") || tempElement.includes("19")) {
                                    const startDatePart = (tempElement === null || tempElement === void 0 ? void 0 : tempElement.split(" - ")[0]) || null;
                                    startDate = (startDatePart === null || startDatePart === void 0 ? void 0 : startDatePart.trim()) || null;
                                    const endDatePart = ((_d = tempElement === null || tempElement === void 0 ? void 0 : tempElement.split(" - ")[1]) === null || _d === void 0 ? void 0 : _d.split(" · ")[0]) || null;
                                    endDateIsPresent =
                                        (endDatePart === null || endDatePart === void 0 ? void 0 : endDatePart.trim().toLowerCase()) === "present" ||
                                            (endDatePart === null || endDatePart === void 0 ? void 0 : endDatePart.trim().toLowerCase()) === "현재" ||
                                            false;
                                    endDate =
                                        endDatePart && !endDateIsPresent
                                            ? endDatePart.trim()
                                            : "Present";
                                }
                                else {
                                    const regex = /(.*)([[전문]?학사|[전문]?석사|박사|Bachelor's degree|Master's degree|PhD|Ph.D|Doctor's degree])/i.exec(tempElement);
                                    if (!regex) {
                                        fieldOfStudy = tempElement;
                                    }
                                    else {
                                        fieldOfStudy = regex[1];
                                        degreeName = regex[2];
                                    }
                                    if (data.length >= 3) {
                                        tempElement = data.item(2).textContent;
                                        const startDatePart = (tempElement === null || tempElement === void 0 ? void 0 : tempElement.split(" - ")[0]) || null;
                                        startDate = (startDatePart === null || startDatePart === void 0 ? void 0 : startDatePart.trim()) || null;
                                        const endDatePart = ((_e = tempElement === null || tempElement === void 0 ? void 0 : tempElement.split(" - ")[1]) === null || _e === void 0 ? void 0 : _e.split(" · ")[0]) || null;
                                        endDateIsPresent =
                                            (endDatePart === null || endDatePart === void 0 ? void 0 : endDatePart.trim().toLowerCase()) === "present" ||
                                                (endDatePart === null || endDatePart === void 0 ? void 0 : endDatePart.trim().toLowerCase()) === "현재" ||
                                                false;
                                        endDate =
                                            endDatePart && !endDateIsPresent
                                                ? endDatePart.trim()
                                                : "Present";
                                    }
                                }
                            }
                        }
                        try {
                            data = node.querySelector('div:nth-child(1) div:nth-child(1) span[aria-hidden="true"]');
                            if (data) {
                                description = data.innerHTML
                                    .replace(/<!---->/gi, "")
                                    .replace(/<br(\/)?>/gi, "\n");
                            }
                        }
                        catch (_f) { }
                        result.push({
                            schoolName,
                            degreeName,
                            fieldOfStudy,
                            startDate,
                            endDate,
                            description,
                        });
                    }
                    return result;
                });
                const education = rawEducationData.map((rawEducation) => {
                    const startDate = utils_1.formatDate(rawEducation.startDate);
                    const endDate = utils_1.formatDate(rawEducation.endDate);
                    return Object.assign(Object.assign({}, rawEducation), { schoolName: utils_1.getCleanText(rawEducation.schoolName), degreeName: utils_1.getCleanText(rawEducation.degreeName), fieldOfStudy: utils_1.getCleanText(rawEducation.fieldOfStudy), startDate,
                        endDate, durationInDays: utils_1.getDurationInDays(startDate, endDate) });
                });
                utils_1.statusLog(logSection, `Got education data: ${JSON.stringify(education)}`, scraperSessionId);
                const rawLanguageAccomplishments = yield page.evaluate(() => {
                    var _a, _b, _c;
                    const languages = (_c = (_b = (_a = document
                        .querySelector("#languages")) === null || _a === void 0 ? void 0 : _a.nextElementSibling) === null || _b === void 0 ? void 0 : _b.nextElementSibling) === null || _c === void 0 ? void 0 : _c.querySelectorAll(".pvs-entity");
                    let result = [];
                    for (let index = 0; index < ((languages === null || languages === void 0 ? void 0 : languages.length) || 0); index++) {
                        const node = languages.item(index);
                        let data = node.querySelectorAll('div:nth-child(1) div:first-child span[aria-hidden="true"]');
                        let language, proficiency;
                        if (data.length >= 1) {
                            language = data.item(0).textContent;
                            if (data.length >= 2) {
                                proficiency = data.item(1).textContent;
                            }
                        }
                        result.push({
                            language,
                            proficiency,
                        });
                    }
                    return result;
                });
                const languageAccomplishments = rawLanguageAccomplishments.map((languageAccomplishment) => {
                    return Object.assign(Object.assign({}, languageAccomplishment), { language: utils_1.getCleanText(languageAccomplishment.language), proficiency: utils_1.getCleanText(languageAccomplishment.proficiency) });
                });
                utils_1.statusLog(logSection, `Parsing project accomplishments data...`, scraperSessionId);
                const rawProjectAccomplishments = yield page.evaluate(() => {
                    var _a, _b, _c, _d;
                    const projects = (_c = (_b = (_a = document
                        .querySelector("#projects")) === null || _a === void 0 ? void 0 : _a.nextElementSibling) === null || _b === void 0 ? void 0 : _b.nextElementSibling) === null || _c === void 0 ? void 0 : _c.querySelectorAll(".pvs-entity");
                    let result = [];
                    for (let index = 0; index < ((projects === null || projects === void 0 ? void 0 : projects.length) || 0); index++) {
                        const node = projects.item(index);
                        let data = node.querySelectorAll('div:nth-child(1) div:first-child span[aria-hidden="true"]');
                        let name, startDate, endDate, endDateIsPresent, description;
                        if (data.length >= 1) {
                            name = data.item(0).textContent;
                            if (data.length >= 2) {
                                let tempElement = data.item(1).textContent;
                                if ((tempElement === null || tempElement === void 0 ? void 0 : tempElement.includes("20")) || (tempElement === null || tempElement === void 0 ? void 0 : tempElement.includes("19"))) {
                                    const startDatePart = tempElement.split(" - ")[0] || null;
                                    startDate = (startDatePart === null || startDatePart === void 0 ? void 0 : startDatePart.trim()) || null;
                                    const endDatePart = ((_d = tempElement.split(" - ")[1]) === null || _d === void 0 ? void 0 : _d.split(" · ")[0]) || null;
                                    endDateIsPresent =
                                        (endDatePart === null || endDatePart === void 0 ? void 0 : endDatePart.trim().toLowerCase()) === "present" ||
                                            (endDatePart === null || endDatePart === void 0 ? void 0 : endDatePart.trim().toLowerCase()) === "현재" ||
                                            false;
                                    endDate =
                                        endDatePart && !endDateIsPresent
                                            ? endDatePart.trim()
                                            : "Present";
                                }
                            }
                        }
                        try {
                            data = node.querySelector('div:nth-child(1) div:nth-child(1) span[aria-hidden="true"]');
                            if (data) {
                                description = data.innerHTML
                                    .replace(/<!---->/gi, "")
                                    .replace(/<br(\/)?>/gi, "\n");
                            }
                        }
                        catch (_e) { }
                        result.push({
                            name,
                            startDate,
                            endDate,
                            endDateIsPresent,
                            description,
                        });
                    }
                    return result;
                });
                const projectAccomplishments = rawProjectAccomplishments.map((projectAccomplishment) => {
                    return Object.assign(Object.assign({}, projectAccomplishment), { name: utils_1.getCleanText(projectAccomplishment.name), description: utils_1.getCleanText(projectAccomplishment.description) });
                });
                utils_1.statusLog(logSection, `Parsing skills data...`, scraperSessionId);
                const seeMoreSelector = yield page.evaluate(() => {
                    var _a, _b, _c;
                    try {
                        const seeMore = (_c = (_b = (_a = document
                            .querySelector("#skills")) === null || _a === void 0 ? void 0 : _a.nextElementSibling) === null || _b === void 0 ? void 0 : _b.nextElementSibling) === null || _c === void 0 ? void 0 : _c.querySelector("div.pvs-list__footer-wrapper a.optional-action-target-wrapper");
                        if (seeMore) {
                            const skillsElement = document.querySelector("#skills");
                            return `#${skillsElement.parentElement.id} .pvs-list__outer-container div.pvs-list__footer-wrapper a.optional-action-target-wrapper`;
                        }
                        else {
                            return null;
                        }
                    }
                    catch (error) {
                        return null;
                    }
                });
                let skills;
                if (seeMoreSelector) {
                    yield Promise.all([
                        page.waitForNavigation({
                            timeout: this.options.timeout,
                            waitUntil: "domcontentloaded",
                        }),
                        page.click(seeMoreSelector),
                    ]);
                    yield page.waitForTimeout(2000);
                    yield autoScroll(page);
                    yield page.waitForTimeout(500);
                    skills = yield page.evaluate(() => {
                        var _a, _b, _c;
                        let skills = (_a = document
                            .querySelector(".pvs-list")) === null || _a === void 0 ? void 0 : _a.querySelectorAll(`.pvs-entity a[data-field="skill_page_skill_topic"] span[aria-hidden="true"]`);
                        let result = [];
                        for (let index = 0; index < ((skills === null || skills === void 0 ? void 0 : skills.length) || 0); index++) {
                            result.push({
                                skillName: ((_c = (_b = skills.item(index)) === null || _b === void 0 ? void 0 : _b.textContent) === null || _c === void 0 ? void 0 : _c.trim()) || null,
                                endorsementCount: 0,
                            });
                        }
                        return result;
                    });
                }
                else {
                    skills = yield page.evaluate(() => {
                        var _a, _b, _c, _d, _e;
                        let skills = (_c = (_b = (_a = document
                            .querySelector("#skills")) === null || _a === void 0 ? void 0 : _a.nextElementSibling) === null || _b === void 0 ? void 0 : _b.nextElementSibling) === null || _c === void 0 ? void 0 : _c.querySelectorAll(`.pvs-entity a[data-field="skill_card_skill_topic"] span[aria-hidden="true"]`);
                        let result = [];
                        for (let index = 0; index < ((skills === null || skills === void 0 ? void 0 : skills.length) || 0); index++) {
                            result.push({
                                skillName: ((_e = (_d = skills.item(index)) === null || _d === void 0 ? void 0 : _d.textContent) === null || _e === void 0 ? void 0 : _e.trim()) || null,
                                endorsementCount: 0,
                            });
                        }
                        return result;
                    });
                }
                utils_1.statusLog(logSection, `Got skills data: ${JSON.stringify(skills)}`, scraperSessionId);
                utils_1.statusLog(logSection, `Done! Returned profile details for: ${profileUrl}`, scraperSessionId);
                if (!this.options.keepAlive) {
                    utils_1.statusLog(logSection, "Not keeping the session alive.");
                    yield this.close(page);
                    utils_1.statusLog(logSection, "Done. Puppeteer is closed.");
                }
                else {
                    utils_1.statusLog(logSection, "Done. Puppeteer is being kept alive in memory.");
                    yield page.close();
                }
                return {
                    userProfile,
                    experiences,
                    certifications,
                    education,
                    volunteerExperiences: [],
                    skills,
                    organizationAccomplishments: [],
                    languageAccomplishments,
                    projectAccomplishments,
                    awards,
                };
            }
            catch (err) {
                yield this.close();
                utils_1.statusLog(logSection, "An error occurred during a run.");
                throw err;
            }
        });
        const logSection = "constructing";
        const errorPrefix = "Error during setup.";
        if (!userDefinedOptions.sessionCookieValue) {
            throw new Error(`${errorPrefix} Option "sessionCookieValue" is required.`);
        }
        if (userDefinedOptions.sessionCookieValue &&
            typeof userDefinedOptions.sessionCookieValue !== "string") {
            throw new Error(`${errorPrefix} Option "sessionCookieValue" needs to be a string.`);
        }
        if (userDefinedOptions.userAgent &&
            typeof userDefinedOptions.userAgent !== "string") {
            throw new Error(`${errorPrefix} Option "userAgent" needs to be a string.`);
        }
        if (userDefinedOptions.keepAlive !== undefined &&
            typeof userDefinedOptions.keepAlive !== "boolean") {
            throw new Error(`${errorPrefix} Option "keepAlive" needs to be a boolean.`);
        }
        if (userDefinedOptions.timeout !== undefined &&
            typeof userDefinedOptions.timeout !== "number") {
            throw new Error(`${errorPrefix} Option "timeout" needs to be a number.`);
        }
        if (userDefinedOptions.headless !== undefined &&
            typeof userDefinedOptions.headless !== "boolean") {
            throw new Error(`${errorPrefix} Option "headless" needs to be a boolean.`);
        }
        if (userDefinedOptions.executablePath !== undefined &&
            typeof userDefinedOptions.executablePath !== "string") {
            throw new Error(`${errorPrefix} Option "executablePath" needs to be a string.`);
        }
        this.options = Object.assign(this.options, userDefinedOptions);
        utils_1.statusLog(logSection, `Using options: ${JSON.stringify(this.options)}`);
    }
}
exports.LinkedInProfileScraper = LinkedInProfileScraper;
//# sourceMappingURL=index.js.map