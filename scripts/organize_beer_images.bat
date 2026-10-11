@echo off
cd /d "%~dp0\.."

if not exist "images\beer\be" mkdir "images\beer\be"
if not exist "images\beer\world" mkdir "images\beer\world"

echo Copie et renommage des images...

:: Houppe (BE)
copy /Y "images\beer\notadded\houppe-classic-33-cl-.jpg" "images\beer\be\houppe-classic-33cl.jpg"
copy /Y "images\beer\notadded\houppe baden.png" "images\beer\be\houppe-baden-skiffle-ipa-33cl.png"
copy /Y "images\beer\notadded\houppe zero.png" "images\beer\be\houla-houppe-sans-alcool-33cl.png"
copy /Y "images\beer\notadded\houppe pils-canette.avif" "images\beer\be\houppe-slip-pils-canette-33cl.avif"
copy /Y "images\beer\notadded\Jambes en l'air - carton de 24 x 33cl.png" "images\beer\be\houppe-jambes-en-lair-blonde-33cl.png"

:: Soultrip / Good Souls Club (BE)
copy /Y "images\beer\notadded\Soultrip-triple-blonde.png" "images\beer\be\soultrip-triple-blonde-33cl.png"
copy /Y "images\beer\notadded\Soultrip-pale-IPA.png" "images\beer\be\soultrip-soulflower-pale-ipa-33cl.png"
copy /Y "images\beer\notadded\Soultrip-wheat-beer.png" "images\beer\be\soultrip-soulshine-wheat-beer-33cl.png"

:: Mythos (World)
copy /Y "images\beer\notadded\mythos_lager.png" "images\beer\world\mythos-hellenic-lager-33cl.png"
copy /Y "images\beer\notadded\mythos0_0_bottle_front.png" "images\beer\world\mythos-0-0-sans-alcool-33cl.png"
copy /Y "images\beer\notadded\mythos_ice_bottle_new.png" "images\beer\world\mythos-ice-lager-33cl.png"
copy /Y "images\beer\notadded\mythos_radler_bottle_new.png" "images\beer\world\mythos-radler-lemon-33cl.png"

echo Termine avec succes !
pause
