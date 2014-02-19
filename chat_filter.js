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

var HIDE_NON_ASCII_CHARACTERS = true;

//This regex recognizes messages that contain exactly a chat command,
//without any extra words before it. For democracy mode,
//we also match compound commands like `up2left4` and `start9`.
var FILTER_REGEX = /^\s*((left|right|up|down|start|select|a|b|democracy|anarchy)\d?)+\s*$/i;

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

    $('#chat_line_list li:not(.cSpam):not(.cSafe)').each(function(){
        var chatLine = $(this);
        var chatText = chatLine.find(".chat_line").text();
        if(chatLine.length > 0){ // Ignore twitch warnings
        
            //Quick and dirty hack to hide lines containing non-ASCII
            //characters (e.g., "RIOT" smilies)
            if(HIDE_NON_ASCII_CHARACTERS) {
                for(var i = 0; i < chatText.length; i++) {
                    if(chatText.charCodeAt(i) > 127) {
                        chatLine.addClass("cSpam");
                        return; //No need to check against the regex
                    }
                }
            }
        
          // Praise the Helix!
          if(chatText.match(FILTER_REGEX)){
            chatLine.addClass("cSpam");
          } else {
            chatLine.addClass("cSafe");
          }
        }
    });

    if (CurrentChat.currently_scrolling) { 
        CurrentChat.scroll_chat(); 
    }

}, 100);  // <- how many milliseconds
