//Here is the full code for the chat toggle buttons script. Feel free to review/compress it yourself; good internet security is important!
// Original code by /u/RenaKunisaki with /u/smog_alado's excellent notes 
// Spam button by /u/SRS-SRSLY. Chat Scroll Improvement by /u/schrobby
// Dynamic regular expression and "democracy mode" by /u/red_agent
// Compressed by http://javascriptcompressor.com.
// Passes http://www.jslint.com on default settings

//Are we in a heathen's democracy?  If so, we need to block more variations.
//TODO: Dynamically toggle based on stream state?  Or just have "Democracy" and "Anarchy" buttons
var DEMOCRACY_MODE = true;

//Words to filter; easy for casual users to modify this
//Now that the democracy/anarchy feature is permanent, we may as well 
//block these words at all times.
var BLOCKED_WORDS = [
	"left",
	"right",
	"up",
	"down",
	"start",
	"select",
	"a",
	"b",
	"democracy",
	"anarchy"
];

//Build the regular expression from the above list.
//If it's not (!) a message that starts (^),
//is followed by one of the commands (up|down|...)
//and immediately ends ($), then we show the message.
//If Democracy Mode is on, we need to match things like `up2left4`
//and `start9`. Kappa
var ANARCHY_REGEX = new RegExp("^(" + BLOCKED_WORDS.join("|") + ")$", "i");
var DEMOCRACY_REGEX = new RegExp("^((" + command_regex_src + ")\\d?)+$", "i");
var FILTER_REGEX = DEMOCRACY_MODE ? DEMOCRACY_REGEX : ANARCHY_REGEX;

// Identify the chat button
var CHAT_BUTTON = $("ul.segmented_tabs li a").first();

// Add spam button after the chat button
$("<li><a class='CommandsToggle'>Commands</a><a class='ChatToggle'>Talk</a></li>").insertAfter(CHAT_BUTTON);

// Reduce the width of the chat button by 71px.
// This gives enough space for a spam button width 30px with 15px margins with an extra pixel of wiggle room
CHAT_BUTTON.css("width", CHAT_BUTTON.width() - 71);

// Spam buttons make quick and dirty css rules to turn chat spam on or off. 
$(".CommandsToggle").click(function () {
        "use strict";
        $("a.CommandsToggle").toggleClass("selected");

        if ($(".commandsHideCSS").length !== 0) {
            $(".commandsHideCSS").remove();
        } else {
            $("<style type='text/css' class='commandsHideCSS'>#chat_line_list li.cSpam{display:inline;}</style>").appendTo("head");
        }
    }
);

// Same for the Twitch Chat
$(".ChatToggle").click(function () {
        "use strict";
        $("a.ChatToggle").toggleClass("selected");

        if ($(".chatHideCSS").length !== 0) {
            $(".chatHideCSS").remove();
        } else {
            $("<style type='text/css' class='chatHideCSS'>#chat_line_list li.cSafe{display:inline;}</style>").appendTo("head");
        }
    }
);

// Simulate a click on ChatToggle, so it starts in the "on" position.
$(".ChatToggle").click();

CurrentChat.line_buffer = 800;

//This part creates a CSS rule
//that hides all chat messages by default
var extraCSS =
    " <style type='text/css' >                                " +
    " .segmented_tabs li li a.CommandsToggle {                " +
    "     width: 50px;                                        " +
    "     padding-left: 0px;                                  " +
    "     padding-top: 0;                                     " +
    "     height: 8px;                                        " +
    "     line-height: 115%;                                  " +
    " }                                                       " +
    "                                                         " +
    " .segmented_tabs li li a.ChatToggle {                    " +
    "     width: 35px;                                        " +
    "     padding-left: 15px;                                 " +
    "     padding-top: 0;                                     " +
    "     height: 8px;                                        " +
    "     line-height: 115%;                                  " +
    " }                                                       " +
    "                                                         " +
    " #chat_line_list li {                                    " +
    "     display:none;                                       " +
    " }                                                       " +
    " </style>                                                ";

$(extraCSS).appendTo("head");  // <- and adds the rule to the page

// setInterval makes this part of the code run periodically
setInterval(function () {
    "use strict";

    // The `#chat_line_list` references the chat box
    // and the `li` references the individual chat items inside it.
    // Thus, run for each chat box item,
    $('#chat_line_list li:not(.cSpam):not(.cSafe)').each(function () {

            // cLine is a reference a single line in chat.
            // cLine.text gets the chat text
            // split(':') breaks the text into the username and the message
            // [1] selects the chat message (rather than the username)
            // In this way cText is cLine's (trimmed) message.

            var cLine = $(this),
                cText = cLine.find(".chat_line").text();
			
            // Praise the Helix!
            if (cText && !cText.trim().match(FILTER_REGEX)) {
                cLine.addClass("cSafe");
            } else {
                cLine.addClass("cSpam");
            }
        });

    if (CurrentChat.currently_scrolling) { 
    	CurrentChat.scroll_chat(); 
    }

}, 100);  // <- run every 100 milliseconds
