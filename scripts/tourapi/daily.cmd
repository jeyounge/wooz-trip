@echo off
rem Runs 3x a day at 00:10, 08:10, 16:10 (Windows Task Scheduler: "wooz-trip TourAPI daily")
rem  TourAPI quota resets at midnight, so later runs only catch up if 00:10 was missed.
rem  Blog facts read up to 300 posts per run, 900 per day.
rem  1) collect auto : TourAPI lists/details by area priority within the daily quota (changed items only)
rem  2) build        : convert all collected areas to data/build/<area>.json
rem  3) import       : upsert changed places into Supabase as candidates (needs 0004)
rem  4) blogfacts    : blog review facts for open service areas (Kakao search + robots.txt, 3s/post, stops if blocked)
rem  5) sync         : push review facts to places.review_facts (needs 0005)
rem No LLM calls. Log: data\raw\tourapi\daily.log  (details: docs/data-plan.md)
cd /d "%~dp0..\.."
set LOG=data\raw\tourapi\daily.log
if not exist data\raw\tourapi mkdir data\raw\tourapi
echo ===== %date% %time% >> "%LOG%"
node scripts\tourapi\collect.mjs auto >> "%LOG%" 2>&1
node scripts\tourapi\build.mjs >> "%LOG%" 2>&1
node scripts\tourapi\import.mjs >> "%LOG%" 2>&1
node scripts\blogfacts\run.mjs --area jeju --limit 35 >> "%LOG%" 2>&1
node scripts\blogfacts\sync.mjs >> "%LOG%" 2>&1
echo. >> "%LOG%"
