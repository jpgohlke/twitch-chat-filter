# Twitch.TV Chat Filter

A Javascript userscript to filter chat commands and other spam from the chat on the [Twitch Plays Pokemon stream](http://www.twitch.tv/twitchplayspokemon)

## Installing the script using Greasemonkey (Firefox)

Installing the userscript via Greasemonkey will automatically run it everytime you visit the TPP stream.

1. Install the [Greasemonkey extension](https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/) for Firefox.

2. Click this link to navigate to the script URL: https://raw.github.com/jpgohlke/twitch-chat-filter/master/chat_filter.user.js

3. Greasemonkey will detect the userscript and ask what to do with it. Tell it to "Install" the script.

4. Refresh the page TPP stream page.


## Installing the script using Tampermonkey (Chrome)

Tampermonkey lets you install userscripts in Chrome, similarly to how Greasemonkey does it in Firefox.

1. Install the [Tampermonkey extension](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo/related) for Chrome.

2. Click this link to navigate to the script URL: https://raw.github.com/jpgohlke/twitch-chat-filter/master/chat_filter.user.js

3. Greasemonkey will detect the userscript and ask confirmation on installing it. Click Ok.

4. Refresh the page TPP stream page.

## Run the script via the console (no extensions needed)

If you don't want or can't install one of the previously mentioned browser extensions, one possibility is to run the script via the developer console. However, you will need to rerun the script every time you refresh the stream.

1. On the TPP stream page, open your broser's developer console.
 
    * On Firefox, press `Ctrl` + `Shift` + `K`
    * On Chrome, press `Ctrl` + `Shift` + `J`
    * On Safari, press `Ctrl` + `Alt` + `I`
    * On IE9+, press `F12`
    * On Opera, press `Ctrl` + `Shift` + `I`
    
    If you are having trouble opening your console, try reading the in depth explanation [here](http://webmasters.stackexchange.com/questions/8525/how-to-open-the-javascript-console-in-different-browsers)
    
2. Navigate to the userscript URL:  https://raw.github.com/jpgohlke/twitch-chat-filter/master/chat_filter.user.js

3. Copy everything with `Ctrl` + `A` and paste it into the developer console on the TPP page.

4. Press `Enter` to run the code.

## Developers

All changes should be made in `chat_filter.user.js` from now on.  Please try to ensure that your changes work in both the console and with the UserScript.

Update the compressed (minified) version whenever you make a substantive update.  No need for small things like formatting or comments, obviously.
