// ==UserScript==
// @name        Twitch Plays Pokemon Chat Filter
// @namespace   https://github.com/jpgohlke/twitch-chat-filter
// @description Hide input commands from the chat.
// @include     http://www.twitch.tv/twitchplayspokemon
// @include     http://www.twitch.tv/twitchplayspokemon/
// @version     1.3
// @updateURL   https://raw.github.com/jpgohlke/twitch-chat-filter/master/chat_filter.user.js
// @grant       unsafeWindow
// ==/UserScript==

/*
 * Permission is hereby granted, free of charge, to any person obtaining a copy 
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights 
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell 
 * copies of the Software, and to permit persons to whom the Software is furnished 
 * to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in all 
 * copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A 
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT 
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION 
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE 
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/* 
 * chat_filter.user.js
 *
 * Feel free to review/compress it yourself; good internet security is important!
 * Passes http://www.jshint.com on default settings
 * Contributors:
 *     /u/RenaKunisaki
 *     /u/smog_alado 
 *     /u/SRS-SRSLY
 *     /u/schrobby
 *     /u/red_agent
 *     /u/DeathlyDeep
 *     /u/jeff_gohlke
 *     /u/yankjenets
 *     /u/hugomg
 *     /u/MKody
 */

/* global unsafeWindow:false */


(function(){
"use strict";


// --- Script configuration ---
var COMMAND_WORDS = [
    //Standard Commands
    "left", "right", "up", "down", "start", "select", "a", "b", "democracy", "anarchy"
];

var BLOCKED_WORDS = [
    //Other spam
    "oligarchy", "bureaucracy", "monarchy", "alt f4"
];

var MINIMUM_MESSAGE_LENGTH = 3; // For Kappas and other short messages.
var MAXIMUM_NON_ASCII_CHARACTERS = 2; // For donger smilies, etc
var MINIMUM_DISTANCE_ERROR = 2; // Number of insertions / deletions / substitutions away from a blocked word.

// --- Greasemonkey loading ---

//Greasemonkey userscripts run in a separate environment and cannot use
//global variables from the page directly. We needd to access them via unsafeWindow
var myWindow;
try{
    myWindow = unsafeWindow;
}catch(e){
    myWindow = window;
}

var $ = myWindow.jQuery;
    
// --- Filtering ---

//This regex recognizes messages that contain exactly a chat command,
//without any extra words around. This includes compound democracy mode
//commands like `up2left4` and `start9`.
// (remember to escape the backslashes when building a regexes from strings!)
var command_regex = new RegExp("^((" + COMMAND_WORDS.join("|") + ")\\d?)+$", "i");
var spam_regex = new RegExp("^((" + BLOCKED_WORDS.join("|") + ")\\d?)+$", "i");

// Adapted from https://gist.github.com/andrei-m/982927
// Compute the edit distance between the two given strings
function min_edit(a, b) {
    
    if(a.length === 0) return b.length; 
    if(b.length === 0) return a.length; 
 
    var matrix = [];
 
    // increment along the first column of each row
    for(var i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
 
    // increment each column in the first row
    for(var j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
 
    // Fill in the rest of the matrix
    for(var i = 1; i <= b.length; i++) {
        for(var j = 1; j <= a.length; j++) {
            if(b.charAt(i-1) == a.charAt(j-1)){
                matrix[i][j] = matrix[i-1][j-1];
            } else {
                matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, // substitution
                                        Math.min(matrix[i][j-1] + 1, // insertion
                                                 matrix[i-1][j] + 1)); // deletion
            }
        }
    }
 
    return matrix[b.length][a.length];
}

var is_message_command = function(message){
    
    //Ignore spaces
    message = message.replace(/\s/g, '');
    
    //Filter messages identified as commands 
    if(message.match(command_regex)) {
        return true;
    }
    
    //Find and filter common misspellings
    //Maps distance function across all blocked words, and then takes the minimum integer in the array
    var min_cmd_distance = 
        COMMAND_WORDS
        .map(function(word){ return min_edit(word, message) })
        .reduce(function(x,y,i,arr){ return Math.min(x,y) });
    if(min_cmd_distance <= MINIMUM_DISTANCE_ERROR) {
        return true;
    }
    
    //If we get to here the message isn't a command
    return false;
};

var is_message_spam = function(message){

    //Ignore spaces
    message = message.replace(/\s/g, '');
    
    //Filter needlessly short messages
    if((message.length < MINIMUM_MESSAGE_LENGTH)) {
        return true;
    }
    
    //Filter messages identified as spam 
    if(message.match(spam_regex)) {
        return true;
    }
    
    //Filter messages with too many non-ASCII characters
    var nonASCII = 0;
    for(var i = 0; i < message.length; i++) {
        if(message.charCodeAt(i) > 127) {
            nonASCII++;
            if(nonASCII > MAXIMUM_NON_ASCII_CHARACTERS){
                return true;
            }
        }
    }
    
    //Find and filter common misspellings
    //Maps distance function across all blocked words, and then takes the minimum integer in the array
    var min_spam_distance = 
        BLOCKED_WORDS
        .map(function(word){ return min_edit(word, message) })
        .reduce(function(x,y,i,arr){ return Math.min(x,y) });
    if(min_spam_distance < MINIMUM_DISTANCE_ERROR) {
        return true;
    }
    
    //If we've gotten here, then we've passed all of our tests; the message is valid
    return false;
};

// --- UI ---

var initialize_ui = function(){

    $(
        "<style type='text/css' >" +
            ".segmented_tabs li li a.SpamToggle {" +
                "width: 35px;" +
                "padding-left: 15px;" +
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
            "#chat_line_list.showSpam li.cSpam,"  + // show spam if it is toggled on
            "#chat_line_list.showSafe li.cSafe {" + // show text if it is enabled
                "display:inherit;" +
            "}" +
        " </style>"
    ).appendTo("head");


    // Reduce the width of the chat button to fit the extra buttons we will add.
    var chat_button = $("ul.segmented_tabs li a").first();
    chat_button.css("width", chat_button.width() - 71);
    
    // Add a pair of buttons to toggle the spam on and off.
    $("<li><a class='SpamToggle'>Spam</a><a class='ChatToggle'>Talk</a></li>").insertAfter(chat_button);

    $(".SpamToggle").click(function () {
        $(this).toggleClass("selected");
        $("#chat_line_list").toggleClass("showSpam");
    });
    
    $(".ChatToggle").click(function () {
        $(this).toggleClass("selected");
        $("#chat_line_list").toggleClass("showSafe");
    }).click(); // Simulate a click on ChatToggle so it starts in the "on" position.
};

// --- Main ---

var initialize_filter = function(){
    
    var CurrentChat = myWindow.CurrentChat;
    
    //The spam commands still push chat messages out the queue so we 
    //increase the buffer size from the default 150 so chat messages
    //last a bit longer.
    CurrentChat.line_buffer = 800;
    
    // Add classes to existing chat lines (when loaded from console)
    $('#chat_line_list li').each(function() {
        var chatLine = $(this);
        var chatText = chatLine.find(".chat_line").text();
        var chatClass;
        if (is_message_command(chatText)) {
            chatClass = "cCmd";
        }
        else if (is_message_spam(chatText)) {
            chatClass = "cSpam";
        }
        else {
            chatClass = "cSafe";
        }
        
        chatLine.addClass(chatClass);
    });
    
    // Add classes to new chat lines
    var _insert_chat_line = CurrentChat.insert_chat_line;
    CurrentChat.insert_chat_line = function(e){
        // Call original
        _insert_chat_line.call(this, e);
        // The original calls insert_with_lock, which adds
        // an insert operation to a queue
        // Retrieve this last operation from the queue
        var queueOp = this.queue[this.queue.length-1];
        // Add a class by modifying the operation
        var chatClass;
        if (is_message_command(e.message)) {
            chatClass = "cCmd";
        }
        else if (is_message_spam(e.message)) {
            chatClass = "cSpam";
        }
        else {
            chatClass = "cSafe";
        }
        queueOp.line = queueOp.line.replace('class="', 'class="' + chatClass + ' ');
    }
    
};

$(function(){
    initialize_ui();
    
    if(myWindow.CurrentChat) {
        initialize_filter();
    } else {
        $(myWindow).on("load", function(){
            initialize_filter();
        });
    }
});
    
}());
