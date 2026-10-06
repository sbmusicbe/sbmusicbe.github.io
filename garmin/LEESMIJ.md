# Garmin-dashboard (sbmusic.be/garmin)

Statische pagina: `index.html` leest `data.json` en schrijft de uitleg in gewone taal.
Elke ochtend vervangt een geplande Claude-taak `data.json` met verse data uit Garmin Connect (via de Garmin-connector) en commit naar `main`.

## Update-recept (datum D = vandaag)
- `sleep`, `readiness`, `hrv`: `get_sleep_summary(D)`, `get_training_readiness(D)`, `get_hrv_data(D)`
- `body_battery`, `heart`, `yesterday`: `get_user_summary(D-1)`; `stress`: `get_stress_summary(D-1)`; `body_battery.now` = huidige waarde
- `training`: `get_training_status(D)`; `intensity`: `get_weekly_intensity_minutes(D, 1)`
- `last_activity`: nieuwste uit `get_activities_by_date(D-14, D)` (geen ID's of locatie)
- `days`: `get_sleep_summary_range` + `get_stats_range` over 14 dagen (vandaag: steps/calories = null)
- `updated`: huidige tijd (ISO), `date`: D
- Schrijf het resultaat naar `garmin/data.json` (staat in .gitignore, nooit committen) en voer daarna uit: `GARMIN_PASSWORD=<wachtwoord> python3 garmin/encrypt.py`. Commit alleen `garmin/data.enc.json`.

Bewaar het schema exact zoals in het huidige `data.json`.
