// ==UserScript==
// @name        Twitch Plays Pokemon Chat Filter
// @namespace   https://github.com/jpgohlke/twitch-chat-filter
// @description Hide input commands from the chat.

// @include     http://www.twitch.tv/twitchplayspokemon
// @include     http://www.twitch.tv/twitchplayspokemon/
// @include     http://www.twitch.tv/chat/embed?channel=twitchplayspokemon&popout_chat=true
// @include     http://beta.twitch.tv/twitchplayspokemon
// @include     http://beta.twitch.tv/twitchplayspokemon/
// @include     http://beta.twitch.tv/twitchplayspokemon/chat?popout=&secret=safe

// @version     1.9
// @updateURL   http://jpgohlke.github.io/twitch-chat-filter/chat_filter.user.js
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
 *     /u/MKody
 *     /u/feha
 *     /u/jakery2
 *     /u/redopium
 *     /u/codefusion
 *     /u/Zephymastyx
 *     /u/anonveggy    
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
    "whitney",
    "milk",
    "guys",
    "we have to",
    "we need to",
    "beat",
];

var URL_WHITELIST = [
    //us
     "github.com",
    //reddit
    "reddit.com",
    "webchat.freenode.net/?channels=twitchplayspokemon",
    "sites.google.com/site/twitchplayspokemonstatus/",
    "reddit.com/live/sw7bubeycai6hey4ciytwamw3a",
    //miscelaneous
    "strawpoll.me",
    "imgur.com",
    "pokeworld.herokuapp.com",
    "strategywiki.org/wiki/Pok", //truncated before special characters
    "vgmaps.com"
];

var BANNED_WORDS = [
    "anus",
    "giveaway", "t-shirt", "hoodie",
    "imgur.com/4jlbxid.jpg"
];

var MINIMUM_DISTANCE_ERROR = 2; // Number of insertions / deletions / substitutions away from a blocked word.
var MAXIMUM_NON_ASCII_CHARACTERS = 2; // For donger smilies, etc
var MINIMUM_MESSAGE_WORDS = 2; // For Kappas and other short messages.

// The regexp Twitch uses to detect and automatically linkify URLs, with some modifications
// so we can blacklist more messages.
// - Recognizes *** in URLS (due to the Twitch chat censoring)
// - Recognizes .mx and .sh TLDs
var URL_REGEX = /\x02?((?:https?:\/\/|[\w\-\.\+]+@)?\x02?(?:[\w\-\*]+\x02?\.)+\x02?(?:com|au|org|tv|net|info|jp|uk|us|cn|fr|mobi|gov|co|ly|me|vg|eu|ca|fm|am|ws|mx|sh)\x02?(?:\:\d+)?\x02?(?:\/[\w\.\/@\?\&\%\#\(\)\,\-\+\=\;\:\x02?]+\x02?[\w\/@\?\&\%\#\(\)\=\;\x02?]|\x02?\w\x02?|\x02?)?\x02?)\x02?/g;
var CENSORED_URL = /\*\*\*[\/\?\#\%]/g;

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


function message_is_spam(message) {
    message = message.toLowerCase();

    for(var i=0; i < BANNED_WORDS.length; i++){
        if(0 <= message.indexOf(BANNED_WORDS[i])){
            return true;
        }
    }

    // Determine if message is variant of "Guys, we need to beat Misty."
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

    if(CENSORED_URL.test(message)) return true;

    var urls = message.match(URL_REGEX);
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

function message_is_cyrillic(message){
    //Some people use cyrillic characters to write spam that gets past the filter.
    return /[\u0400-\u04FF]/.test(message);
}

function convert_copy_paste(message){
    //Replace repetitive text with only one instance of it
    //Useful for text and links where people do
    // ctrl-c ctrl-v ctrl-v ctrl-v in order to increase the
    //size of the message.
    return message.replace(/(.{4}.*?)(\s*?\1)+/g, "$1");
}

// --- Filtering ---

$(function(){

//Must wait until DOM load to do feature detection
var NEW_TWITCH_CHAT = ($("button.viewers").length > 0);
//Selectors
var chatListSelector = (NEW_TWITCH_CHAT) ? '.chat-messages' : '#chat_line_list';
var chatMessageSelector = (NEW_TWITCH_CHAT) ? '.message' : '.chat_line';

//Filters have predicates that are called for every message
//to determine whether it should get dropped or not
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
    comment: 'Spam',
    isActive: true,
    predicate: message_is_spam
  },

  { name: 'TppFilterCyrillic',
    comment: 'Cyrillic characters',
    isActive: true,
    predicate: message_is_cyrillic
  }
];


//Rewriters are applied to the text of a message
//before it is inserted in the chat box
var rewriters = [
  { name: 'TppFilterDuplicateURL',
    comment: "Copy pasted repetitions",
    isActive: true,
    rewriter: convert_copy_paste
  },
];

//Stylers are CSS classes that get toggled on/off
var stylers = [
  { name: 'TppConvertAllcaps',
    comment: "Lowercase-only mode",
    isActive: true,
    element: chatListSelector,
    class: 'allcaps_filtered'
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
    var controlButton, controlPanel;
    var customCssParts = [
        chatListSelector+" .TppFiltered {display:none;}",
        chatListSelector+".allcaps_filtered "+chatMessageSelector+"{text-transform:lowercase;}"
    ];
    
    if(NEW_TWITCH_CHAT){
        // Create button
        controlButton = $('<button id="chat_filter_dropmenu_button" class="button-simple light tooltip"/>')
            .css('margin-left', '5px')
            .insertAfter('button.viewers');

        // Place filter icon on button
        controlButton
            .css('background-image', 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAAv0lEQVQ4jc3SIQ7CQBAF0C8rK5E9AhI5R1gccpLOn+UACARHwCO5Aq6HQHAUQsAhwJGmlNBdIOEnY18mfwb4u4hIYWaSOySnAABVrWKMt9xx97OqVlDVkbufPoAuZiYAgBBC6e5NBnJQ1eqpK5KbBKQJIZQvyyc5f4eQ3A66pJlJjLG3N3dfJr0FyUUHudZ1PUtCWls9IDPbJyN90OBeulHV8beg6lfQKgsSkaJ18qOZTbIgAHD3NcmdiBTZSGruBIYOSjStwb0AAAAASUVORK5CYII=)')
            .css('background-position', '3px 3px')
            .attr('original-title', 'Chat Filter');

        // Make room for extra button by shrinking the chat button
        $('.send-chat-button').css('left', '90px');

        // Create menu
        controlPanel = $('<div id="chat_filter_dropmenu" class="chat-settings chat-menu"/>')
            .css('position', 'absolute')
            .css('bottom', '38px')
            .css('display', 'none')
            .appendTo('.chat-interface');
    } else {
        // Create button
        controlButton = $('<a id="chat_filter_dropmenu_button" class="dropdown_glyph"/>')
            .insertAfter('#chat_viewers_dropmenu_button');
        
        // Place filter icon on button
        $('<span/>')
            .css('background', 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAAv0lEQVQ4jc3SIQ7CQBAF0C8rK5E9AhI5R1gccpLOn+UACARHwCO5Aq6HQHAUQsAhwJGmlNBdIOEnY18mfwb4u4hIYWaSOySnAABVrWKMt9xx97OqVlDVkbufPoAuZiYAgBBC6e5NBnJQ1eqpK5KbBKQJIZQvyyc5f4eQ3A66pJlJjLG3N3dfJr0FyUUHudZ1PUtCWls9IDPbJyN90OBeulHV8beg6lfQKgsSkaJ18qOZTbIgAHD3NcmdiBTZSGruBIYOSjStwb0AAAAASUVORK5CYII=)')
            .appendTo(controlButton);

        // Make room for extra button by shrinking the chat button
        $('#chat_speak').css('width', '149px');
        
        // Create menu
        controlPanel = $('<div id="chat_filter_dropmenu" class="dropmenu menu-like"/>')
            .css('position', 'absolute')
            .css('bottom', '45px')
            .css('display', 'none')
            .appendTo('#controls');

        // Add extra CSS styles
        customCssParts.push("#chat_filter_dropmenu .chat-menu-header{margin-left:6px;}");
        customCssParts.push("#chat_filter_dropmenu label{font-weight:normal; margin-bottom:0; color: #B9A3E3;}");
    }

    // Open menu on button click
    controlButton.on('click', function(){
        controlPanel.toggle();
    });

    // Add custom CSS styles
    $('head').append('<style>' + customCssParts.join("") + '</style>');

    // Add an option to a filter section
    function add_option(section, option, update){
        section
        .append('<p class="dropmenu_action"><label for="' + option.name + '" class="filter_option"><input type="checkbox" id="' + option.name + '"> ' + option.comment + '</label></p>');

        $('#' + option.name)
        .on('change', function(){
            option.isActive = $(this).prop("checked");
            update(option);
        })
        .prop('checked', option.isActive);
    }
    
    // Add an filter option section
    function add_section(name, options, update){
        var header = $('<div class="chat-menu-header"/>')
            .html(name)
            .appendTo(controlPanel);
        var section = $('<div class="chat-menu-content"/>')
            .appendTo(controlPanel);
        options.forEach(function(option){
            add_option(section, option, update);
        });
    }
    
    function update_css(styler){
        if(styler.isActive){
            $(styler.element).addClass(styler.class);
        }else{
            $(styler.element).removeClass(styler.class);
        }
    }
    stylers.forEach(update_css);
    
    add_section("Hide", filters, update_chat_with_filter);
    add_section("Automatically rewrite", rewriters, function(){});
    add_section("Style", stylers, update_css);
}


// --- Main ---

function update_chat_with_filter(){

    $((NEW_TWITCH_CHAT) ? '.chat-line' : '#chat_line_list li').each(function() {
        var chatLine = $(this);
        var chatText = chatLine.find(chatMessageSelector).text().trim();

        if(passes_active_filters(chatText)){
            chatLine.removeClass("TppFiltered");
        }else{
            chatLine.addClass("TppFiltered");
        }
    });
}

function initialize_filter(){
    var original_insert_chat_line;
    var original_send_message;
    function filtered_addMessage(info) {
        //check for new chat message time limit in admin messages
        if(is_admin_message(info)){ check_for_time_limit(info.message) }
        
        if(!passes_active_filters(info.message)){ return false }
        info.message = rewrite_with_active_rewriters(info.message);
        return original_insert_chat_line.apply(this, arguments);
    }
    
    function filtered_send(arg){
        if(input_disabled) return false;
        current_input = $(textarea_elem).val();
        update_user_input();
        return original_send_message.apply(this, arguments);
    }
    
    function is_admin_message(info){
        return NEW_TWITCH_CHAT ? info.style == "admin" : info.sender == "jtv"
    }
    
    if(NEW_TWITCH_CHAT){
        //BetterTTV has its own chat handlers
        if((typeof(myWindow.BetterTTV)!=='undefined')){
            var bttv = myWindow.BetterTTV.chat;
            original_insert_chat_line = bttv.handlers.privmsg;
            bttv.handlers.privmsg = filtered_addMessage;
            original_send_message = bttv.helpers.sendMessage;
            bttv.helpers.sendMessage = filtered_send;
        }else{
            var Room_proto = myWindow.App.Room.prototype;
            original_insert_chat_line = Room_proto.addMessage;
            Room_proto.addMessage = filtered_addMessage;
            original_send_message = Room_proto.send;
            Room_proto.send = filtered_send;
        }
    }else{
        var Chat_proto = myWindow.Chat.prototype;
        original_insert_chat_line = Chat_proto.insert_chat_line;
        Chat_proto.insert_chat_line = filtered_addMessage;
        original_send_message = Chat_proto.chat_say;
        Chat_proto.chat_say = filtered_send;
    }
    update_chat_with_filter();
}

var last_input = false;
var input_time_limit = 20;
var same_input_time_limit = 30;
var input_countdown = 0;
var same_input_countdown = 0;
var interval_id;
var current_input = "";
var input_disabled;
var textarea_elem;
var button_elem;
if(NEW_TWITCH_CHAT){
    button_elem = ".send-chat-button button";
    textarea_elem = ".ember-text-area";
}else{
    button_elem = "#chat_speak";
    textarea_elem = "#chat_text_input";
}
var original_button_style = $(button_elem).css("background");


function countdown_input(){
    input_countdown -= 1;
    same_input_countdown -= 1;
    update_button();
    //Only clear Interval if *both* countdowns hit 0
    //Potentially, the user might pass the regular 20 second limit, then enter his old message and get the 30 second countdown back
    //I am not overthinking this, am I?
    if(input_countdown <= 0 && same_input_countdown <= 0){
        clearInterval(interval_id);
        input_disabled = false;
    }
}

function update_button(){
    var is_same_input = $(textarea_elem).val() == last_input;
    var relevant_countdown = is_same_input ? same_input_countdown : input_countdown;
    var button = $(button_elem);
    if(relevant_countdown <= 0)
    {
        button
        .text("Chat")
        .css("background",original_button_style)
        .removeAttr("disabled");
        input_disabled = false;
    }
    else
    {
        disable_button(relevant_countdown);
        var countdown_text = "Wait " + relevant_countdown + " seconds";
        if(is_same_input) countdown_text += " (repeated message)";
        button.text(countdown_text);
    }
}

function disable_button(seconds){
    var button = $(button_elem);
        button
        .css("background","#d00")
        .text("Wait " + seconds + " seconds")
        .attr("disabled", "disabled");
    input_disabled = true;
}

function get_current_input(){
    current_input = $(textarea_elem).val();
}

function update_user_input(){
    if(current_input.trim() == '') return;
    last_input = current_input;
    current_input = false;
    disable_button(input_time_limit);
    input_countdown = input_time_limit;
    same_input_countdown = same_input_time_limit;
    //clear the old interval if it's still running
    if(interval_id) clearInterval(interval_id);
    interval_id = setInterval(function(){countdown_input()}, 1000);
}

function check_for_time_limit(admin_text){
    if(/now in slow mode/.test(admin_text)){
        var regex_result = /every (\d+) second/.exec(admin_text)
        if(regex_result){
            input_time_limit = parseInt(regex_result[1]);
        }
    }
    if(/identical to the previous/.test(admin_text)){
        var regex_result = /than (\d+) second/.exec(admin_text)
        if(regex_result){
            same_input_time_limit = parseInt(regex_result[1]);
        }
    }
}

$(textarea_elem).keyup(function(e){
    if(e.keyCode != 13) update_button();
});

initialize_ui();
initialize_filter();


});

}());
