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

var BLOCKED_WORDS = [
    //Standard Commands
    "left", "right", "up", "down", "start", "select", "a", "b", "democracy", "anarchy",                                                
    //Other spam
    "oligarchy", "bureaucracy", "monarchy", "alt f4", "nakedjenna"
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
var commands_regex = new RegExp("^((" + BLOCKED_WORDS.join("|") + ")\\d?)+$", "i");

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

var is_message_spam = function(message){

    //Ignore spaces
    message = message.replace(/\s/g, '');
    
    //Filter needlessly short messages
    if(message.length < MINIMUM_MESSAGE_LENGTH) {
        return true;
    }
    
    //Filter messages identified as spam 
    if(message.match(commands_regex)) {
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
    var min_distance =
      BLOCKED_WORDS
      .map(function(word){ return min_edit(word, message) })
      .reduce(function(x,y,i,arr){ return Math.min(x,y) });
    if(min_distance <= MINIMUM_DISTANCE_ERROR) {
        return true;
    }

    //If we've gotten here, then we've passed all of our tests; the message is valid
    return false;
};

// --- UI ---
var showSpam = false;
var showSafe = false;
var initialize_ui = function(){

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
		showSpam = !showSpam;
    });
    
    $(".ChatToggle").click(function () {
        $(this).toggleClass("selected");
        $("#chat_line_list").toggleClass("showSafe");
		showSafe = !showSafe;
    }).click();  // Simulate a click on ChatToggle so it starts in the "on" position.
};

// --- Main ---

var initialize_filter = function(){
    
    var CurrentChat = myWindow.CurrentChat;

    // Add classes to existing chat lines (when loaded from console)
    $('#chat_line_list li').each(function() {
        var chatLine = $(this);
        var chatText = chatLine.find(".chat_line").text();
        var chatClass = is_message_spam(chatText) ? "cSpam" : "cSafe";
        chatLine.addClass(chatClass);
    });
    
	//Init new counters
	CurrentChat.spam_count = 0;
	CurrentChat.safe_count = 0;
	CurrentChat.jtv_count = 0;
	
	//Override twitch insert_with_lock_in (process message queue) function
	CurrentChat.insert_with_lock_in = function () {
        var t = this.set_currently_scrolling;
        this.set_currently_scrolling = function () {};
        var n, r, isSpam = !1,i = "",s = [];
        while (this.queue.length > 0){ 
			n = this.queue.shift();
			//If this has a message...
			if(n.linkid){
				//Test if it's spam
				isSpam = is_message_spam(n.info.message);
				//And tag it with an appropriate class
				var chatClass = isSpam ? "cSpam" : "cSafe";
				n.line = n.line.replace('class="', 'class="' + chatClass + ' ');
				s.push({
					info: n.info,
					linkid: n.linkid
				});
				//Increment the individual spam/safe counters
				if(isSpam) {n.el === "#chat_line_list" && (this.spam_count++);}
				else {n.el === "#chat_line_list" && (this.safe_count++);}
			} else if (n.el === "#chat_line_list"){
				//We keep a separate counter for these guys
				this.jtv_count++;
			}

			r && r !== n.el && ($(r).append(i), i = "");
			r = n.el;
			i += n.line;
		}
        r && $(r).append(i);
        for (var o = 0; o < s.length; o++) n = s[o], this.setup_viewer_handlers(n.info, n.linkid);
		
		//Line count should be the number of messages currently displayed
		this.line_count = this.jtv_count;
		if(showSpam){
			this.line_count += this.spam_count;
		} else if (this.spam_count > 1000) {
			//If spam is hidden, let's keep the amount of SPAM li in the DOM down to a reasonable amount
			var selected = $("#chat_line_list li.cSpam").slice(0, this.spam_count-this.line_buffer);
			this.spam_count-=selected.length;
			selected.remove();
		}
		if(showSafe){
			this.line_count += this.safe_count;
		}
		
		//If line count is > buffer (default 150), it's time to trim!
        if(this.line_count > this.line_buffer){
			//Create the jQuery selector based on current filter options
			var selector = "#chat_line_list li";
			if(showSpam){
				selector += ".cSpam, #chat_line_list li";
			}
			if(showSafe){
				selector += ".cSafe, #chat_line_list li";
			}
			selector += ".fromjtv";
			
			//Chop off the oldest messages that are displayed
			$(selector).slice(0,(this.line_count - this.line_buffer)).each(function(){
				//Scroll through each element to be deleted and decrement the appropriate counter
				if($(this).hasClass("cSpam")){
					CurrentChat.spam_count--;
				} else if ($(this).hasClass("cSafe")){
					CurrentChat.safe_count--;
				} else {
					CurrentChat.jtv_count--;
				}
			}).remove();
			this.history_ended && this.scroll_chat();
		}
        var u = this;
        setTimeout(function () {
            u.history_ended && u.scroll_chat(), u.set_currently_scrolling = t, u.appending = !1
        }, 1)
    };
};

$(function(){
    initialize_ui();
    
	//Instead of testing for the existence of CurrentChat, check if the spinner is gone.
	var chatLoadedCheck = myWindow.setInterval(function () {
		if($("#chat_loading_spinner").css('display') == 'none'){
			myWindow.clearInterval(chatLoadedCheck);
			initialize_filter();
		}
	}, 100);
	
});
    
}());
