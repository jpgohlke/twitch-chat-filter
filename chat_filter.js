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


// --- Script configuration ---

// Please make sure it doesn't surpass 100 columns for readability <3
// Made all line-ending commas (',\n')  on the next line.
// Simpler to add new words without getting errors from forgetting to add a comma at the end
var BLOCKED_WORDS = [
    //Standard Commands
    "left", "right", "up", "down", "start", "select", "a", "b", "democracy", "anarchy"
	
	//    "up" misspellings
    , "upu", "uo", "pu", "uup", "uip", "ip", "uyp", "upp", "upo", "uupu"
    
	//    "down" misspellings
	, "dwon", "donw", "dowm", "dow", "dowqn", "doiwn", "diwn", "ldown", "donwn", "odwn", "downm"
		, "dpwn", "downw", "downd", "dowj", "doen", "dpwm", "dopwn", "dwn", "don", "ddown", "sown"
		, "odnw"
    
	//    "left" misspellings
	, "lef", "lfet", "lefft", "letf", "leftr", "leftrt", "leftl", "lwft", "lefct", "lefet", "laft"
		, "lrfy", "seft", "kleft", "l3ft", "lfte", "etfl", "lleft"
    
	//    "right" misspellings
	, "riight", "rightr", "roght", "righ", "ight", "righr", "rigt", "dright", "girht", "rihy"
		, "eifght", "rig", "tight", "rihtg", "rihgt", "rigth"
	
	//    "start" misspellings
    , "atart", "strt", "strat", "starp"
    
	//    "anarchy" misspellings
	, "anrachy", "anrchy", "anarch", "amarchy", "anarchy'", "anaarchy", "anarhcy", "anarachy"
		, "anarchyanarchy", "anarchyvanarchy", "anarcy", "anrarchy", "anarchu", "anarcht"
    
	//    "democracy" misspellings
	, "democrazy", "demarchy", "demcracy", "democarcy", "democrasy", "democacy", "demoocracy"
		, "democary", "democravy", "demoracy", "democrazu", "demacrazy", "democrac", "deomcrazy"
		, "deomcracy", "democracydemocracy", "democracyvdemocracy", "democracu", "domecracy"
    
	//Other spam.
    , "communism", "oligarchy", "bureaucracy", "monarchy", "alt f4", "alt\\+f4", "exit", "enter"
		, "\\*\\*\\*"
];

var MINIMUM_MESSAGE_LENGTH = 3; //For Kappas and other short messages.
var MAXIMUM_NON_ASCII_CHARACTERS = 2; //For donger smilies, etc
var REFRESH_MILLISECONDS = 100;

// --- Filtering ---

//This regex recognizes messages that contain exactly a chat command,
//without any extra words around. This includes compound democracy mode
//commands like `up2left4` and `start9`.
// (remember to escape the backslashes when building a regexes from strings!)
var commands_regex = new RegExp("^((" + BLOCKED_WORDS.join("|") + ")\\d?)+$", "i");

var message_is_spam = function(msg){
    "use strict";

    //Ignore spaces
    msg = msg.replace(/\s/g, '');

    if(msg.length < MINIMUM_MESSAGE_LENGTH) return true;

    if(msg.match(commands_regex)) return true;

    var nonASCII = 0;
    for(var i = 0; i < msg.length; i++) {
        if(msg.charCodeAt(i) > 127) {
            nonASCII++;
            if(nonASCII > MAXIMUM_NON_ASCII_CHARACTERS){
                return true;
            }
        }
    }

  return false;
};

// --- UI ---

$(
    "<style type='text/css' >" +
        ".segmented_tabs li li a.CommandsToggle {" +
            "width: 50px;" +
            "padding-left: 0;" +
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


// Reduce the width of the chat button to fit the extra buttons we will add.
var chat_button = $("ul.segmented_tabs li a").first();
chat_button.css("width", chat_button.width() - 71);

// Add a pair of buttons to toggle the spam on and off.
$("<li><a class='CommandsToggle'>Commands</a><a class='ChatToggle'>Talk</a></li>").insertAfter(chat_button);

$(".CommandsToggle").click(function () {
    $(this).toggleClass("selected");
    $("#chat_line_list").toggleClass("showSpam");
});

$(".ChatToggle").click(function () {
    $(this).toggleClass("selected");
    $("#chat_line_list").toggleClass("showSafe");
// Simulate a click on ChatToggle so it starts in the "on" position.
}).click();

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
        
        if(message_is_spam(chatText)){
          chatLine.addClass("cSpam");
        }else{
          chatLine.addClass("cSafe");
        }
    });
    
    //Scroll chat appropriately
    if (CurrentChat.currently_scrolling) { 
        CurrentChat.scroll_chat(); 
    }

}, REFRESH_MILLISECONDS);
