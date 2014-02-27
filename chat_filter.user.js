// ==UserScript==
// @name        Twitch Plays Pokemon Chat Filter
// @namespace   https://github.com/jpgohlke/twitch-chat-filter
// @description Hide input commands from the chat.

// @include     http://www.twitch.tv/twitchplayspokemon
// @include     http://www.twitch.tv/twitchplayspokemon/
// @include     http://www.twitch.tv/chat/embed?channel=twitchplayspokemon&popout_chat=true

// @version     1.5
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
 *     /u/codefusion
 *	   /u/TRU3XV3T3R4N
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

// Score-based filter for "Guys, we need to beat Misty" spam.
var MISTY_SUBSTRINGS = [
    "misty",
    "guys",
    "we have to",
    "we need to",
    "beat",
	"what about"
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
var CurrentChat = null;
    
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

    var urls = message.match(CurrentChat.linkify_re);
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

var convert_allcaps = function(message) {
    //Only convert words preceded by a space, to avoid
    //converting case-sensitive URLs.
    return message.replace(/(^|\s)(\w+)/g, function(msg){ return msg.toLowerCase() });
};

function convert_copy_paste(message){
    //Replace repetitive text with only one instance of it
    //Useful for text and links where people do
    // ctrl-c ctrl-v ctrl-v ctrl-v in order to increase the
    //size of the message.
    return message.replace(/(.{4}.*?)(\s*?\1)+/g, "$1");
}

var URLDef = [ //Defining what a URL consists of.
	"http://",
	"https://",
	"www.",
	".org",
	".com",
	".net",
	".me"


];

function message_is_url(message){
	//Make the chat 'URL only mode' allowing people to click links
	//at times when the chat is too fast. Also for when people don't
	//want to read the crap being posted and are looking for links.
	for(var i = 0; i < URLDef.length; i++){
		if(message.indexOf(URLDef[i]) != -1){
			return false;
			
		}
	}
	return true;
		
}

// --- Filtering ---

var filters = [
  { name: 'TppFilterCommand',
    comment: "Commands (up, down, anarchy, etc)",
    isActive: true,
    predicate: message_is_command
  },
  
  { name: 'TppFilterLink',
    comment: "Non-whitelisted URLs",
    isActive: true,
    predicate: message_is_forbidden_link
  },
  
  { name: 'TppFilterDonger',
    comment: "Ascii art and dongers",
    isActive: false,
    predicate: message_is_donger
  },
  
  { name: 'TppFilterSmall',
    comment: "One-word messages",
    isActive: false,
    predicate: message_is_small
  },
  
  { name: 'TppFilterSpam',
    comment: 'Misty spam',
    isActive: true,
    predicate: message_is_misty
  },
  
  { 
	name: 'URLOnlyMessages',
	comment: "URL messages only",
	isActive: false,
	predicate: message_is_url
  },
];

var rewriters = [
  { name: 'TppConvertAllcaps',
    comment: "ALLCAPS to lowercase",
    isActive: true,
    rewriter: convert_allcaps
  },
  
  { name: 'TppFilterDuplicateURL',
    comment: "Copy pasted repetitions",
    isActive: true,
    rewriter: convert_copy_paste
  },
  
  
];


	




function passes_active_filters(message){
    for(var i=0; i < filters.length; i++){
        var filter = filters[i];
        if(filter.isActive && filter.predicate(message)){
            //console.log("Filter", filter.name, message);
            return false;
        }
    }
    return true;
}

function rewrite_with_active_rewriters(message){
    var newMessage = message;
    for(var i=0;  i < rewriters.length; i++){
        var rewriter = rewriters[i];
        if(rewriter.isActive){
            newMessage = (rewriter.rewriter(newMessage) || newMessage);
        }
    }
    return newMessage;
}

// --- UI ---

function initialize_ui(){

    //TODO: #chat_line_list li.fromjtv

    $("#chat_viewers_dropmenu_button").after('<a id="chat_filter_dropmenu_button" class="dropdown_glyph"><span></span><a>');
    $('#chat_filter_dropmenu_button').on('click', function(){
        $('#chat_filter_dropmenu').toggle();
    });
    
    $('#chat_filter_dropmenu_button span')
        .css('background', 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAAv0lEQVQ4jc3SIQ7CQBAF0C8rK5E9AhI5R1gccpLOn+UACARHwCO5Aq6HQHAUQsAhwJGmlNBdIOEnY18mfwb4u4hIYWaSOySnAABVrWKMt9xx97OqVlDVkbufPoAuZiYAgBBC6e5NBnJQ1eqpK5KbBKQJIZQvyyc5f4eQ3A66pJlJjLG3N3dfJr0FyUUHudZ1PUtCWls9IDPbJyN90OBeulHV8beg6lfQKgsSkaJ18qOZTbIgAHD3NcmdiBTZSGruBIYOSjStwb0AAAAASUVORK5CYII=)')
        .css('position', 'relative');
        
    $('#chat_speak').css('width', '149px');
    $('#controls').append('<div id="chat_filter_dropmenu" class="dropmenu menu-like" style="position:absolute; bottom:45px; display:none;"><p style="margin-left:6px">Hide:</p></div>');
    
    
    var controlPanel = $('#chat_filter_dropmenu');
    
    var customCssParts = [
        "#chat_line_list .TppFiltered {display:none;} .filter_option{font-weight:normal; margin-bottom:0; color: #B9A3E3;}"
    ];

    $('head').append('<style>' + customCssParts.join("") + '</style>');
    
    function add_option(option){
        controlPanel
        .append('<p class="dropmenu_action"><label for="' + option.name + '" class="filter_option"> <input type="checkbox" id="' + option.name + '">' + option.comment + '</label></p>');

        $('#' + option.name)
        .prop('checked', option.isActive)
        .on('change', function(){ 
            option.isActive = $(this).prop("checked");
            update_chat_with_filter(); 
        });
    }
    

    filters.forEach(add_option);
    $('#chat_filter_dropmenu').append('<p style="margin-left:6px;">Automatically rewrite:</p>');
    rewriters.forEach(add_option);
    
}


// --- Main ---

function update_chat_with_filter(){
    if(!CurrentChat) return; //Chat hasnt loaded yet.

    $('#chat_line_list li').each(function() {
        var chatLine = $(this);
        var chatText = chatLine.find(".chat_line").text();
        
        if(passes_active_filters(chatText)){ 
            chatLine.removeClass("TppFiltered");
        }else{
            chatLine.addClass("TppFiltered");
        }
    });
}

function initialize_filter(){
    CurrentChat = myWindow.CurrentChat;
    
    update_chat_with_filter();
    
    var original_insert_chat_line = CurrentChat.insert_chat_line;
    CurrentChat.insert_chat_line = function(info) {
        if(!passes_active_filters(info.message)){ return false }
        info.message = rewrite_with_active_rewriters(info.message);
        
        //console.log("----", info.message);
        
        return original_insert_chat_line.apply(this, arguments);
    };
}

$(function(){
    //Checking for the spinner being gone is a more reliable way to chack
    //if the CurrentChat is fully loaded.
    var chatLoadedCheck = setInterval(function () {
        if($("#chat_loading_spinner").css('display') == 'none'){
            clearInterval(chatLoadedCheck);
            initialize_ui();
            initialize_filter();
        }
    }, 100);
});
    
}());
