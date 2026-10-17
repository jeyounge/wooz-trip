@echo off
rem 매일 TourAPI 이어받기 → 후보 SQL 다시 만들기 (윈도우 작업 스케줄러가 00:10 에 실행)
rem 다 받은 뒤에는 호출 없이 바로 끝난다. 로그: data\raw\tourapi\daily.log
cd /d "%~dp0..\.."
set LOG=data\raw\tourapi\daily.log
if not exist data\raw\tourapi mkdir data\raw\tourapi
echo ===== %date% %time% >> "%LOG%"
node scripts\tourapi\collect.mjs detail >> "%LOG%" 2>&1
node scripts\tourapi\collect.mjs withtour >> "%LOG%" 2>&1
node scripts\tourapi\build.mjs >> "%LOG%" 2>&1
echo. >> "%LOG%"
