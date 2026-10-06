#!/usr/bin/env python3
"""Haalt Garmin-data op, bouwt het dashboard-schema en schrijft garmin/data.enc.json (versleuteld).
Env: GARMIN_TOKENS (inline token-JSON), GARMIN_PASSWORD (wachtwoord van de pagina)."""
import base64, json, os, subprocess, sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

HERE = os.path.dirname(os.path.abspath(__file__))
ENC = os.path.join(HERE, "data.enc.json")
TZ = ZoneInfo("Europe/Brussels")


def load_prev(pw):
    try:
        box = json.load(open(ENC))
        d = base64.b64decode
        key = PBKDF2HMAC(hashes.SHA256(), 32, d(box["salt"]), box["iter"]).derive(pw.encode())
        return json.loads(AESGCM(key).decrypt(d(box["iv"]), d(box["ct"]), None))
    except Exception as e:
        print("Geen vorige data:", type(e).__name__)
        return {}


def safe(name, fn, prev, errors):
    """Voer fn uit; bij een fout blijft de oude waarde staan."""
    try:
        v = fn()
        if v is not None:
            return v
    except Exception as e:
        errors.append(f"{name}: {type(e).__name__}: {e}")
    return prev


def r(x, n=1):
    return None if x is None else round(x, n)


def sleep_block(g, day):
    s = g.get_sleep_data(day)
    d = s["dailySleepDTO"]
    if not d.get("sleepTimeSeconds"):
        return None
    sc = (d.get("sleepScores") or {}).get("overall") or {}
    h = lambda k: r((d.get(k) or 0) / 3600, 2)
    return {"score": sc.get("value"), "qualifier": sc.get("qualifierKey"), "hours": h("sleepTimeSeconds"),
            "deep_h": h("deepSleepSeconds"), "light_h": h("lightSleepSeconds"), "rem_h": h("remSleepSeconds"),
            "awake_min": round((d.get("awakeSleepSeconds") or 0) / 60), "stress": r(d.get("avgSleepStress"), 0),
            "_hrv": s.get("avgOvernightHrv")}


def readiness_block(g, day):
    x = g.get_training_readiness(day)
    x = x[0] if isinstance(x, list) else x
    if not x or x.get("score") is None:
        return None
    return {"score": x["score"], "level": x.get("level"), "feedback": x.get("feedbackShort") or x.get("feedbackLong")}


def hrv_block(g, day):
    h = (g.get_hrv_data(day) or {}).get("hrvSummary")
    if not h or h.get("lastNightAvg") is None:
        return None
    b = h.get("baseline") or {}
    return {"last": h["lastNightAvg"], "weekly": h.get("weeklyAvg"), "low": b.get("balancedLow"),
            "high": b.get("balancedUpper"), "status": h.get("status")}


def training_block(g, day):
    t = g.get_training_status(day)
    vo2 = ((t.get("mostRecentVO2Max") or {}).get("generic") or {}).get("vo2MaxPreciseValue")
    latest = ((t.get("mostRecentTrainingStatus") or {}).get("latestTrainingStatusData") or {})
    dev = next(iter(latest.values()), {}) if latest else {}
    acwr = dev.get("acuteTrainingLoadDTO") or {}
    bal = ((t.get("mostRecentTrainingLoadBalance") or {}).get("metricsTrainingLoadBalanceDTOMap") or {})
    bal = next(iter(bal.values()), {}) if bal else {}
    if vo2 is None and not acwr:
        return None
    return {"status": dev.get("trainingStatusFeedbackPhrase"), "vo2max": r(vo2),
            "acute_load": round(acwr.get("dailyTrainingLoadAcute") or 0),
            "chronic_load": round(acwr.get("dailyTrainingLoadChronic") or 0),
            "optimal_min": round(acwr.get("minTrainingLoadChronic") or 0),
            "optimal_max": round(acwr.get("maxTrainingLoadChronic") or 0),
            "load_ratio": acwr.get("acwrPercent"), "balance": bal.get("trainingBalanceFeedbackPhrase")}


def intensity_block(g, day):
    w = g.get_weekly_intensity_minutes((datetime.fromisoformat(day) - timedelta(days=14)).date().isoformat(), day)
    w = sorted(w, key=lambda x: x["calendarDate"])
    tot = lambda x: (x.get("moderateValue") or 0) + (x.get("vigorousValue") or 0)
    if not w:
        return None
    return {"goal": w[-1].get("weeklyGoal") or 150, "this_week": tot(w[-1]), "last_week": tot(w[-2]) if len(w) > 1 else 0}


def activity_block(g, day):
    a = g.get_activities_by_date((datetime.fromisoformat(day) - timedelta(days=30)).date().isoformat(), day)
    if not a:
        return None
    a = sorted(a, key=lambda x: x["startTimeLocal"])[-1]
    return {"name": a.get("activityName") or "Training", "type": (a.get("activityType") or {}).get("typeKey"),
            "date": a["startTimeLocal"][:10], "distance_km": r((a.get("distance") or 0) / 1000, 2),
            "duration_min": r((a.get("duration") or 0) / 60), "avg_hr": round(a.get("averageHR") or 0),
            "max_hr": round(a.get("maxHR") or 0), "calories": round(a.get("calories") or 0)}


def main():
    pw = os.environ.get("GARMIN_PASSWORD", "")
    tokens = os.environ.get("GARMIN_TOKENS", "")
    if len(pw) < 12 or not tokens:
        sys.exit("Zet GARMIN_PASSWORD (min. 12 tekens) en GARMIN_TOKENS")
    from garminconnect import Garmin
    g = Garmin()
    g.login(tokens)
    # sla ververste tokens op voor de volgende run (via actions/cache)
    tdir = os.environ.get("GARMIN_TOKEN_DIR")
    if tdir:
        os.makedirs(tdir, exist_ok=True)
        open(os.path.join(tdir, "tokens.json"), "w").write(g.client.dumps())

    prev = load_prev(pw)
    err = []
    now = datetime.now(TZ)
    today = now.date().isoformat()
    yday = (now.date() - timedelta(days=1)).isoformat()

    sleep = safe("sleep", lambda: sleep_block(g, today), prev.get("sleep"), err)
    hrv_night = (sleep or {}).pop("_hrv", None)
    ready = safe("readiness", lambda: readiness_block(g, today), prev.get("readiness"), err)
    hrv = safe("hrv", lambda: hrv_block(g, today), prev.get("hrv"), err)
    training = safe("training", lambda: training_block(g, today), prev.get("training"), err)
    intensity = safe("intensity", lambda: intensity_block(g, today), prev.get("intensity"), err)
    activity = safe("activity", lambda: activity_block(g, today), prev.get("last_activity"), err)

    def summaries():
        y, t = g.get_user_summary(yday), g.get_user_summary(today)
        return y, t
    ys = safe("summary", summaries, None, err)
    out = dict(prev)
    if ys:
        y, t = ys
        out["yesterday"] = {"steps": y.get("totalSteps"), "step_goal": y.get("dailyStepGoal"),
                            "calories": round(y.get("totalKilocalories") or 0),
                            "active_calories": round(y.get("activeKilocalories") or 0),
                            "floors": round(y.get("floorsAscended") or 0),
                            "distance_km": r((y.get("totalDistanceMeters") or 0) / 1000, 2),
                            "spo2_avg": y.get("averageSpo2"), "spo2_low": y.get("lowestSpo2")}
        out["stress"] = {"avg": y.get("averageStressLevel"), "qualifier": y.get("stressQualifier"),
                         "rest_pct": y.get("restStressPercentage"), "low_pct": y.get("lowStressPercentage"),
                         "medium_pct": y.get("mediumStressPercentage"), "high_pct": y.get("highStressPercentage")}
        out["heart"] = {"resting": t.get("restingHeartRate") or y.get("restingHeartRate"),
                        "resting_7d": t.get("lastSevenDaysAvgRestingHeartRate") or y.get("lastSevenDaysAvgRestingHeartRate")}
        out["body_battery"] = {"wake": t.get("bodyBatteryAtWakeTime") or y.get("bodyBatteryAtWakeTime"),
                               "high": t.get("bodyBatteryHighestValue"), "low": t.get("bodyBatteryLowestValue"),
                               "now": t.get("bodyBatteryMostRecentValue"),
                               "yesterday_wake": y.get("bodyBatteryAtWakeTime")}
        days = {d["date"]: d for d in prev.get("days", [])}
        days[yday] = {**days.get(yday, {}), "date": yday, "steps": y.get("totalSteps"),
                      "calories": round(y.get("totalKilocalories") or 0)}
        days[today] = {**days.get(today, {}), "date": today, "steps": None, "calories": None}
        if sleep:
            days[today].update(sleep_score=sleep["score"], sleep_hours=sleep["hours"], hrv=hrv_night)
        out["days"] = [days[k] for k in sorted(days)][-14:]
    out.update({"updated": now.isoformat(timespec="seconds"), "date": today, "sleep": sleep,
                "readiness": ready, "hrv": hrv, "training": training, "intensity": intensity,
                "last_activity": activity})
    for k in ("sleep", "readiness", "hrv", "training", "intensity", "yesterday", "stress", "heart", "body_battery", "days"):
        if not out.get(k):
            sys.exit(f"Ontbrekende sectie '{k}' en geen oude waarde. Fouten: {err}")
    tmp = os.path.join(HERE, "data.json")
    json.dump(out, open(tmp, "w"), ensure_ascii=False)
    subprocess.run([sys.executable, os.path.join(HERE, "encrypt.py"), tmp, ENC], check=True)
    os.remove(tmp)
    for e in err:
        print("WAARSCHUWING:", e)


if __name__ == "__main__":
    main()
