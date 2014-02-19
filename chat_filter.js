/* 
 * chat_filter.js
 *
 * Feel free to review/compress it yourself; good internet security is important!
 * Compressed by UglifyJS.
 * Passes http://www.jshint.com on default settings
 * Contributors:
 *     /u/RenaKunisaki
 *     /u/smog_alado 
 *     /u/SRS-SRSLY
 *     /u/schrobby
 *     /u/red_agent
 *     /u/DeathlyDeep
 *     /u/jeff_gohlke
 */


/* global $:false, CurrentChat:false */

// --- Filtering ---

var BLOCKED_WORDS = [
    "left", "right", "up", "down", "start", "select", "a", "b", "democracy", "anarchy",												//	Standard Commands
    "upu", "uo", "pu", "uup", "uip", "ip", 																							//	"up" misspellings
    "dwon", "donw", "dowm", "dow", "dowqn", "doiwn", "diwn", "ldown", "donwn", "odwn", "downm", "dpwn", "downw", "downd", "dowj",	//	"down" misspellings
    "lef", "lfet", "lefft", "letf", "leftr", "leftrt", "leftl", "lwft", 															//	"left" misspellings
    "riight", "rightr", "roght", "righ", "ight", "righr", "rigt", 																	//	"right" misspellings
    "anrachy", "anrchy", "anarch", "amarchy", 																						//	"anarchy" misspellings
    "democrazy", "demarchy", "demcracy", "democarcy", "democrasy", "democacy", "demoocracy", 										//	"democracy" misspellings
    "oligarchy", "bureaucracy"																										//	Other
];

//This regex recognizes messages that contain exactly a chat command,
//without any extra words before it. For democracy mode,
//we also match compound commands like `up2left4` and `start9`.
var FILTER_REGEX = new RegExp("^\s*((" + BLOCKED_WORDS.join("|") + ")\d?)+\s*$", "i");

var MINIMUM_TEXT_LENGTH = 3;
var MAXIMUM_SPECIAL_CHARACTERS = 2;
var REFRESH_MILLISECONDS = 100;

// --- UI ---

$(
    "<style type='text/css' >" +
        ".segmented_tabs li li a.CommandsToggle {" +
            "width: 50px;" +
            "padding-left: 0px;" +
            "padding-top: 0;" +
            "height: 8px;" +
            "line-height: 115%;" +
        "}" +

        ".segmented_tabs li li a.ChatToggle {" +
            "width: 35px;" +
            "padding-left: 15px;" +
            "padding-top: 0;" +
            "height: 8px;" +
            "line-height: 115%;" +
        "}" +

        "#chat_line_list li { display:none }" + // hide new, uncategorized messages

        "#chat_line_list li.fromjtv,"         + // show twitch error messages
        "#chat_line_list.showSpam li.cSpam,"  + // show commands if they toggled on
        "#chat_line_list.showSafe li.cSafe {" + // show non-commands if they are enabled
            "display:inherit;" +
        "}" +
    " </style>"
).appendTo("head");


// Reduce the width of the chat button by 71px.
// This gives enough space for a spam button width 30px with 15px margins with an extra pixel of wiggle room
var CHAT_BUTTON = $("ul.segmented_tabs li a").first();
CHAT_BUTTON.css("width", CHAT_BUTTON.width() - 71);

// Add a pair of buttons to toggle the spam on and off.
$("<li><a class='CommandsToggle'>Commands</a><a class='ChatToggle'>Talk</a></li>").insertAfter(CHAT_BUTTON);

$(".CommandsToggle").click(function () {
    $(this).toggleClass("selected");
    $("#chat_line_list").toggleClass("showSpam");
});

$(".ChatToggle").click(function () {
    $(this).toggleClass("selected");
    $("#chat_line_list").toggleClass("showSafe");
});

// Simulate a click on ChatToggle, so it starts in the "on" position.
$(".ChatToggle").click();


// --- Main ---


//The spam commands still push chat messages out the queue so we 
//increase the buffer size from the default 150 so chat messages
//last a bit longer.
CurrentChat.line_buffer = 800;

setInterval(function () {
    "use strict";

    $('#chat_line_list li:not(.cSpam):not(.cSafe)').each(function() {
    	
        var chatLine = $(this);
        var chatText = chatLine.find(".chat_line").text();
        
        // Ignore Twitch warnings
        if(chatLine.length <= 0) {
        	return;
        }
        
        // If the line is too short or matches the filter, mark it as spam
        if(chatText.length < MINIMUM_TEXT_LENGTH || chatText.match(FILTER_REGEX)) {
        	chatLine.addClass("cSpam");
        	return;
        }
        
        // If we've passed all the other tests, check if it contains too
        // many non-ASCII characters (e.g., "donger" smilies)
        var nonASCII = 0;
        for(var i = 0; i < chatText.length; i++) {
        	if(chatText.charCodeAt(i) > 127) {
        		nonASCII++;
        		if(nonASCII > MAXIMUM_SPECIAL_CHARACTERS) {
        			chatLine.addClass("cSpam");
        			return;
        		}
        	}
        }
        
        // If we've gotten here, we've passed everything; mark it as safe
        chatLine.addClass("cSafe");
    });
    
    //Scroll chat appropriately
    if (CurrentChat.currently_scrolling) { 
    	CurrentChat.scroll_chat(); 
    }

}, REFRESH_MILLISECONDS);  // <- how many milliseconds
