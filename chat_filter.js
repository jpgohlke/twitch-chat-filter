/* 
 * chat_filter.js
 *
 * Feel free to review/compress it yourself; good internet security is important!
 * Compressed by http://javascriptcompressor.com.
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

//This regex recognizes messages that contain exactly a chat command,
//without any spaces or extra words before it. For democracy mode,
//we also match compound commands like `up2left4` and `start9`.
var FILTER_REGEX = /^((left|right|up|down|start|select|a|b|democracy|anarchy)\d?)+$/i;

// --- UI ---

$(
    " <style type='text/css' >                     " +
    " .segmented_tabs li li a.CommandsToggle {     " +
    "     width: 50px;                             " +
    "     padding-left: 0px;                       " +
    "     padding-top: 0;                          " +
    "     height: 8px;                             " +
    "     line-height: 115%;                       " +
    " }                                            " +
    "                                              " +
    " .segmented_tabs li li a.ChatToggle {         " +
    "     width: 35px;                             " +
    "     padding-left: 15px;                      " +
    "     padding-top: 0;                          " +
    "     height: 8px;                             " +
    "     line-height: 115%;                       " +
    " }                                            " +
    "                                              " +
    " #chat_line_list li { display:none }          " + // hide new, uncategorized messages
    "                                              " +
    " #chat_line_list li.fromjtv,                  " + // show twitch error messages
    " #chat_line_list.showSpam li.cSpam,           " + // show commands if they toggled on
    " #chat_line_list.showSafe li.cSafe {          " + // show non-commands if they are enabled
    "     display:inline;                          " +
    " }                                            " +
    " </style>                                     "
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

CurrentChat.line_buffer = 800;


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

            var chatLine = $(this);
            var chatText = chatLine.find(".chat_line").text();
			
            // Praise the Helix!
            if (chatText && !chatText.trim().match(FILTER_REGEX)) {
                chatLine.addClass("cSafe");
            } else {
                chatLine.addClass("cSpam");
            }
        });

    if (CurrentChat.currently_scrolling) { 
        CurrentChat.scroll_chat(); 
    }

}, 100);  // <- run every 100 milliseconds
