@echo off
rem Daily job at 00:10 (Windows Task Scheduler: "wooz-trip TourAPI daily")
rem  1) collect auto : fetch lists/details by area priority within the daily quota (changed items only)
rem  2) build        : convert all collected areas to data/build/<area>.json
rem  3) import       : upsert changed places into Supabase as candidates (skips if 0004 not applied)
rem No LLM calls. Log: data\raw\tourapi\daily.log  (details: docs/data-plan.md)
cd /d "%~dp0..\.."
set LOG=data\raw\tourapi\daily.log
if not exist data\raw\tourapi mkdir data\raw\tourapi
echo ===== %date% %time% >> "%LOG%"
node scripts\tourapi\collect.mjs auto >> "%LOG%" 2>&1
node scripts\tourapi\build.mjs >> "%LOG%" 2>&1
node scripts\tourapi\import.mjs >> "%LOG%" 2>&1
echo. >> "%LOG%"
