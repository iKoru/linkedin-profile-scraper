"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHostname = exports.autoScroll = exports.statusLog = exports.getCleanText = exports.getLocationFromText = exports.getDurationInDays = exports.formatDate = exports.getIsCity = exports.getIsCountry = void 0;
const tslib_1 = require("tslib");
const moment_timezone_1 = tslib_1.__importDefault(require("moment-timezone"));
const i18n_iso_countries_1 = tslib_1.__importDefault(require("i18n-iso-countries"));
const all_the_cities_1 = tslib_1.__importDefault(require("all-the-cities"));
exports.getIsCountry = (text) => {
    const countriesList = Object.values(i18n_iso_countries_1.default.getNames("en"));
    const lowerCaseText = text.toLowerCase();
    if (["united states", "the netherlands"].includes(lowerCaseText)) {
        return true;
    }
    return !!countriesList.find((country) => country.toLowerCase() === lowerCaseText);
};
exports.getIsCity = (text) => {
    const lowerCaseText = text.toLowerCase();
    if (["new york"].includes(lowerCaseText)) {
        return true;
    }
    return !!all_the_cities_1.default.find((city) => city.name.toLowerCase() === lowerCaseText);
};
exports.formatDate = (date) => {
    if (date === "Present" || date === "present") {
        return moment_timezone_1.default.utc().toISOString();
    }
    return typeof date === "string" && date.includes("년")
        ? date.length < 6
            ? moment_timezone_1.default(date, "YYYY년").toISOString()
            : moment_timezone_1.default(date, "YYYY년 M월").toISOString()
        : moment_timezone_1.default(date, "MMMY").toISOString();
};
exports.getDurationInDays = (formattedStartDate, formattedEndDate) => {
    if (!formattedStartDate || !formattedEndDate)
        return null;
    return moment_timezone_1.default(formattedEndDate).diff(moment_timezone_1.default(formattedStartDate), "days") + 1;
};
exports.getLocationFromText = (text) => {
    if (!text)
        return null;
    const cleanText = text.replace(" Area", "").trim();
    const parts = cleanText.split(", ");
    let city = null;
    let province = null;
    let country = null;
    if (parts.length === 3) {
        city = parts[0];
        province = parts[1];
        country = parts[2];
        return {
            city,
            province,
            country,
        };
    }
    if (parts.length === 2) {
        if (exports.getIsCity(parts[0]) && exports.getIsCountry(parts[1])) {
            return {
                city: parts[0],
                province,
                country: parts[1],
            };
        }
        if (exports.getIsCity(parts[0]) && !exports.getIsCountry(parts[1])) {
            return {
                city: parts[0],
                province: parts[1],
                country,
            };
        }
        return {
            city,
            province: parts[0],
            country: parts[1],
        };
    }
    if (exports.getIsCountry(parts[0])) {
        return {
            city,
            province,
            country: parts[0],
        };
    }
    if (exports.getIsCity(parts[0])) {
        return {
            city: parts[0],
            province,
            country,
        };
    }
    return {
        city,
        province: parts[0],
        country,
    };
};
exports.getCleanText = (text) => {
    const regexRemoveMultipleSpaces = / +/g;
    if (!text)
        return null;
    const cleanText = text
        .replace(regexRemoveMultipleSpaces, " ")
        .replace(/(\.\.\.|…)$/, "")
        .replace(/\s*(see more|see less)\s*$/i, "")
        .replace(/\<span class="white\-space\-pre"\> \<\/span>/gi, "\n")
        .replace(/^\s*(organization name|organization date|organization position|organization description|language name|project name|project description|)\s*/i, "")
        .trim();
    return cleanText;
};
exports.statusLog = (section, message, scraperSessionId) => {
    const sessionPart = scraperSessionId ? ` (${scraperSessionId})` : "";
    const messagePart = message ? `: ${message}` : null;
    return console.log(`Scraper (${section})${sessionPart}${messagePart}`);
};
exports.autoScroll = (page) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    yield page.evaluate(() => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
        yield new Promise((resolve, reject) => {
            let totalHeight = 0;
            let distance = 500;
            let timer = setInterval(() => {
                let scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve(true);
                }
            }, 100);
        });
    }));
});
exports.getHostname = (url) => {
    return new URL(url).hostname;
};
//# sourceMappingURL=index.js.map