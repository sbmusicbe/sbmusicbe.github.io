import { GarminConnect } from 'garmin-connect';

// Kept at module scope so a warm serverless instance can reuse the logged-in
// session instead of hitting Garmin's login endpoint on every request.
let clientPromise = null;

async function login() {
  const gc = new GarminConnect({
    username: process.env.GARMIN_EMAIL,
    password: process.env.GARMIN_PASSWORD,
  });

  // Garmin often challenges logins from cloud/datacenter IPs (like Vercel's)
  // with a CAPTCHA/MFA step this library can't complete. If GARMIN_TOKENS is
  // set (produced once locally via scripts/garmin-login.js, see README), reuse
  // that session instead of hitting the login endpoint at all; the OAuth2
  // token auto-refreshes off the OAuth1 token as needed.
  if (process.env.GARMIN_TOKENS) {
    const { oauth1, oauth2 } = JSON.parse(process.env.GARMIN_TOKENS);
    gc.loadToken(oauth1, oauth2);
  } else {
    await gc.login();
  }

  return gc;
}

async function getClient() {
  if (!clientPromise) {
    clientPromise = login().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

// Garmin sessions expire; if a call fails, force a fresh login and retry once.
async function withClient(fn) {
  const gc = await getClient();
  try {
    return await fn(gc);
  } catch (err) {
    clientPromise = null;
    const freshClient = await getClient();
    return fn(freshClient);
  }
}

async function safe(label, fn) {
  try {
    return await fn();
  } catch (err) {
    return { unavailable: true, reason: `Could not load ${label}: ${err?.message || 'unknown error'}` };
  }
}

function pickProfile(profile) {
  if (!profile || profile.unavailable) return profile;
  return {
    displayName: profile.displayName || profile.userName,
    fullName: profile.fullName,
  };
}

function summarizeSleep(sleep) {
  if (!sleep || sleep.unavailable) return sleep;
  const d = sleep.dailySleepDTO || {};
  return {
    calendarDate: d.calendarDate,
    totalSleepSeconds: d.sleepTimeSeconds,
    deepSleepSeconds: d.deepSleepSeconds,
    lightSleepSeconds: d.lightSleepSeconds,
    remSleepSeconds: d.remSleepSeconds,
    awakeSeconds: d.awakeSleepSeconds,
    restlessMomentsCount: sleep.restlessMomentsCount,
  };
}

function summarizeHeartRate(hr) {
  if (!hr || hr.unavailable) return hr;
  return {
    restingHeartRate: hr.restingHeartRate,
    minHeartRate: hr.minHeartRate,
    maxHeartRate: hr.maxHeartRate,
    lastSevenDaysAvgRestingHeartRate: hr.lastSevenDaysAvgRestingHeartRate,
  };
}

function summarizeActivities(activities) {
  if (!Array.isArray(activities)) return activities;
  return activities.slice(0, 10).map((a) => ({
    name: a.activityName,
    type: a.activityType?.typeKey,
    startTime: a.startTimeLocal,
    durationMin: typeof a.duration === 'number' ? Math.round(a.duration / 60) : undefined,
    distanceKm: typeof a.distance === 'number' ? Number((a.distance / 1000).toFixed(2)) : undefined,
    calories: a.calories,
    avgHeartRate: a.averageHR,
    maxHeartRate: a.maxHR,
    aerobicTrainingEffect: a.aerobicTrainingEffect,
    anaerobicTrainingEffect: a.anaerobicTrainingEffect,
  }));
}

// Pulls a compact snapshot of today's Garmin data. Kept intentionally small
// (not the full raw API responses) so it fits cheaply into the LLM prompt.
export async function getGarminContext() {
  const today = new Date();

  const [profile, steps, sleep, sleepDuration, heartRate, activities, weightLbs, hydrationOz] = await Promise.all([
    withClient((gc) => safe('profile', () => gc.getUserProfile())),
    withClient((gc) => safe('today\'s steps', () => gc.getSteps(today))),
    withClient((gc) => safe('sleep data', () => gc.getSleepData(today))),
    withClient((gc) => safe('sleep duration', () => gc.getSleepDuration(today))),
    withClient((gc) => safe('heart rate', () => gc.getHeartRate(today))),
    withClient((gc) => safe('recent activities', () => gc.getActivities(0, 10))),
    withClient((gc) => safe('weight', () => gc.getDailyWeightInPounds(today))),
    withClient((gc) => safe('hydration', () => gc.getDailyHydration(today))),
  ]);

  return {
    fetchedAt: today.toISOString(),
    profile: pickProfile(profile),
    todaySteps: steps,
    sleep: summarizeSleep(sleep),
    sleepDuration,
    heartRate: summarizeHeartRate(heartRate),
    recentActivities: summarizeActivities(activities),
    weightLbs,
    hydrationOz,
    dataNotes:
      'No dedicated food/nutrition endpoint is available from Garmin Connect unless the user logs meals through a connected app (e.g. MyFitnessPal); calorie-in data is not included here. Use weight trend, calories burned (from activities), and general sports-nutrition knowledge for food-related answers, and say plainly when specific food-log data is missing.',
  };
}
