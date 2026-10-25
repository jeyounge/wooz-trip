@echo off
rem Runs every hour at :10 (Windows Task Scheduler: "wooz-trip TourAPI daily", changed 2026-10-25)
rem  TourAPI quota resets at midnight, so later runs only catch up if the quota is not used up yet.
rem  Blog facts read up to 100 posts per run, 2400 per day (3s per post kept, stops for the day if blocked).
rem  Golf data is fetched once a day (the midnight run).
rem  1) collect auto : TourAPI lists/details by area priority within the daily quota (changed items only)
rem  2) build        : convert all collected areas to data/build/<area>.json
rem  3) import       : upsert changed places into Supabase as candidates (needs 0004)
rem  4) blogfacts    : blog review facts for open service areas (Kakao search + robots.txt, 3s/post, stops if blocked)
rem  5) sync         : push review facts to places.review_facts (needs 0005)
rem  6) golf         : golf courses from MOIS license data, ~7 calls (needs 0007)
rem No LLM calls. Log: data\raw\tourapi\daily.log  (details: docs/data-plan.md)
cd /d "%~dp0..\.."
set LOG=data\raw\tourapi\daily.log
if not exist data\raw\tourapi mkdir data\raw\tourapi
echo ===== %date% %time% >> "%LOG%"
set BLOG_RUN_POSTS=100
set BLOG_DAILY_POSTS=2400
for /f %%h in ('powershell -NoProfile -Command "(Get-Date).Hour"') do set HOUR=%%h
node scripts\tourapi\collect.mjs auto >> "%LOG%" 2>&1
node scripts\tourapi\build.mjs >> "%LOG%" 2>&1
node scripts\tourapi\import.mjs >> "%LOG%" 2>&1
node scripts\blogfacts\run.mjs --area jeju --limit 35 >> "%LOG%" 2>&1
node scripts\blogfacts\sync.mjs >> "%LOG%" 2>&1
if "%HOUR%"=="0" node scripts\golf\collect.mjs >> "%LOG%" 2>&1
echo. >> "%LOG%"
