import { Browser, Page, Viewport } from "puppeteer-core";
import treeKill from "tree-kill";
import blockedHostsList from "./blocked-hosts";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

import { SessionExpired } from "./errors";
import {
  formatDate,
  getCleanText,
  getDurationInDays,
  getHostname,
  getLocationFromText,
  statusLog,
} from "./utils";

export interface Location {
  city: string | null;
  province: string | null;
  country: string | null;
}

interface RawProfile {
  fullName: string | null;
  title: string | null;
  location: string | null;
  photo: string | null;
  description: string | null;
  url: string;
}

export interface Profile {
  fullName: string | null;
  title: string | null;
  location: Location | null;
  photo: string | null;
  description: string | null;
  url: string;
}

interface RawExperience {
  title: string | null;
  company: string | null;
  employmentType: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  endDateIsPresent: boolean;
  description: string | null;
}

export interface Experience {
  title: string | null;
  company: string | null;
  employmentType: string | null;
  location: Location | null;
  startDate: string | null;
  endDate: string | null;
  endDateIsPresent: boolean;
  durationInDays: number | null;
  description: string | null;
}

interface RawCertification {
  name: string | null;
  issuingOrganization: string | null;
  issueDate: string | null;
  expirationDate: string | null;
}

export interface Certification {
  name: string | null;
  issuingOrganization: string | null;
  issueDate: string | null;
  expirationDate: string | null;
}

export interface Award {
  name: string | null;
  issuingOrganization: string | null;
  issueDate: string | null;
  description: string | null;
}

interface RawEducation {
  schoolName: string | null;
  degreeName: string | null;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
}

export interface Education {
  schoolName: string | null;
  degreeName: string | null;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
  durationInDays: number | null;
  description: string | null;
}

// interface RawVolunteerExperience {
//   title: string | null;
//   company: string | null;
//   startDate: string | null;
//   endDate: string | null;
//   endDateIsPresent: boolean;
//   description: string | null;
// }

export interface VolunteerExperience {
  title: string | null;
  company: string | null;
  startDate: string | null;
  endDate: string | null;
  endDateIsPresent: boolean;
  durationInDays: number | null;
  description: string | null;
}

// interface RawOrganizationAccomplishments {
//   name: string | null;
//   position: string | null;
//   startDate: string | null;
//   endDate: string | null;
//   endDateIsPresent: boolean;
//   description: string | null;
// }

export interface OrganizationAccomplishments {
  name: string | null;
  position: string | null;
  startDate: string | Date | null;
  endDate: string | Date | null;
  endDateIsPresent: boolean;
  durationInDays: number | null;
  description: string | null;
}

interface RawLanguageAccomplishments {
  language: string | null;
  proficiency: string | null;
}

export interface LanguageAccomplishments {
  language: string | null;
  proficiency: string | null;
}

interface RawProjectAccomplishments {
  name: string | null;
  startDate: string | null;
  endDate: string | null;
  endDateIsPresent: boolean;
  description: string | null;
}

export interface ProjectAccomplishments {
  name: string | null;
  startDate: string | null;
  endDate: string | null;
  endDateIsPresent: boolean;
  description: string | null;
}

export interface Skill {
  skillName: string | null;
  endorsementCount: number | null;
}

interface ScraperUserDefinedOptions {
  /**
   * The LinkedIn `li_at` session cookie value. Get this value by logging in to LinkedIn with the account you want to use for scraping.
   * Open your browser's Dev Tools and find the cookie with the name `li_at`. Use that value here.
   *
   * This script uses a known session cookie of a successful login into LinkedIn, instead of an e-mail and password to set you logged in.
   * I did this because LinkedIn has security measures by blocking login requests from unknown locations or requiring you to fill in Captcha's upon login.
   * So, if you run this from a server and try to login with an e-mail address and password, your login could be blocked.
   * By using a known session, we prevent this from happening and allows you to use this scraper on any server on any location.
   *
   * You probably need to get a new session cookie value when the scraper logs show it's not logged in anymore.
   */
  sessionCookieValue: string;
  /**
   * Set to true if you want to keep the scraper session alive. This results in faster recurring scrapes.
   * But keeps your memory usage high.
   *
   * Default: `false`
   */
  keepAlive?: boolean;
  /**
   * Set a custom user agent if you like.
   *
   * Default: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36`
   */
  userAgent?: string;
  /**
   * Use a custom timeout to set the maximum time you want to wait for the scraper
   * to do his job.
   *
   * Default: `10000` (10 seconds)
   */
  timeout?: number;
  /**
   * Start the scraper in headless mode, or not.
   *
   * Default: `true`
   */
  headless?: boolean;
  /**
   * puppeteer executable path
   *
   * Default: chromium path
   */
  executablePath?: string;
}

interface ScraperOptions {
  sessionCookieValue: string;
  keepAlive: boolean;
  userAgent: string;
  timeout: number;
  headless: boolean;
  executablePath: string | null;
  defaultViewport: Required<Viewport>;
}

async function autoScroll(page: Page) {
  await page.evaluate(() => {
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
}

export class LinkedInProfileScraper {
  readonly options: ScraperOptions = {
    sessionCookieValue: "",
    keepAlive: false,
    timeout: 10000,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36",
    headless: chromium.headless,
    executablePath: null,
    defaultViewport: chromium.defaultViewport,
  };

  private browser: Browser | null = null;
  private launched: boolean = false;

  constructor(userDefinedOptions: ScraperUserDefinedOptions) {
    const logSection = "constructing";
    const errorPrefix = "Error during setup.";

    if (!userDefinedOptions.sessionCookieValue) {
      throw new Error(
        `${errorPrefix} Option "sessionCookieValue" is required.`
      );
    }

    if (
      userDefinedOptions.sessionCookieValue &&
      typeof userDefinedOptions.sessionCookieValue !== "string"
    ) {
      throw new Error(
        `${errorPrefix} Option "sessionCookieValue" needs to be a string.`
      );
    }

    if (
      userDefinedOptions.userAgent &&
      typeof userDefinedOptions.userAgent !== "string"
    ) {
      throw new Error(
        `${errorPrefix} Option "userAgent" needs to be a string.`
      );
    }

    if (
      userDefinedOptions.keepAlive !== undefined &&
      typeof userDefinedOptions.keepAlive !== "boolean"
    ) {
      throw new Error(
        `${errorPrefix} Option "keepAlive" needs to be a boolean.`
      );
    }

    if (
      userDefinedOptions.timeout !== undefined &&
      typeof userDefinedOptions.timeout !== "number"
    ) {
      throw new Error(`${errorPrefix} Option "timeout" needs to be a number.`);
    }

    if (
      userDefinedOptions.headless !== undefined &&
      typeof userDefinedOptions.headless !== "boolean"
    ) {
      throw new Error(
        `${errorPrefix} Option "headless" needs to be a boolean.`
      );
    }

    if (
      userDefinedOptions.executablePath !== undefined &&
      typeof userDefinedOptions.executablePath !== "string"
    ) {
      throw new Error(
        `${errorPrefix} Option "executablePath" needs to be a string.`
      );
    }

    this.options = Object.assign(this.options, userDefinedOptions);

    statusLog(logSection, `Using options: ${JSON.stringify(this.options)}`);
  }

  /**
   * Method to load Puppeteer in memory so we can re-use the browser instance.
   */
  public setup = async () => {
    const logSection = "setup";

    try {
      if (!this.options.executablePath) {
        this.options.executablePath = await chromium.executablePath;
      }
      statusLog(
        logSection,
        `Launching puppeteer in the ${
          this.options.headless ? "background" : "foreground"
        }...`
      );
      this.browser = await puppeteer.launch({
        headless: this.options.headless,
        executablePath: this.options.executablePath,
        defaultViewport: this.options.defaultViewport,
        args: [
          ...chromium.args,
          // this.options.headless ? "---single-process" : "---start-maximized",
          // "--no-sandbox",
          // "--disable-gpu",
          // "--disable-setuid-sandbox",
          // "--proxy-server='direct://",
          // "--proxy-bypass-list=*",
          // "--disable-dev-shm-usage",
          // "--disable-extensions",
          // "--disable-accelerated-2d-canvas",
          // "--disable-features=site-per-process",
          // "--enable-features=NetworkService",
          // "--allow-running-insecure-content",
          // "--enable-automation",
          // "--disable-background-timer-throttling",
          // "--disable-backgrounding-occluded-windows",
          // "--disable-renderer-backgrounding",
          // "--disable-web-security",
          // "--autoplay-policy=user-gesture-required",
          // "--disable-background-networking",
          // "--disable-breakpad",
          // "--disable-client-side-phishing-detection",
          // "--disable-component-update",
          // "--disable-default-apps",
          // "--disable-domain-reliability",
          // "--disable-features=AudioServiceOutOfProcess",
          // "--disable-hang-monitor",
          // "--disable-ipc-flooding-protection",
          // "--disable-notifications",
          // "--disable-offer-store-unmasked-wallet-cards",
          // "--disable-popup-blocking",
          // "--disable-print-preview",
          // "--disable-prompt-on-repost",
          // "--disable-speech-api",
          // "--disable-sync",
          // "--disk-cache-size=33554432",
          // "--hide-scrollbars",
          // "--ignore-gpu-blacklist",
          // "--metrics-recording-only",
          // "--mute-audio",
          // "--no-default-browser-check",
          // "--no-first-run",
          // "--no-pings",
          // "--no-zygote",
          // "--password-store=basic",
          // "--use-gl=egl",
          // "--use-mock-keychain",
          "--lang=ko-KR,ko",
          "--accept-lang=ko-KR",
        ],
        timeout: this.options.timeout,
      });

      this.launched = true;
      statusLog(logSection, "Puppeteer launched!");

      await this.checkIfLoggedIn();

      statusLog(logSection, "Done!");
    } catch (err) {
      // Kill Puppeteer
      await this.close();

      statusLog(logSection, "An error occurred during setup.");

      throw err;
    }
  };

  public isPuppeteerLoaded = async () => {
    return this.launched;
  };

  /**
   * Create a Puppeteer page with some extra settings to speed up the crawling process.
   */
  private createPage = async (): Promise<Page> => {
    const logSection = "setup page";

    if (!this.browser) {
      throw new Error("Browser not set.");
    }

    // Important: Do not block "stylesheet", makes the crawler not work for LinkedIn
    const blockedResources = [
      "media",
      "font",
      "texttrack",
      "object",
      "beacon",
      "csp_report",
      "csp",
      "imageset",
    ]; // not blocking image since we want profile pics

    try {
      statusLog(logSection, `create new page`);
      let page = await this.browser.newPage();
      statusLog(logSection, `created new page`);
      // Use already open page
      // This makes sure we don't have an extra open tab consuming memory
      if (page && (await this.browser.pages()).length > 1) {
        const firstPage = (await this.browser.pages())[0];
        await firstPage.close();
        statusLog(logSection, `closed first page`);
      } else if (!page) {
        page = (await this.browser.pages())[0];
      }
      // Method to create a faster Page
      // From: https://github.com/shirshak55/scrapper-tools/blob/master/src/fastPage/index.ts#L113
      const session = await page.target().createCDPSession();
      statusLog(logSection, `created cdp session`);
      await page.setBypassCSP(true);
      statusLog(logSection, `set bypass csp`);
      await session.send("Page.enable");
      statusLog(logSection, `set page enable`);
      await session.send("Page.setWebLifecycleState", {
        state: "active",
      });

      statusLog(
        logSection,
        `Blocking the following resources: ${blockedResources.join(", ")}`
      );

      // A list of hostnames that are trackers
      // By blocking those requests we can speed up the crawling
      // This is kinda what a normal adblocker does, but really simple
      const blockedHosts = this.getBlockedHosts();
      const blockedResourcesByHost = ["script", "xhr", "fetch", "document"];

      statusLog(
        logSection,
        `Should block scripts from ${
          Object.keys(blockedHosts).length
        } unwanted hosts to speed up the crawling.`
      );

      // Block loading of resources, like images and css, we dont need that
      await page.setRequestInterception(true);

      page.on("request", (req) => {
        if (blockedResources.includes(req.resourceType())) {
          return req.abort();
        }

        const hostname = getHostname(req.url());

        // Block all script requests from certain host names
        if (
          (blockedResourcesByHost.includes(req.resourceType()) &&
            hostname &&
            blockedHosts[hostname] === true) ||
          req.url() === "https://www.linkedin.com/li/track" ||
          req
            .url()
            .includes(
              "https://www.linkedin.com/realtime/realtimeFrontendClientConnectivityTracking"
            ) ||
          req.url().includes("https://www.linkedin.com/security/csp")
        ) {
          statusLog(
            "blocked script",
            `${req.resourceType()}: ${hostname}: ${req.url()}`
          );
          return req.abort();
        }

        return req.continue();
      });
      statusLog(logSection, `set request interceptor`);
      await page.setUserAgent(this.options.userAgent);
      statusLog(logSection, `set user agent`);
      await page.setViewport({
        width: 1200,
        height: 720,
      });

      statusLog(
        logSection,
        `Setting session cookie using cookie: ${process.env.LINKEDIN_SESSION_COOKIE_VALUE}`
      );

      await page.setCookie({
        name: "li_at",
        value: this.options.sessionCookieValue,
        domain: ".www.linkedin.com",
      });

      statusLog(logSection, "Session cookie set!");

      statusLog(logSection, "Done!");

      return page;
    } catch (err) {
      // Kill Puppeteer
      await this.close();

      statusLog(logSection, "An error occurred during page setup.");
      statusLog(logSection, err.message);

      throw err;
    }
  };

  /**
   * Method to block know hosts that have some kind of tracking.
   * By blocking those hosts we speed up the crawling.
   *
   * More info: http://winhelp2002.mvps.org/hosts.htm
   */
  private getBlockedHosts = (): object => {
    const blockedHostsArray = blockedHostsList.split("\n");

    let blockedHostsObject = blockedHostsArray.reduce((prev, curr) => {
      const frags = curr.split(" ");

      if (frags.length > 1 && frags[0] === "0.0.0.0") {
        prev[frags[1].trim()] = true;
      }

      return prev;
    }, {});

    blockedHostsObject = {
      ...blockedHostsObject,
      "static.chartbeat.com": true,
      "scdn.cxense.com": true,
      "api.cxense.com": true,
      "www.googletagmanager.com": true,
      "connect.facebook.net": true,
      "platform.twitter.com": true,
      "tags.tiqcdn.com": true,
      "dev.visualwebsiteoptimizer.com": true,
      "smartlock.google.com": true,
      "cdn.embedly.com": true,
      "www.pagespeed-mod.com": true,
      "ssl.google-analytics.com": true,
      "radar.cedexis.com": true,
      "sb.scorecardresearch.com": true,
    };

    return blockedHostsObject;
  };

  /**
   * Method to complete kill any Puppeteer process still active.
   * Freeing up memory.
   */
  public close = (page?: Page): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      const loggerPrefix = "close";
      this.launched = false;
      if (page) {
        try {
          statusLog(loggerPrefix, "Closing page...");
          await page.close();
          statusLog(loggerPrefix, "Closed page!");
        } catch (err) {
          reject(err);
        }
      }

      if (this.browser) {
        try {
          statusLog(loggerPrefix, "Closing browser...");
          await this.browser.close();
          statusLog(loggerPrefix, "Closed browser!");

          const browserProcessPid = this.browser.process()?.pid;

          // Completely kill the browser process to prevent zombie processes
          // https://docs.browserless.io/blog/2019/03/13/more-observations.html#tip-2-when-you-re-done-kill-it-with-fire
          if (browserProcessPid) {
            statusLog(
              loggerPrefix,
              `Killing browser process pid: ${browserProcessPid}...`
            );

            treeKill(browserProcessPid, "SIGKILL", (err) => {
              if (err) {
                return reject(
                  `Failed to kill browser process pid: ${browserProcessPid}`
                );
              }

              statusLog(
                loggerPrefix,
                `Killed browser pid: ${browserProcessPid} Closed browser.`
              );
              resolve();
            });
          }
        } catch (err) {
          reject(err);
        }
      }

      return resolve();
    });
  };

  /**
   * Simple method to check if the session is still active.
   */
  public checkIfLoggedIn = async () => {
    const logSection = "checkIfLoggedIn";

    const page = await this.createPage();

    statusLog(logSection, "Checking if we are still logged in...");

    // Go to the login page of LinkedIn
    // If we do not get redirected and stay on /login, we are logged out
    // If we get redirect to /feed, we are logged in
    await page.goto("https://www.linkedin.com/login", {
      waitUntil: "networkidle2",
      timeout: this.options.timeout,
    });

    const url = page.url();

    const isLoggedIn = !url.endsWith("/login");

    await page.close();

    if (isLoggedIn) {
      statusLog(logSection, "All good. We are still logged in.");
    } else {
      const errorMessage =
        'Bad news, we are not logged in! Your session seems to be expired. Use your browser to login again with your LinkedIn credentials and extract the "li_at" cookie value for the "sessionCookieValue" option.';
      statusLog(logSection, errorMessage);
      throw new SessionExpired(errorMessage);
    }
  };

  /**
   * Method to scrape a user profile.
   */
  public run = async (profileUrl: string) => {
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
      // Each run has it's own page
      const page = await this.createPage();

      statusLog(
        logSection,
        `Navigating to LinkedIn profile: ${profileUrl}`,
        scraperSessionId
      );

      await page.goto(profileUrl, {
        // Use "networkidl2" here and not "domcontentloaded".
        // As with "domcontentloaded" some elements might not be loaded correctly, resulting in missing data.
        waitUntil: "domcontentloaded",
        timeout: this.options.timeout,
      });
      await page.waitForTimeout(3000);
      statusLog(logSection, "LinkedIn profile page loaded!", scraperSessionId);

      statusLog(
        logSection,
        "Getting all the LinkedIn profile data by scrolling the page to the bottom, so all the data gets loaded into the page...",
        scraperSessionId
      );

      await autoScroll(page);
      await page.waitForTimeout(1500);
      statusLog(logSection, "Parsing data...", scraperSessionId);

      statusLog(logSection, "Parsing profile data...", scraperSessionId);

      const rawUserProfileData: RawProfile = await page.evaluate(() => {
        const profileSection = document.querySelector(".pv-top-card");

        const url = window.location.href;

        const fullNameElement = profileSection?.querySelector(
          ".text-heading-xlarge.inline"
        );
        const fullName = fullNameElement?.textContent || null;

        const titleElement = profileSection?.querySelector(
          ".text-body-medium.break-words"
        );
        const title = titleElement?.textContent || null;

        const locationElement = profileSection?.querySelector(
          ".text-body-small.inline.t-black--light.break-words"
        );
        const location = locationElement?.textContent || null;

        const photoElement =
          profileSection?.querySelector(
            ".pv-top-card-profile-picture__image.pv-top-card-profile-picture__image--show"
          ) || profileSection?.querySelector(".profile-photo-edit__preview");
        const photo = photoElement?.getAttribute("src") || null;

        // const descriptionElement = document.querySelector(".pv-about-section"); // Is outside "profileSection"
        let description =
          document
            .querySelector("#about")
            ?.nextElementSibling?.nextElementSibling?.querySelector(
              'span[aria-hidden="true"]'
            )?.innerHTML || null;
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
        } as RawProfile;
      });

      // Convert the raw data to clean data using our utils
      // So we don't have to inject our util methods inside the browser context, which is too damn difficult using TypeScript
      const userProfile: Profile = {
        ...rawUserProfileData,
        fullName: getCleanText(rawUserProfileData.fullName),
        title: getCleanText(rawUserProfileData.title),
        location: rawUserProfileData.location
          ? getLocationFromText(rawUserProfileData.location)
          : null,
        description: getCleanText(rawUserProfileData.description),
      };

      statusLog(
        logSection,
        `Got user profile data: ${JSON.stringify(userProfile)}`,
        scraperSessionId
      );

      statusLog(logSection, `Parsing experiences data...`, scraperSessionId);

      const rawExperiencesData = await page.evaluate(() => {
        const experiences = document
          .querySelector("#experience")
          ?.nextElementSibling?.nextElementSibling?.querySelectorAll(
            ".pvs-entity"
          );
        let result: RawExperience[] = [];

        // Using a for loop so we can use await inside of it
        if (experiences) {
          experiences.forEach((node) => {
            let title,
              employmentType,
              company,
              description,
              startDate,
              endDate,
              endDateIsPresent,
              location;
            let data: Element | NodeListOf<Element> | null =
              node.querySelectorAll(
                'div:nth-child(1) div:first-child span[aria-hidden="true"]'
              );
            if (data.length >= 3) {
              // software engineer
              title = data.item(0).textContent;
              // company, employment type
              let temp = data.item(1).textContent;
              company = temp?.split(" · ")?.[0];
              employmentType = temp?.split(" · ")?.[1];
              // date
              temp = data.item(2).textContent;
              const startDatePart = temp?.split(" - ")[0] || null;
              startDate = startDatePart?.trim() || null;

              const endDatePart =
                temp?.split(" - ")[1]?.split(" · ")[0] || null;
              endDateIsPresent =
                endDatePart?.trim().toLowerCase().includes("present") ||
                endDatePart?.trim() === "현재" ||
                false;
              endDate =
                endDatePart && !endDateIsPresent
                  ? endDatePart.trim()
                  : "Present";
              if (data.length === 4) {
                // location
                location = data.item(3).textContent;
              }
            }
            data = node.querySelector(
              'div:nth-child(1) div:first-child span[aria-hidden="true"]'
            );
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
      /*
      const rawExperiencesData: RawExperience[] = await page.$$eval(
        "#experience-section ul > .ember-view, #experience-section .pv-entity__position-group-role-item-fading-timeline, #experience-section .pv-entity__position-group-role-item",
        (nodes) => {
          let data: RawExperience[] = [];
          let currentCompanySummary: object = {};

          // Using a for loop so we can use await inside of it
          for (const node of nodes) {
            let title,
              employmentType,
              company,
              description,
              startDate,
              endDate,
              dateRangeText,
              endDateIsPresent,
              location;
            if (
              node.querySelector(".pv-entity__company-summary-info") != null
            ) {
              const companyElement = node.querySelector(
                ".pv-entity__company-summary-info span:nth-child(2)"
              );
              currentCompanySummary["company_name"] =
                companyElement?.textContent || null;

              const descriptionElement = node.querySelector(
                ".pv-entity__description"
              );
              currentCompanySummary[""] =
                descriptionElement?.textContent || null;

              continue;
            }
            if (
              node.querySelector(
                '[data-control-name="background_details_company"]'
              ) != null
            ) {
              currentCompanySummary = {};
            }
            if (Object.keys(currentCompanySummary).length !== 0) {
              const titleElement = node.querySelector("h3 span:nth-child(2)");
              title = titleElement?.textContent || null;

              const employmentTypeElement = node.querySelector("h4");
              employmentType = employmentTypeElement?.textContent || null;

              company = currentCompanySummary["company_name"];
            } else {
              const titleElement = node.querySelector("h3");
              title = titleElement?.textContent || null;

              const employmentTypeElement = node.querySelector(
                "span.pv-entity__secondary-title"
              );
              employmentType = employmentTypeElement?.textContent || null;

              const companyElement = node.querySelector(
                ".pv-entity__secondary-title"
              );
              const companyElementClean =
                companyElement && companyElement?.querySelector("span")
                  ? companyElement?.removeChild(
                      companyElement.querySelector("span") as Node
                    ) && companyElement
                  : companyElement || null;
              company = companyElementClean?.textContent || null;
            }

            const descriptionElement = node.querySelector(
              ".pv-entity__description"
            );
            description = descriptionElement?.textContent || null;

            const dateRangeElement = node.querySelector(
              ".pv-entity__date-range span:nth-child(2)"
            );
            dateRangeText = dateRangeElement?.textContent || null;

            const startDatePart = dateRangeText?.split("–")[0] || null;
            startDate = startDatePart?.trim() || null;

            const endDatePart = dateRangeText?.split("–")[1] || null;
            endDateIsPresent =
              endDatePart?.trim().toLowerCase() === "present" || false;
            endDate =
              endDatePart && !endDateIsPresent ? endDatePart.trim() : "Present";

            const locationElement = node.querySelector(
              ".pv-entity__location span:nth-child(2)"
            );
            location = locationElement?.textContent || null;

            data.push({
              title,
              company,
              employmentType,
              location,
              startDate,
              endDate,
              endDateIsPresent,
              description,
            });
          }

          return data;
        }
      );*/

      // Convert the raw data to clean data using our utils
      // So we don't have to inject our util methods inside the browser context, which is too damn difficult using TypeScript
      const experiences: Experience[] = rawExperiencesData.map(
        (rawExperience) => {
          const startDate = formatDate(rawExperience.startDate);
          const endDate = formatDate(rawExperience.endDate) || null;
          const endDateIsPresent = rawExperience.endDateIsPresent;

          const durationInDaysWithEndDate =
            startDate && endDate && !endDateIsPresent
              ? getDurationInDays(startDate, endDate)
              : null;
          const durationInDaysForPresentDate =
            endDateIsPresent && startDate
              ? getDurationInDays(startDate, new Date())
              : null;
          const durationInDays = endDateIsPresent
            ? durationInDaysForPresentDate
            : durationInDaysWithEndDate;

          let cleanedEmploymentType = getCleanText(
            rawExperience.employmentType
          );
          if (
            cleanedEmploymentType &&
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
            ].includes(cleanedEmploymentType)
          ) {
            cleanedEmploymentType = null;
          }
          return {
            ...rawExperience,
            title: getCleanText(rawExperience.title),
            company: getCleanText(rawExperience.company),
            employmentType: cleanedEmploymentType,
            location: rawExperience?.location
              ? getLocationFromText(rawExperience.location)
              : null,
            startDate,
            endDate,
            endDateIsPresent,
            durationInDays,
            description: getCleanText(rawExperience.description),
          };
        }
      );

      statusLog(
        logSection,
        `Got experiences data: ${JSON.stringify(experiences)}`,
        scraperSessionId
      );

      statusLog(logSection, `Parsing certification data...`, scraperSessionId);

      const rawCertificationData: RawCertification[] = await page.evaluate(
        () => {
          const certifications = document
            .querySelector("#licenses_and_certifications")
            ?.nextElementSibling?.nextElementSibling?.querySelectorAll(
              ".pvs-entity"
            );

          // Note: the $$eval context is the browser context.
          // So custom methods you define in this file are not available within this $$eval.
          let result: RawCertification[] = [];
          if (certifications) {
            certifications.forEach((node) => {
              let name, issuingOrganization, issueDate, expirationDate;
              let data: Element | NodeListOf<Element> | null =
                node.querySelectorAll(
                  'div:nth-child(1) div:first-child span[aria-hidden="true"]'
                );
              if (data.length >= 3) {
                // certification name
                name = data.item(0).textContent;
                // issuing organization
                issuingOrganization = data.item(1).textContent;
                // date
                let temp = data
                  .item(2)
                  .textContent?.replace(/issued /gi, "")
                  .replace(/발행일: /gi, "");
                if (
                  temp?.includes(" · No Expiration Date") ||
                  temp?.includes("")
                ) {
                  const startDatePart = temp
                    .replace(" · No Expiration Date", "")
                    .replace(" · 만료일 없음", "");
                  issueDate = startDatePart?.trim() || null;
                  expirationDate = null;
                } else {
                  const startDatePart = temp?.split(" - ")[0];
                  issueDate = startDatePart?.trim() || null;

                  const endDatePart =
                    temp?.split(" - ")[1]?.split(" · ")[0] || null;
                  expirationDate = endDatePart?.trim();
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
        }
      );

      // Convert the raw data to clean data using our utils
      // So we don't have to inject our util methods inside the browser context, which is too damn difficult using TypeScript
      const certifications: Certification[] = rawCertificationData.map(
        (rawCertification) => {
          return {
            ...rawCertification,
            name: getCleanText(rawCertification.name),
            issuingOrganization: getCleanText(
              rawCertification.issuingOrganization
            ),
            issueDate: formatDate(rawCertification.issueDate),
            expirationDate: formatDate(rawCertification.expirationDate),
          };
        }
      );

      statusLog(
        logSection,
        `Got certification data: ${JSON.stringify(certifications)}`,
        scraperSessionId
      );

      statusLog(logSection, `Parsing award data...`, scraperSessionId);

      const rawAwardsData: Award[] = await page.evaluate(() => {
        const awards = document
          .querySelector("#honors_and_awards")
          ?.nextElementSibling?.nextElementSibling?.querySelectorAll(
            ".pvs-entity"
          );

        // Note: the $$eval context is the browser context.
        // So custom methods you define in this file are not available within this $$eval.
        let result: Award[] = [];
        if (awards) {
          awards.forEach((node) => {
            let name, issuingOrganization, issueDate, description;
            let data: Element | NodeListOf<Element> | null =
              node.querySelectorAll(
                'div:nth-child(1) div:first-child span[aria-hidden="true"]'
              );
            if (data.length >= 1) {
              // certification name
              name = data.item(0).textContent;
              if (data.length >= 2) {
                let temp = data.item(1).textContent;
                if (temp?.includes("Issued by") || temp?.includes("발행: ")) {
                  // issuing organization
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
                data = node.querySelector(
                  'div:nth-child(1) div:nth-child(1) .pvs-list__outer-container .inline-show-more-text span[aria-hidden="true"]'
                );
                if (data) {
                  description = data.innerHTML
                    .replace(/<!---->/gi, "")
                    .replace(/<br(\/)?>/gi, "\n");
                }
              } catch {}
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

      // Convert the raw data to clean data using our utils
      // So we don't have to inject our util methods inside the browser context, which is too damn difficult using TypeScript
      const awards: Award[] = rawAwardsData.map((rawAwards) => {
        return {
          ...rawAwards,
          name: getCleanText(rawAwards.name),
          issuingOrganization: getCleanText(rawAwards.issuingOrganization),
          issueDate: formatDate(rawAwards.issueDate),
          description: getCleanText(rawAwards.description),
        };
      });

      statusLog(
        logSection,
        `Got awards data: ${JSON.stringify(awards)}`,
        scraperSessionId
      );

      statusLog(logSection, `Parsing education data...`, scraperSessionId);

      const rawEducationData: RawEducation[] = await page.evaluate(() => {
        const educations = document
          .querySelector("#education")
          ?.nextElementSibling?.nextElementSibling?.querySelectorAll(
            ".pvs-entity"
          );

        // Note: the $$eval context is the browser context.
        // So custom methods you define in this file are not available within this $$eval.
        let result: RawEducation[] = [];
        for (let index = 0; index < (educations?.length || 0); index++) {
          const node = educations!.item(index);

          let data: Element | NodeListOf<Element> | null =
            node.querySelectorAll(
              'div:nth-child(1) div:first-child span[aria-hidden="true"]'
            );
          let tempElement,
            degreeName,
            fieldOfStudy,
            startDate,
            endDate,
            endDateIsPresent,
            description,
            schoolName;
          if (data.length >= 1) {
            // school name
            schoolName = data.item(0).textContent;
            // degree, major
            if (data.length >= 2) {
              tempElement = data.item(1).textContent;
              if (tempElement.includes("20") || tempElement.includes("19")) {
                // date
                const startDatePart = tempElement?.split(" - ")[0] || null;
                startDate = startDatePart?.trim() || null;

                const endDatePart =
                  tempElement?.split(" - ")[1]?.split(" · ")[0] || null;
                endDateIsPresent =
                  endDatePart?.trim().toLowerCase() === "present" ||
                  endDatePart?.trim().toLowerCase() === "현재" ||
                  false;
                endDate =
                  endDatePart && !endDateIsPresent
                    ? endDatePart.trim()
                    : "Present";
              } else {
                // field
                const regex =
                  /(.*)([[전문]?학사|[전문]?석사|박사|Bachelor's degree|Master's degree|PhD|Ph.D|Doctor's degree])/i.exec(
                    tempElement
                  );
                if (!regex) {
                  fieldOfStudy = tempElement;
                } else {
                  fieldOfStudy = regex[1];
                  degreeName = regex[2];
                }
                if (data.length >= 3) {
                  tempElement = data.item(2).textContent;
                  // date
                  const startDatePart = tempElement?.split(" - ")[0] || null;
                  startDate = startDatePart?.trim() || null;

                  const endDatePart =
                    tempElement?.split(" - ")[1]?.split(" · ")[0] || null;
                  endDateIsPresent =
                    endDatePart?.trim().toLowerCase() === "present" ||
                    endDatePart?.trim().toLowerCase() === "현재" ||
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
            data = node.querySelector(
              'div:nth-child(1) div:nth-child(1) span[aria-hidden="true"]'
            );
            if (data) {
              description = data.innerHTML
                .replace(/<!---->/gi, "")
                .replace(/<br(\/)?>/gi, "\n");
            }
          } catch {}

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

      // Convert the raw data to clean data using our utils
      // So we don't have to inject our util methods inside the browser context, which is too damn difficult using TypeScript
      const education: Education[] = rawEducationData.map((rawEducation) => {
        const startDate = formatDate(rawEducation.startDate);
        const endDate = formatDate(rawEducation.endDate);

        return {
          ...rawEducation,
          schoolName: getCleanText(rawEducation.schoolName),
          degreeName: getCleanText(rawEducation.degreeName),
          fieldOfStudy: getCleanText(rawEducation.fieldOfStudy),
          startDate,
          endDate,
          durationInDays: getDurationInDays(startDate, endDate),
        };
      });

      statusLog(
        logSection,
        `Got education data: ${JSON.stringify(education)}`,
        scraperSessionId
      );

      const rawLanguageAccomplishments: RawLanguageAccomplishments[] =
        await page.evaluate(() => {
          const languages = document
            .querySelector("#languages")
            ?.nextElementSibling?.nextElementSibling?.querySelectorAll(
              ".pvs-entity"
            );

          // Note: the $$eval context is the browser context.
          // So custom methods you define in this file are not available within this $$eval.
          let result: RawLanguageAccomplishments[] = [];
          for (let index = 0; index < (languages?.length || 0); index++) {
            const node = languages!.item(index);

            let data: Element | NodeListOf<Element> | null =
              node.querySelectorAll(
                'div:nth-child(1) div:first-child span[aria-hidden="true"]'
              );
            let language, proficiency;
            if (data.length >= 1) {
              // language name
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

      const languageAccomplishments: LanguageAccomplishments[] =
        rawLanguageAccomplishments.map((languageAccomplishment) => {
          return {
            ...languageAccomplishment,
            language: getCleanText(languageAccomplishment.language),
            proficiency: getCleanText(languageAccomplishment.proficiency),
          };
        });

      statusLog(
        logSection,
        `Parsing project accomplishments data...`,
        scraperSessionId
      );

      const rawProjectAccomplishments: RawProjectAccomplishments[] =
        await page.evaluate(() => {
          const projects = document
            .querySelector("#projects")
            ?.nextElementSibling?.nextElementSibling?.querySelectorAll(
              ".pvs-entity"
            );

          // Note: the $$eval context is the browser context.
          // So custom methods you define in this file are not available within this $$eval.
          let result: RawProjectAccomplishments[] = [];
          for (let index = 0; index < (projects?.length || 0); index++) {
            const node = projects!.item(index);

            let data: Element | NodeListOf<Element> | null =
              node.querySelectorAll(
                'div:nth-child(1) div:first-child span[aria-hidden="true"]'
              );
            let name, startDate, endDate, endDateIsPresent, description;
            if (data.length >= 1) {
              // language name
              name = data.item(0).textContent;
              if (data.length >= 2) {
                let tempElement = data.item(1).textContent;
                if (
                  tempElement?.includes("20") ||
                  tempElement?.includes("19")
                ) {
                  // date
                  const startDatePart = tempElement.split(" - ")[0] || null;
                  startDate = startDatePart?.trim() || null;

                  const endDatePart =
                    tempElement.split(" - ")[1]?.split(" · ")[0] || null;
                  endDateIsPresent =
                    endDatePart?.trim().toLowerCase() === "present" ||
                    endDatePart?.trim().toLowerCase() === "현재" ||
                    false;
                  endDate =
                    endDatePart && !endDateIsPresent
                      ? endDatePart.trim()
                      : "Present";
                }
              }
            }
            try {
              data = node.querySelector(
                'div:nth-child(1) div:nth-child(1) span[aria-hidden="true"]'
              );
              if (data) {
                description = data.innerHTML
                  .replace(/<!---->/gi, "")
                  .replace(/<br(\/)?>/gi, "\n");
              }
            } catch {}

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

      const projectAccomplishments: ProjectAccomplishments[] =
        rawProjectAccomplishments.map((projectAccomplishment) => {
          return {
            ...projectAccomplishment,
            name: getCleanText(projectAccomplishment.name),
            description: getCleanText(projectAccomplishment.description),
          };
        });

      statusLog(logSection, `Parsing skills data...`, scraperSessionId);
      const seeMoreSelector = await page.evaluate(() => {
        try {
          const seeMore = document
            .querySelector("#skills")
            ?.nextElementSibling?.nextElementSibling?.querySelector(
              "div.pvs-list__footer-wrapper a.optional-action-target-wrapper"
            );
          if (seeMore) {
            // in case of see more
            const skillsElement = document.querySelector("#skills");
            return `#${
              skillsElement!.parentElement!.id
            } .pvs-list__outer-container div.pvs-list__footer-wrapper a.optional-action-target-wrapper`;
          } else {
            return null;
          }
        } catch (error) {
          return null;
        }
      });
      let skills: Skill[];
      if (seeMoreSelector) {
        await Promise.all([
          page.waitForNavigation({
            timeout: this.options.timeout,
            waitUntil: "domcontentloaded",
          }),
          page.click(seeMoreSelector),
        ]);
        await page.waitForTimeout(2000);
        await autoScroll(page);
        await page.waitForTimeout(500);
        skills = await page.evaluate(() => {
          let skills = document
            .querySelector(".pvs-list")
            ?.querySelectorAll(
              `.pvs-entity a[data-field="skill_page_skill_topic"] span[aria-hidden="true"]`
            );
          // Note: the $$eval context is the browser context.
          // So custom methods you define in this file are not available within this $$eval such as statusLog.

          let result: Skill[] = [];
          for (let index = 0; index < (skills?.length || 0); index++) {
            result.push({
              skillName: skills!.item(index)?.textContent?.trim() || null,
              endorsementCount: 0,
            } as Skill);
          }
          return result;
        });
      } else {
        skills = await page.evaluate(() => {
          let skills = document
            .querySelector("#skills")
            ?.nextElementSibling?.nextElementSibling?.querySelectorAll(
              `.pvs-entity a[data-field="skill_card_skill_topic"] span[aria-hidden="true"]`
            );
          // Note: the $$eval context is the browser context.
          // So custom methods you define in this file are not available within this $$eval such as statusLog.

          let result: Skill[] = [];
          for (let index = 0; index < (skills?.length || 0); index++) {
            result.push({
              skillName: skills!.item(index)?.textContent?.trim() || null,
              endorsementCount: 0,
            } as Skill);
          }
          return result;
        });
      }

      statusLog(
        logSection,
        `Got skills data: ${JSON.stringify(skills)}`,
        scraperSessionId
      );

      statusLog(
        logSection,
        `Done! Returned profile details for: ${profileUrl}`,
        scraperSessionId
      );

      if (!this.options.keepAlive) {
        statusLog(logSection, "Not keeping the session alive.");

        await this.close(page);

        statusLog(logSection, "Done. Puppeteer is closed.");
      } else {
        statusLog(logSection, "Done. Puppeteer is being kept alive in memory.");

        // Only close the current page, we do not need it anymore
        await page.close();
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
    } catch (err) {
      // Kill Puppeteer
      await this.close();

      statusLog(logSection, "An error occurred during a run.");

      // Throw the error up, allowing the user to handle this error himself.
      throw err;
    }
  };
}
