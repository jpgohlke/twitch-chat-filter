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
/* jshint lastsemic:true */


(function(){
"use strict";

// --- Script configuration ---

var TPP_COMMANDS = [
    "left", "right", "up", "down",
    "start", "select",
    "a", "b",
    "democracy", "anarchy",
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

// --- Filtering ---

var filters = [
  { name: 'TppFilterCommand',
    comment: "Hide commands (up, down, anarchy, etc)",
    def: true,
    predicate: message_is_command
  },
  
  { name: 'TppFilterLink',
    comment: "Hide messages with non-whitelisted URLs",
    def: true,
    predicate: message_is_forbidden_link
  },
  
  { name: 'TppFilterDonger',
    comment: "Hide dongers and ascii art. ヽ༼ຈل͜ຈ༽ﾉ",
    def: false,
    predicate: message_is_donger
  },
  
  { name: 'TppFilterSmall',
    comment: "Hide one-word messages (Kappa, \"yesss!\", etc)",
    def: false,
    predicate: message_is_small
  },
  
  { name: 'TppFilterUppercase',
    comment: "Hide ALLCAPS",
    def: false,
    predicate: message_is_uppercase
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


// --- UI ---

var initialize_ui = function(){

    var chatList = $("#chat_line_list");

    //TODO: #chat_line_list li.fromjtv

    var customCssParts = [
        "#TppControlPanel {",
            "background-color:white;",
            "position:absolute;",
            "top:0px;",
            "left:0px;",
            "z-index:999;",
        "}"
    ];
    filters.forEach(function(filter){
        var cls = filter.name;
        customCssParts.push('#chat_line_list.'+cls+' li.'+cls+'{display:none}');
    });
    
    var customStyles = document.createElement("style");
    customStyles.appendChild(document.createTextNode(customCssParts.join("")));

    var controlPanel = document.createElement("div");
    controlPanel.id = "TppControlPanel";
    
    var panelTable = document.createElement("table");
    controlPanel.appendChild(panelTable);
    
    filters.forEach(function(filter){
        var tr = document.createElement("tr");
        panelTable.appendChild(tr);
        
        var td;
        
        td = document.createElement("td");
        var ipt = document.createElement("input");
        ipt.type = "checkbox";
        ipt.checked = filter.def; // <---
        td.appendChild(ipt);
        tr.appendChild(td);
        
        td = document.createElement("td");
        td.appendChild(document.createTextNode(filter.comment)); // <---
        
        tr.appendChild(td);
        
        if(filter.def){
            chatList.addClass(filter.name);
        }
        
        $(ipt).click(function(){
            chatList.toggleClass(filter.name);
        });
        
    });
    
    document.body.appendChild(customStyles);
    document.body.appendChild(controlPanel);
};

// --- Main ---

var initialize_filter = function(){
    
    var CurrentChat = myWindow.CurrentChat;

    // Add classes to existing chat lines (when loaded from console)
    $('#chat_line_list li').each(function() {
        var chatLine = $(this);
        var chatText = chatLine.find(".chat_line").text();
        classify_message(chatText).forEach(function(cls){
          chatLine.addClass(cls);
        });
    });
    
    CurrentChat.line_buffer = 800;
    
    //Override twitch insert_with_lock_in (process message queue) function
    CurrentChat.insert_with_lock_in = function () {
        var t = this.set_currently_scrolling;
        this.set_currently_scrolling = function () {};
        var n, r, i = "",s = [];
        while (this.queue.length > 0){ 
            n = this.queue.shift();
            //If this has a message...
            if(n.linkid){
                var chatClass = classify_message(n.info.message).join(" ");
                n.line = n.line.replace('class="', 'class="' + chatClass + ' ');
                s.push({
                    info: n.info,
                    linkid: n.linkid
                });
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
    initialize_ui();
    
    //Instead of testing for the existence of CurrentChat, check if the spinner is gone.
    var chatLoadedCheck = setInterval(function () {
        if($("#chat_loading_spinner").css('display') == 'none'){
            clearInterval(chatLoadedCheck);
            initialize_filter();
        }
    }, 100);
    
});
    
}());
