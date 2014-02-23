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
    "oligarchy", "bureaucracy", "monarchy", "alt f4", "helix"
];

var BLOCKED_URLS = [
    "nakedjenna", "bit.ly", "bitly", "tinyurl", "teespring", "youtube.com/user", "naked-riley"
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

// Sure, only some links are spam, and it's good that the blocked url catches them.
// However, if an url is spammed in the message, its always spam, even if otherwise valid
// so test if same message has an url repeated several times.
var message_has_duplicate_url = function(message){
	
	// An URL is here defined as:
	// [http[s]://][www.]domainname.domain[/path[.filetype_like_png][?query_string]]
	// Any urls where the .domain to query (except for whats after the last '=' is equal,
	// will be considered identical.
	
	// One could probably argue that the https://domainname part can be removed since it isnt used,
	// as well as allowed to not even be there.
	// I like it though since it can be modified for different stuff easily,
	// and performance isnt important.
	var url_regex = new RegExp(
		"(?:https?\\://)?[^/\\s]*(\\.[^\\.\\s]{1,3}" // '[http[s]://][www.]ex[.]am.ple'
		+ "(?:/[^\\.\\s]+" // '[/possible/path]'
			+ "(?:\\.[^\\.\\s]{1,3})?" // '[.file]'
		+ ")?"
		+ "(?:\\?[^\\.\\s]+\\=[^\\.\\s]+" // '[?a=query]'
			+ "(?:&[^\\.\\s]+\\=[^\\.\\s]+])*" // '[&for=stuff]'
		+ ")?)"
		, "gi"); // global and case-insensitive.
	
	var urls = [];
	var regexec;
	while ((regexec = url_regex.exec(message)) !== null)
	{
		var withoutLastQueryValue = /(\S*\=)\S*?/gi.exec(regexec[1]);
		if (withoutLastQueryValue == null) {
			urls.push(regexec[1]);
		} else {
			urls.push(withoutLastQueryValue[1]);
		}
	}
	
	if (urls != null) {
		// Would have prefered finding a standard lib functino for this...
		// But credits to http://stackoverflow.com/a/7376645 for this code snippet
		// Straight forward and kinda obvious, except for the note about
		// Object.prototype.hasOwnProperty.call(urlsSoFar, url)
		var urlsSoFar = {};
		for (var i = 0; i < urls.length; ++i) {
			var url = urls[i];
			if (Object.prototype.hasOwnProperty.call(urlsSoFar, url)) {
				return true;
			}
			urlsSoFar[url] = true;
		}
	}
	
    //If we've gotten here, then we've passed all of our tests; the message is valid
    return false;
	
};

var is_message_spam = function(message){
	
	var original_message = message;
	
    //Ignore spaces
    message = message.replace(/\s/g, '');
    
	
	// Ignore one-word messages
	// not rly spam or such, but there is enough messages as is,
	// filtering out messages with low signal_per_line ratio makes sense then
	if (oneWordFilter && message === original_message) {
		return true;
	}
	
	// This is really what the definition of spamming is
	if (urlDuplicateFilter && message_has_duplicate_url(original_message)) {
		return true;
	}
    
    //Filter needlessly short messages
    if(message.length < MINIMUM_MESSAGE_LENGTH) {
        return true;
    }
    
    //Filter messages identified as spam 
    if(message.match(commands_regex)) {
        return true;
    }
    
    //Filter messages which have blocked links
    for(var i = 0; i < BLOCKED_URLS.length; i++) {
    	if(message.indexOf(BLOCKED_URLS[i]) !== -1) {
    		return true;
    	}
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
var colorDirected = false;
var allCaps = false;
var oneWordFilter = false;
var urlDuplicateFilter = false;
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
    
            ".segmented_tabs li li a.AllCapsToggle {" +
                "width: 45px;" +
                "padding-left: 5px;" +
                "padding-top: 0;" +
                "height: 8px;" +
                "line-height: 115%;" +
            "}" +
    
            ".segmented_tabs li li a.DirectedToggle {" +
                "width: 35px;" +
                "padding-left: 15px;" +
                "padding-top: 0;" +
                "height: 8px;" +
                "line-height: 115%;" +
            "}" +
    
            ".segmented_tabs li li a.OneWordFilterToggle {" +
                "width: 45px;" +
                "padding-left: 5px;" +
                "padding-top: 0;" +
                "height: 8px;" +
                "line-height: 115%;" +
            "}" +
    
            ".segmented_tabs li li a.URLDuplicateFilterToggle {" +
                "width: 48px;" +
                "padding-left: 2px;" +
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
	
	$(
        "<style type='text/css' >" +
			".chat_line_directed {" +
				"color: #0000FF;" +
				"font-weight: bold;" +
            "}" +
                       
            ".chat_line_directed_username {" +
                "color: #FF0000;" +
            "}" +
        " </style>"
    ).appendTo("head");
    
    
    // Reduce the width of the chat button to fit the extra buttons we will add.
    var chat_button = $("ul.segmented_tabs li a").first();
    chat_button.css("width", chat_button.width() - 80);
	
    var video_button = $("ul.segmented_tabs li a").last();
    video_button.css("width", video_button.width() - 80);
    
    // Add a couple of buttons to toggle the spam on and off and such
	var newButons = "<li><a class='CommandsToggle'>Commands</a>" +
					"<a class='ChatToggle'>Talk</a></li>" +
					"<li><a class='AllCapsToggle'>ALLCAPS</a>" +
					"<a class='DirectedToggle'>@user</a></li>" +
					"<li><a class='OneWordFilterToggle'>OneWord</a>" +
					"<a class='URLDuplicateFilterToggle'>URLSpam</a></li>";
	$(newButons).insertAfter(chat_button);
    
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
	
	$(".AllCapsToggle").click(function () {
        $(this).toggleClass("selected");
		allCaps = !allCaps;
		initialize_filter();
    });
	
	$(".DirectedToggle").click(function () {
        $(this).toggleClass("selected");
		colorDirected = !colorDirected;
		initialize_filter();
    }).click();  // Simulate a click on ChatToggle so it starts in the "on" position.
	
	$(".OneWordFilterToggle").click(function () {
        $(this).toggleClass("selected");
		oneWordFilter = !oneWordFilter;
		initialize_filter();
    });
	
	$(".URLDuplicateFilterToggle").click(function () {
        $(this).toggleClass("selected");
		urlDuplicateFilter = !urlDuplicateFilter;
		initialize_filter();
    }).click();  // Simulate a click on ChatToggle so it starts in the "on" position.
};

// --- Main ---

var initialize_filter = function(){
    
    var CurrentChat = myWindow.CurrentChat;

    // Add classes to existing chat lines (when loaded from console)
    $('#chat_line_list li').each(function() {
        var chatLine = $(this);
        var chatText = chatLine.find(".chat_line").text();
		
		var noallcaps = function(match, offset, string) {
			return match.toLowerCase();
		};
		if (!allCaps) {
			chatLine.find(".chat_line").text( chatText.replace(/[^a-z]+/, noallcaps) );
		}
		
		// CBA to care about scopes, so I create this function twice exactly where I need it
		var direct_message_callback = function(match, p1, p2, p3, p4, offset, string) {
		   
			var pre = p1.replace(/(.*)(@)(\w+)(.*)/i, direct_message_callback);
			if (p1 == pre) {
					pre = "<span class=\"chat_line\">" + pre + "</span>";
			}
		   
			var directed = "<span class=\"chat_line_directed\">" + p2 + "</span>";
			var username = "<span class=\"chat_line_directed_username\">" + p3 + "</span>";
			var post = "<span class=\"chat_line\">" + p4 + "</span>";
		   
			return pre + directed + username + post;
		   
		};
		var newInnerHTML = chatText.replace(/(.*)(@)(\w+)(.*)/i, direct_message_callback);
		if (colorDirected && newInnerHTML != chatText) {
			var innerHTML = $(this)["0"].innerHTML
			innerHTML = innerHTML.replace(/<span class=\"chat_line\">.*<\/span>/i, newInnerHTML);
		}
		
        var chatClass = is_message_spam(chatText) ? "cSpam" : "cSafe";
        chatLine.addClass(chatClass);
    });
	
	
    // @username coloring (cba to update to new stuff)
    var _insert_chat_line = CurrentChat.insert_chat_line;
    CurrentChat.insert_chat_line = function(e){
        
		var noallcaps = function(match, offset, string) {
			return match.toLowerCase();
		};
		if (!allCaps) {
			e.message = e.message.replace(/[^a-z]+/, noallcaps);
		}
		
        // Call original
        _insert_chat_line.call(this, e);
        // The original calls insert_with_lock, which adds
        // an insert operation to a queue
        // Retrieve this last operation from the queue
        var queueOp = this.queue[this.queue.length-1];
		
		// CBA to care about scopes, so I create this function twice exactly where I need it
		var direct_message_callback = function(match, p1, p2, p3, p4, offset, string) {
			
			var pre = p1.replace(/(.*)(@)(\w+)(.*)/i, direct_message_callback);
			if (p1 == pre) {
					pre = "<span class=\"chat_line\">" + pre + "</span>";
			}
		   
			var directed = "<span class=\"chat_line_directed\">" + p2 + "</span>";
			var username = "<span class=\"chat_line_directed_username\">" + p3 + "</span>";
			var post = "<span class=\"chat_line\">" + p4 + "</span>";
		   
			return pre + directed + username + post;
		   
		};
		var newInnerHTML = e.message.replace(/(.*)(@)(\w+)(.*)/i, direct_message_callback);
		if (colorDirected && newInnerHTML != e.message) {
			queueOp.line =
					queueOp.line.replace(/<span class=\"chat_line\">.*<\/span>/i, newInnerHTML);
		}
		 
    }
	
	
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