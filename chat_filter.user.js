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
 *     /u/feha
 *     /u/jakery2
 *     /u/redopium
 */

/* global unsafeWindow:false */
/* jshint lastsemic:true */


(function(){
"use strict";

// --- Script configuration ---

var TPP_COMMANDS = [
    "left", "right", "up", "down",
    "start", "select",
    "a", "b",
    "democracy", "anarchy", "wait"
];

//Words listed here will filter a message *regardless*
//of where they appear in the text
var NON_COMMAND_SPAM = [
    "misty"
];

// Score-based filter for "Guys, we need to beat Misty" spam.
var MISTY_SUBSTRINGS = [
    "misty",
    "guys",
    "we have to",
    "we need to",
    "beat"
];

var URL_WHITELIST = [
    //us
     "github.com",
    //reddit
    "reddit.com",
    "webchat.freenode.net/?channels=twitchplayspokemon",
    "sites.google.com/site/twitchplayspokemonstatus/",
    "www.reddit.com/live/sw7bubeycai6hey4ciytwamw3a",
    //miscelaneous
    "strawpoll.me",
    "imgur.com",
    "pokeworld.herokuapp.com"
];

var MINIMUM_DISTANCE_ERROR = 2; // Number of insertions / deletions / substitutions away from a blocked word.
var MAXIMUM_NON_ASCII_CHARACTERS = 2; // For donger smilies, etc
var MINIMUM_MESSAGE_WORDS = 2; // For Kappas and other short messages.

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
    
// --- Filtering predicates ---

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
                matrix[i][j] = 1 + Math.min(
                    matrix[i-1][j-1], // substitution
                    matrix[i][j-1]  , // insertion
                    matrix[i-1][j]    // deletion
                ); 
            }
        }
    }
 
    return matrix[b.length][a.length];
}

//This regex recognizes messages that contain exactly a chat command,
//without any extra words around. This includes compound democracy mode
//commands like `up2left4` and `start9`.
// (remember to escape the backslashes when building a regexes from strings!)
var compound_command_regex = new RegExp("^((" + TPP_COMMANDS.join("|") + ")\\d*)+$", "i");

function word_is_command(word){

    if(compound_command_regex.test(word)) return true;

    for(var j=0; j<TPP_COMMANDS.length; j++){
        var cmd = TPP_COMMANDS[j];
          
        if(min_edit(cmd, word) <= MINIMUM_DISTANCE_ERROR){
           return true;
        }
    }
    return false;   
}

function message_is_command(message){
    message = message.toLowerCase();
    
    var segments = message.split(/[\d\s]+/);
    
    for(var i=0; i<segments.length; i++){
        var segment = segments[i];
        if(!segment) continue;
        if(!word_is_command(segment)) return false;
    }
    
    return true;
}

// Determine if message is variant of "Guys, we need to beat Misty."
function message_is_misty(message) {
	message = message.toLowerCase();
	
	var misty_score = 0;
	for (var i = 0; i < MISTY_SUBSTRINGS.length; i++) {
	    if (message.indexOf(MISTY_SUBSTRINGS[i]) != -1) {
	        misty_score++;
	        if (misty_score > 1) {
	
	            return true;
	        }
	    }
	}
	
	return false;
}

function is_whitelisted_url(url){
    //This doesnt actually parse the URLs but it
    //should do the job when it comes to filtering.
    for(var i=0; i<URL_WHITELIST.length; i++){
        if(0 <= url.indexOf(URL_WHITELIST[i])){
            return true;
        }
    }
    return false;
}

function message_is_forbidden_link(message){
    message = message.toLowerCase();

    var urls = message.match(myWindow.CurrentChat.linkify_re);
    if(!urls) return false;
    
    for(var i=0; i<urls.length; i++){
        if(!is_whitelisted_url(urls[i])){
            return true;
        }
    }
    
    return false;
}

function message_is_donger(message){

    var nonASCII = 0;
    for(var i = 0; i < message.length; i++) {
        if(message.charCodeAt(i) > 127) {
            nonASCII++;
            if(nonASCII > MAXIMUM_NON_ASCII_CHARACTERS){
                return true;
            }
        }
    }
    return false;
}

function message_is_small(message){
    return message.split(/\s/g).length < MINIMUM_MESSAGE_WORDS;
}

function message_is_uppercase(message){
    return message.toUpperCase() === message;
}

function message_is_spam(message) {
	message = message.toLowerCase();
	for(var i = 0; i < NON_COMMAND_SPAM.length; i++) {
		if(message.indexOf(NON_COMMAND_SPAM[i]) !== -1) {
			return true;
		}
	}
	return false;
}

var message_has_duplicate_url = function(message){
	
	// An URL is here defined as:
	// [http[s]://][www.]domainname.domain[/path[.filetype_like_png][?query_string]]
	// Any urls where the .domain to query (except for whats after the last '=' is equal,
	// will be considered identical.
	
	// The commented out regex doesnt matter if included or not. Commented out since it is useless,
	// but kept as comments because it can be used if something is tweaked
	var url_regex = new RegExp( ""
//		+ "(?:https?\\://)?"			// '[http[s]://]'
//		+ "[^/\\s]*"					// '[www.ex.am]'
		+ "(\\.[^\\.\\s]{1,3}"			// '.ple'
		+ "(?:/[^\\.\\s]+"				// '[/possible/path]'
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
		 // drop last query-value, useful if the url isnt followed by a space before the next word.
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


// --- Filtering ---

var filters = [
  { name: 'TppFilterCommand',
    comment: "Commands (up, down, anarchy, etc)",
    def: true,
    predicate: message_is_command
  },
  
  { name: 'TppFilterLink',
    comment: "Non-whitelisted URLs",
    def: true,
    predicate: message_is_forbidden_link
  },
  
  { name: 'TppFilterDuplicateURL',
    comment: "Duplicate URLS",
    def: true,
    predicate: message_has_duplicate_url
  },
  
  { name: 'TppFilterDonger',
    comment: "Ascii art",
    def: false,
    predicate: message_is_donger
  },
  
  { name: 'TppFilterSmall',
    comment: "One-word messages",
    def: false,
    predicate: message_is_small
  },
  
  { name: 'TppFilterUppercase',
    comment: "ALLCAPS",
    def: false,
    predicate: message_is_uppercase
  },
  
  { name: 'TppFilterSpam',
	comment: 'Common spam (\"MISTY\")',
	def: false,
	predicate: message_is_spam
  },
 
  { name: 'TppFilterMisty',
      comment: "'Beat misty' spam. (More selective)",
      def: true,
      predicate: message_is_misty
  }
];

function classify_message(message){
    message = $.trim(message);
    
    var classes = [];
    filters.forEach(function(filter){
      if(filter.predicate(message)){
        classes.push(filter.name);
      }
    });
    return classes;
}


// GUI helper functions
var color_directed_messages = function( innerHTML, message ) {
	
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
	var newInnerHTML = message.replace(/(.*)(@)(\w+)(.*)/i, direct_message_callback);
	if (newInnerHTML != message) {
		innerHTML = innerHTML.replace(/<span class=\"chat_line\">.*<\/span>/i, newInnerHTML);
	}
	
	return innerHTML;
	
};

// converts ALLCAPS messages to lowercase
var convert_ALLCAPS = function( innerHTML, message ) {
	if (message === message.toUpperCase()) {
		var no_ALLCAPS = function(match, offset, string) {
			return match.toLowerCase();
		}
		
		return innerHTML.replace(/>.*</ig, no_ALLCAPS);
	}
	
	return innerHTML;
};


// GUI-options (modifying text/html = changing graphics. Not rly UI, but close enough)
var gui_options = [
	{ name: 'TppGUIColorDirected',
		comment: "Color Directed Messages (@Username)",
		def: true,
		customCss: [
			".chat_line_directed {",
				"color: #0000FF;",
				"font-weight: bold;",
			"}",
					   
			".chat_line_directed_username {",
				"color: #FF0000;",
			"}"
		],
		predicate: color_directed_messages
	},
	
	{ name: 'TppGUIConvertALLCAPS',
		comment: "Convert ALLCAPS to lowercase",
		def: true,
		customCss: [],
		predicate: convert_ALLCAPS
	}
];

// most converts the message somehow, but some needs access directly to the html
function perform_gui( innerHTML, message ) {
    gui_options.forEach(function(gui_option) {
		if (gui_option.def) {
			innerHTML = gui_option.predicate( innerHTML, message );
		}
	});
    return innerHTML;
}


// --- UI ---

var initialize_ui = function(){

    	//TODO: #chat_line_list li.fromjtv
	var chatList = $("#chat_line_list");

    $("#chat_viewers_dropmenu_button").after('<a id="chat_filter_dropmenu_button" class="dropdown_glyph"><span></span><a>');
	$('#chat_filter_dropmenu_button').on('click', function(){ $('#chat_filter_dropmenu').toggle();})
	$('#chat_filter_dropmenu_button span').css('background', 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAAv0lEQVQ4jc3SIQ7CQBAF0C8rK5E9AhI5R1gccpLOn+UACARHwCO5Aq6HQHAUQsAhwJGmlNBdIOEnY18mfwb4u4hIYWaSOySnAABVrWKMt9xx97OqVlDVkbufPoAuZiYAgBBC6e5NBnJQ1eqpK5KbBKQJIZQvyyc5f4eQ3A66pJlJjLG3N3dfJr0FyUUHudZ1PUtCWls9IDPbJyN90OBeulHV8beg6lfQKgsSkaJ18qOZTbIgAHD3NcmdiBTZSGruBIYOSjStwb0AAAAASUVORK5CYII=)')
		.css('position', 'relative')
		
	$('#chat_speak').css('width', '149px');
	$('#controls').append('<div id="chat_filter_dropmenu" class="dropmenu menu-like" style="position:absolute; bottom:45px; right:170px; display:none;"><p style="margin-left:6px">Hide:</p></div>')
	
	var controlPanel = $('#chat_filter_dropmenu');
	
    var customCssParts = [];
	filters.forEach(function(filter){
        var cls = filter.name;
        customCssParts.push('#chat_line_list.'+cls+' li.'+cls+'{display:none}');
    });
	
    gui_options.forEach(function(gui_option) {
        gui_option.customCss.forEach(function(cssLine) {
			customCssParts.push(cssLine);
		});
    });

	$('head').append('<style>' + customCssParts.join("") + '</style>');
    
	filters.forEach(function(filter){
		$('#chat_filter_dropmenu').append('<p class="dropmenu_action" id="' + filter.name + '-p"><input type="checkbox" id="' + filter.name + '"> ' + filter.comment +'</p>');
		$('#' + filter.name + '-p').on('click', function(){ $('#' + filter.name).prop('checked', !$('#' + filter.name).prop('checked')); });
		$('#' + filter.name).on('change', function(){ chatList.toggleClass(filter.name); }).prop('checked', filter.def);
		if(filter.def)
			chatList.addClass(filter.name);
	});
	
	$('#chat_filter_dropmenu').append('<p style="margin-left:6px;">GUI Options:</p>');
	
	gui_options.forEach(function(gui_option){
		$('#chat_filter_dropmenu').append('<p class="dropmenu_action" id="' + gui_option.name + '-p"><input type="checkbox" id="' + gui_option.name + '"> ' + gui_option.comment +'</p>');
		$('#' + gui_option.name + '-p').on('click', function(){ $('#' + gui_option.name).prop('checked', !$('#' + gui_option.name).prop('checked')); });
		$('#' + gui_option.name).on('change', function(){ chatList.toggleClass(gui_option.name); }).prop('checked', gui_option.def);
		if(gui_option.def)
			chatList.addClass(gui_option.name);
	});
};


// --- Main ---

var initialize_filter = function(){
    
    var CurrentChat = myWindow.CurrentChat;
	
    // Add classes to existing chat lines (i.e. when loaded from console)
    $('#chat_line_list li').each(function() {
        var chatLine = $(this);
        var chatText = chatLine.find(".chat_line").text();
		
		var oldHTML = $(this)[0].outerHTML;
		var newHTML = perform_gui( oldHTML, chatText );
		if (!(newHTML === oldHTML)) {
			$(this)[0].outerHTML = (oldHTML.replace('class="','style="display:none" class="original_message ')
					+ newHTML.replace('class="', 'class="modified_message '));
		}
		
        classify_message(chatText).forEach(function(cls){
			chatLine.addClass(cls);
        });
    });
    
    //Override twitch insert_with_lock_in (process message queue) function
    CurrentChat.insert_with_lock_in = function () {
        var t = this.set_currently_scrolling;
        this.set_currently_scrolling = function () {};
        var n, r, i = "",s = [];
        while (this.queue.length > 0){ 
            n = this.queue.shift();

            // n.info===undefined indicates that it's a /me message
            var splitted = $(n.line).text().trim().split(/\s/, 2);
            if(splitted.length < 2 && n.info == undefined)
                continue;
            
            var chatClass = classify_message(n.info ? n.info.message : splitted[1]).join(" ");
            n.line = n.line.replace('class="', 'class="' + chatClass + ' ');
            if(n.linkid) {
                s.push({
                    info: n.info,
                    linkid: n.linkid
                });
            }
            
            // Keep original message (hidden), and append new if gui modifies anything
            var newHTML = perform_gui( n.line, n.info ? n.info.message : splitted[1] );
            if (!(newHTML === n.line)) {
                n.line = n.line.replace('class="',
                                'style="display:none" class="original_message ')
                        + newHTML.replace('class="', 'class="modified_message ');
                this.line_count += 1;  // since newHTML is an entire new line
            }

            
            if(n.el === "#chat_line_list"){
                this.line_count += 1;
            }
            
            if(r && r !== n.el){
                $(r).append(i);
                i = "";
            }
            
            r = n.el;
            i += n.line;
        }
        
        if(r){ $(r).append(i) }
        
        for (var o = 0; o < s.length; o++){
            n = s[o];
            this.setup_viewer_handlers(n.info, n.linkid);
        }
        
        if(this.line_count > this.line_buffer){
            //Get rid of spam first
            var spamLis = $("#chat_line_list li:hidden");
            this.line_count -= spamLis.length;
            spamLis.remove();
            
            if(this.line_count > this.line_buffer){
                //All Already removed all the spam; Remove normal chat.
                var excessLis = $("#chat_line_list li:lt(" + (this.line_count - this.line_buffer) + ")");
                this.line_count -= excessLis.length;
                excessLis.remove();
            }
            
            if(this.history_ended){
                this.scroll_chat();
            }
        }
        
        var u = this;
        setTimeout(function () {
            if(u.history_ended){
                u.scroll_chat();
                u.set_currently_scrolling = t;
                u.appending = false;
            }
        }, 1);
    };
    
};

$(function(){
    
    //Instead of testing for the existence of CurrentChat, check if the spinner is gone.
    var chatLoadedCheck = setInterval(function () {
        if($("#chat_loading_spinner").css('display') == 'none'){
            clearInterval(chatLoadedCheck);
            initialize_ui();
            initialize_filter();
        }
    }, 100);
    
});
    
}());
